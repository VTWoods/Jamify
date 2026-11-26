import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  commuteConfigs,
  commuteDailyEditions,
  commuteGenerationJobs,
  spotifyPlaylists,
  spotifySyncState,
} from "@/db/schema";
import {
  getLocalClockParts,
  WEEKDAY_NAMES,
} from "@/lib/commute-schedule-clock";
import {
  FALLBACK_GEMINI_MODEL,
  PRIMARY_GEMINI_MODEL,
} from "@/lib/gemini-recommendations";
import {
  createSpotifyPlaylistWithTracks,
  replaceSpotifyPlaylistItems,
  searchSpotifyTrack,
  spotifyFetch,
} from "@/lib/spotify";
import {
  getSpotifyAssetsSnapshot,
  syncSpotifyAssets,
} from "@/lib/spotify-sync";

export type CommuteKind = "morning" | "evening" | "discovery";

const JOB_POLL_INTERVAL_MS = 3_000;
const JOB_MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
const STALE_JOB_MS = 7 * 60 * 1000;
const RECOVERY_HEARTBEAT_GAP_MS = 15_000;
const DEFAULT_TRACK_DURATION_MS = 210_000; // 3.5 min fallback if duration_ms is absent

const globalForCommuteRunners = globalThis as typeof globalThis & {
  __jamifyCommuteRunners?: Set<string>;
};
const activeCommuteRunners =
  globalForCommuteRunners.__jamifyCommuteRunners ??
  (globalForCommuteRunners.__jamifyCommuteRunners = new Set<string>());

export interface CommuteTrackItem {
  title: string;
  artist: string;
  durationMs: number;
  spotifyUri: string | null;
  spotifyUrl: string | null;
  albumImageUrl: string | null;
}

const dayEditionSchema = z.object({
  weekday: z.number().int().min(1).max(5),
  theme: z.string().min(1),
  tracks: z
    .array(
      z.object({
        title: z.string().min(1),
        artist: z.string().min(1),
      }),
    )
    .min(10)
    .max(25),
});

const discoveryEditionSchema = z.object({
  theme: z.string().min(1),
  tracks: z
    .array(
      z.object({
        title: z.string().min(1),
        artist: z.string().min(1),
      }),
    )
    .min(10)
    .max(25),
});

export const commuteWeekOutputSchema = z.object({
  morning: z.array(dayEditionSchema).length(5),
  evening: z.array(dayEditionSchema).length(5),
  discovery: discoveryEditionSchema,
});

export type CommuteWeekOutput = z.infer<typeof commuteWeekOutputSchema>;

const DAY_EDITION_JSON_SCHEMA = {
  type: "object",
  properties: {
    weekday: {
      type: "integer",
      description: "1 for Monday, 2 for Tuesday, 3 for Wednesday, 4 for Thursday, 5 for Friday",
    },
    theme: {
      type: "string",
      description: "Short catchy subtitle for this day's edition",
    },
    tracks: {
      type: "array",
      description: "18 real songs (~60 minutes total) strictly by the user's followed artists",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          artist: { type: "string" },
        },
        required: ["title", "artist"],
      },
    },
  },
  required: ["weekday", "theme", "tracks"],
};

const COMMUTE_WEEK_JSON_SCHEMA = {
  type: "object",
  properties: {
    morning: {
      type: "array",
      description:
        "5 distinct upbeat, higher-tempo morning commute playlists (weekday 1 through 5), ~1 hour each",
      items: DAY_EDITION_JSON_SCHEMA,
    },
    evening: {
      type: "array",
      description:
        "5 distinct chill, relaxing evening commute home playlists (weekday 1 through 5), ~1 hour each",
      items: DAY_EDITION_JSON_SCHEMA,
    },
    discovery: {
      type: "object",
      description:
        "1 weekly discovery playlist (~18 new/fresh songs, ~1 hour) strictly from artists the user does NOT follow, similar to their followed artists",
      properties: {
        theme: {
          type: "string",
          description: "Short catchy subtitle for this week's discovery mix",
        },
        tracks: {
          type: "array",
          description:
            "18 real, newer/fresh songs by artists NOT in the user's followed artists list",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              artist: { type: "string" },
            },
            required: ["title", "artist"],
          },
        },
      },
      required: ["theme", "tracks"],
    },
  },
  required: ["morning", "evening", "discovery"],
};

const COMMUTE_SYSTEM_INSTRUCTION = `You are Jamify, an expert Spotify playlist curator.
Your job is to generate weekly preset playlists in one structured JSON response:
1. "morning": 5 distinct weekday editions (Monday=1 through Friday=5) of upbeat, higher-tempo, energizing music (~60 minutes / ~18 real songs each) strictly from the user's Followed Artists.
2. "evening": 5 distinct weekday editions (Monday=1 through Friday=5) of chill, relaxing, mellow music (~60 minutes / ~18 real songs each) strictly from the user's Followed Artists.
3. "discovery": 1 weekly discovery playlist (~60 minutes / ~18 real songs) featuring newer, fresh songs from artists the user does NOT follow (strictly exclude EVERY artist in their Followed Artists list) who sound similar to or complement their followed artists.

STRICT RULES:
- For "morning" and "evening", every single song MUST be by an artist in the user's Followed Artists list, with no repeated songs across the 5 weekdays.
- For "discovery", every single song MUST be by an artist NOT in the user's Followed Artists list (prioritize newer releases and fresh music discovery).
- Use real, verifiable song titles and artist names.
- Return strictly valid JSON matching the schema.`;

export function buildCommutePrompt(
  followedArtists: Array<{ name: string; genres: string[] }>,
): string {
  const artistLines = followedArtists
    .slice(0, 150)
    .map(
      (a) =>
        `- ${a.name}${a.genres.length > 0 ? ` (${a.genres.slice(0, 3).join(", ")})` : ""}`,
    )
    .join("\n");

  return `Create this week's preset playlists:
1. Morning Commute: 5 weekday playlists (Monday=1..Friday=5), upbeat & higher tempo, ~1 hour / ~18 tracks each — STRICTLY from the Followed Artists below.
2. Evening Commute: 5 weekday playlists (Monday=1..Friday=5), chill & relaxing, ~1 hour / ~18 tracks each — STRICTLY from the Followed Artists below.
3. Weekly Discovery: 1 playlist of ~18 newer/fresh songs (~1 hour) from artists I do NOT follow (EXCLUDE every artist below) that are similar to my Followed Artists to help me discover new music.

My Followed Artists:
${artistLines}

Ensure each weekday commute playlist feels fresh and distinct with minimal or zero track overlap across the 5 days, and ensure Weekly Discovery contains ONLY unfollowed artists.`;
}

export function parseCommuteWeekJson(
  rawText: string | null | undefined,
): CommuteWeekOutput {
  if (!rawText || !rawText.trim()) {
    throw new Error("Gemini returned an empty commute playlist response.");
  }
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  const parsed = JSON.parse(cleaned);
  return commuteWeekOutputSchema.parse(parsed);
}

/**
 * Keeps resolved tracks up to approximately targetMinutes (default 60 min),
 * avoiding oversized playlists while staying close to 1 hour.
 */
export function trimTracksToTargetDuration(
  tracks: CommuteTrackItem[],
  targetMinutes = 60,
): { tracks: CommuteTrackItem[]; totalDurationMs: number } {
  const targetMs = targetMinutes * 60_000;
  const minMs = Math.max(targetMs - 3 * 60_000, 30 * 60_000);
  const selected: CommuteTrackItem[] = [];
  let total = 0;

  for (const track of tracks) {
    const dur = track.durationMs > 0 ? track.durationMs : DEFAULT_TRACK_DURATION_MS;
    if (total >= minMs && total + dur > targetMs + 4 * 60_000) {
      break;
    }
    selected.push(track);
    total += dur;
    if (total >= targetMs) {
      break;
    }
  }

  return { tracks: selected, totalDurationMs: total };
}

export async function ensureCommuteConfigs(userId: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(commuteConfigs)
    .where(eq(commuteConfigs.userId, userId));

  const hasMorning = existing.some((c) => c.kind === "morning");
  const hasEvening = existing.some((c) => c.kind === "evening");
  const hasDiscovery = existing.some((c) => c.kind === "discovery");
  const now = new Date();

  if (!hasMorning) {
    await db
      .insert(commuteConfigs)
      .values({
        id: `${userId}:morning`,
        userId,
        kind: "morning",
        name: "Morning Commute",
        description:
          "Upbeat, higher-tempo tracks from artists you follow — rotated automatically each weekday at 1 AM by Jamify.",
        targetMinutes: 60,
        enabled: true,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  if (!hasEvening) {
    await db
      .insert(commuteConfigs)
      .values({
        id: `${userId}:evening`,
        userId,
        kind: "evening",
        name: "Evening Commute",
        description:
          "Chill, relaxing tracks from artists you follow — rotated automatically each weekday at 1 AM by Jamify.",
        targetMinutes: 60,
        enabled: true,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  if (!hasDiscovery) {
    await db
      .insert(commuteConfigs)
      .values({
        id: `${userId}:discovery`,
        userId,
        kind: "discovery",
        name: "Weekly Discovery",
        description:
          "Fresh songs from artists you don't follow yet, matched to your taste — refreshed weekly on Sundays at 1 AM by Jamify.",
        targetMinutes: 60,
        enabled: true,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  return db
    .select()
    .from(commuteConfigs)
    .where(eq(commuteConfigs.userId, userId));
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({ apiKey });
}

async function updateCommuteJob(
  jobId: string,
  patch: Partial<typeof commuteGenerationJobs.$inferInsert>,
) {
  const db = getDb();
  await db
    .update(commuteGenerationJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(commuteGenerationJobs.id, jobId));
}

async function pollCommuteInteraction(
  client: GoogleGenAI,
  jobId: string,
  interactionId: string,
): Promise<string> {
  const deadline = Date.now() + JOB_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const interaction = await client.interactions.get(interactionId);
    if (interaction.status === "completed") {
      if (!interaction.output_text) {
        throw new Error("Gemini commute interaction completed with no text.");
      }
      return interaction.output_text;
    }
    if (
      interaction.status === "failed" ||
      interaction.status === "cancelled"
    ) {
      const errorDetails = (
        interaction as {
          errors?: Array<{ code?: string; message?: string }>;
        }
      ).errors;
      const summary = errorDetails?.length
        ? errorDetails
            .map((e) => [e.code, e.message].filter(Boolean).join(": "))
            .join("; ")
        : "";
      throw new Error(
        summary
          ? `Gemini interaction ${interaction.status} (${summary})`
          : `Gemini interaction ${interaction.status}`,
      );
    }
    await updateCommuteJob(jobId, {
      stage: `Waiting for ${PRIMARY_GEMINI_MODEL} (${interaction.status})`,
    });
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${PRIMARY_GEMINI_MODEL}.`);
}

function isTransient503Error(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { statusCode?: number }).statusCode;
  if (status === 503) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("503") || msg.toLowerCase().includes("high demand");
}

async function createCommuteFallbackWithRetry<T>(
  jobId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const delaysMs = [4_000, 8_000, 15_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      if (attempt > 0) {
        await updateCommuteJob(jobId, {
          stage: `Generating with ${FALLBACK_GEMINI_MODEL} (retry ${attempt}/${delaysMs.length})`,
        });
      }
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient503Error(err) || attempt === delaysMs.length) {
        throw err;
      }
      const waitSec = Math.round(delaysMs[attempt] / 1000);
      await updateCommuteJob(jobId, {
        stage: `${FALLBACK_GEMINI_MODEL} busy (503) — waiting ${waitSec}s before retry ${attempt + 1}/${delaysMs.length}`,
      });
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
  throw lastErr;
}

async function runCommuteGeminiWithFallback(
  jobId: string,
  prompt: string,
  existingInteractionId?: string | null,
): Promise<{
  output: CommuteWeekOutput;
  modelUsed: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
}> {
  const client = getGeminiClient();
  const responseFormat = {
    type: "text" as const,
    mime_type: "application/json",
    schema: COMMUTE_WEEK_JSON_SCHEMA,
  };

  try {
    let interactionId = existingInteractionId ?? null;
    if (!interactionId) {
      await updateCommuteJob(jobId, {
        activeModel: PRIMARY_GEMINI_MODEL,
        stage: `Starting ${PRIMARY_GEMINI_MODEL} weekly commute generation`,
      });
      const created = await client.interactions.create({
        model: PRIMARY_GEMINI_MODEL,
        input: prompt,
        system_instruction: COMMUTE_SYSTEM_INSTRUCTION,
        response_format: responseFormat,
        background: true,
      });
      if (!created.id) {
        throw new Error("Gemini did not return an interaction ID.");
      }
      interactionId = created.id;
      await updateCommuteJob(jobId, {
        geminiInteractionId: interactionId,
        stage: `Generating Morning, Evening & Weekly Discovery playlists with ${PRIMARY_GEMINI_MODEL}`,
      });
    }

    const rawText = await pollCommuteInteraction(client, jobId, interactionId);
    const output = parseCommuteWeekJson(rawText);
    return {
      output,
      modelUsed: PRIMARY_GEMINI_MODEL,
      fallbackUsed: false,
      fallbackReason: null,
    };
  } catch (primaryErr) {
    const reason =
      primaryErr instanceof Error
        ? primaryErr.message
        : "Primary model encountered an error";
    console.warn(
      `Commute generation primary model ${PRIMARY_GEMINI_MODEL} failed for job ${jobId}, falling back to ${FALLBACK_GEMINI_MODEL}:`,
      reason,
    );

    await updateCommuteJob(jobId, {
      activeModel: FALLBACK_GEMINI_MODEL,
      fallbackUsed: true,
      fallbackReason: reason.slice(0, 300),
      geminiInteractionId: null,
      stage: `Falling back to ${FALLBACK_GEMINI_MODEL}`,
    });

    const fallbackInteraction = await createCommuteFallbackWithRetry(
      jobId,
      () =>
        client.interactions.create({
          model: FALLBACK_GEMINI_MODEL,
          input: prompt,
          system_instruction: COMMUTE_SYSTEM_INSTRUCTION,
          response_format: responseFormat,
        }),
    );

    const output = parseCommuteWeekJson(fallbackInteraction.output_text);
    return {
      output,
      modelUsed: FALLBACK_GEMINI_MODEL,
      fallbackUsed: true,
      fallbackReason: reason.slice(0, 300),
    };
  }
}

async function resolveCommuteEditionTracks(
  userId: string,
  tracks: Array<{ title: string; artist: string }>,
  targetMinutes: number,
  excludeArtistsNormalized?: Set<string>,
): Promise<{ tracks: CommuteTrackItem[]; totalDurationMs: number }> {
  const seenUris = new Set<string>();
  const resolved: CommuteTrackItem[] = [];

  for (const track of tracks) {
    if (
      excludeArtistsNormalized &&
      excludeArtistsNormalized.has(track.artist.trim().toLowerCase())
    ) {
      continue;
    }
    const match = await searchSpotifyTrack(userId, track.title, track.artist);
    if (!match?.uri || seenUris.has(match.uri)) continue;

    if (
      excludeArtistsNormalized &&
      match.artists.some((a) =>
        excludeArtistsNormalized.has(a.name.trim().toLowerCase()),
      )
    ) {
      continue;
    }

    seenUris.add(match.uri);
    resolved.push({
      title: match.name,
      artist: match.artists.map((a) => a.name).join(", "),
      durationMs: match.duration_ms ?? DEFAULT_TRACK_DURATION_MS,
      spotifyUri: match.uri,
      spotifyUrl: match.external_urls?.spotify ?? null,
      albumImageUrl: match.album?.images?.[0]?.url ?? null,
    });
  }

  return trimTracksToTargetDuration(resolved, targetMinutes);
}

async function runCommuteGenerationJob(
  jobId: string,
  userId: string,
  weekKey: string,
  existingInteractionId?: string | null,
): Promise<void> {
  if (activeCommuteRunners.has(jobId)) return;
  activeCommuteRunners.add(jobId);

  try {
    await ensureCommuteConfigs(userId);
    await updateCommuteJob(jobId, {
      status: "running",
      stage: "Loading your followed artists from Spotify",
    });

    await syncSpotifyAssets(userId, { force: false });
    const snapshot = await getSpotifyAssetsSnapshot(userId);

    if (snapshot.followedArtists.length === 0) {
      throw new Error(
        "No followed artists found yet. Follow some artists on Spotify and sync your library first.",
      );
    }

    const prompt = buildCommutePrompt(snapshot.followedArtists);
    const result = await runCommuteGeminiWithFallback(
      jobId,
      prompt,
      existingInteractionId,
    );

    const db = getDb();
    const configs = await ensureCommuteConfigs(userId);
    const morningTarget =
      configs.find((c) => c.kind === "morning")?.targetMinutes ?? 60;
    const eveningTarget =
      configs.find((c) => c.kind === "evening")?.targetMinutes ?? 60;
    const discoveryTarget =
      configs.find((c) => c.kind === "discovery")?.targetMinutes ?? 60;
    const followedNamesNormalized = new Set(
      snapshot.followedArtists.map((a) => a.name.trim().toLowerCase()),
    );

    await updateCommuteJob(jobId, {
      stage: "Matching morning commute tracks in Spotify (5 days)",
    });

    const editionRows: Array<typeof commuteDailyEditions.$inferInsert> = [];
    const now = new Date();

    for (const day of result.output.morning) {
      const { tracks, totalDurationMs } = await resolveCommuteEditionTracks(
        userId,
        day.tracks,
        morningTarget,
      );
      editionRows.push({
        id: `${userId}:${weekKey}:morning:${day.weekday}`,
        jobId,
        userId,
        weekKey,
        kind: "morning",
        weekday: day.weekday,
        theme: day.theme,
        tracksJson: JSON.stringify(tracks),
        totalDurationMs,
        createdAt: now,
      });
    }

    await updateCommuteJob(jobId, {
      stage: "Matching evening commute tracks in Spotify (5 days)",
    });

    for (const day of result.output.evening) {
      const { tracks, totalDurationMs } = await resolveCommuteEditionTracks(
        userId,
        day.tracks,
        eveningTarget,
      );
      editionRows.push({
        id: `${userId}:${weekKey}:evening:${day.weekday}`,
        jobId,
        userId,
        weekKey,
        kind: "evening",
        weekday: day.weekday,
        theme: day.theme,
        tracksJson: JSON.stringify(tracks),
        totalDurationMs,
        createdAt: now,
      });
    }

    await updateCommuteJob(jobId, {
      stage: "Matching weekly discovery tracks in Spotify",
    });

    const discoveryResolved = await resolveCommuteEditionTracks(
      userId,
      result.output.discovery.tracks,
      discoveryTarget,
      followedNamesNormalized,
    );
    editionRows.push({
      id: `${userId}:${weekKey}:discovery:0`,
      jobId,
      userId,
      weekKey,
      kind: "discovery",
      weekday: 0,
      theme: result.output.discovery.theme,
      tracksJson: JSON.stringify(discoveryResolved.tracks),
      totalDurationMs: discoveryResolved.totalDurationMs,
      createdAt: now,
    });

    const completedAt = new Date();
    db.transaction((tx) => {
      const [currentJob] = tx
        .select({ status: commuteGenerationJobs.status })
        .from(commuteGenerationJobs)
        .where(eq(commuteGenerationJobs.id, jobId))
        .all();

      if (currentJob?.status === "completed") {
        return;
      }

      for (const row of editionRows) {
        tx.insert(commuteDailyEditions)
          .values(row)
          .onConflictDoUpdate({
            target: commuteDailyEditions.id,
            set: {
              jobId: row.jobId,
              theme: row.theme,
              tracksJson: row.tracksJson,
              totalDurationMs: row.totalDurationMs,
              createdAt: row.createdAt,
            },
          })
          .run();
      }

      tx.update(commuteConfigs)
        .set({
          lastGeneratedWeekKey: weekKey,
          updatedAt: completedAt,
        })
        .where(eq(commuteConfigs.userId, userId))
        .run();

      tx.update(commuteGenerationJobs)
        .set({
          status: "completed",
          stage: "Weekly commute playlists ready",
          activeModel: result.modelUsed,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          errorMessage: null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(commuteGenerationJobs.id, jobId))
        .run();
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to generate weekly commute playlists.";
    console.error(`Commute generation job ${jobId} failed:`, err);
    await updateCommuteJob(jobId, {
      status: "failed",
      stage: "Generation failed",
      errorMessage: message,
      completedAt: new Date(),
    });
  } finally {
    activeCommuteRunners.delete(jobId);
  }
}

export async function startCommuteWeekGeneration(
  userId: string,
  options: { trigger?: "scheduled" | "manual"; weekKey?: string } = {},
) {
  await ensureCommuteConfigs(userId);
  const db = getDb();
  const clock = getLocalClockParts();
  const weekKey = options.weekKey ?? clock.sundayWeekKey;

  const [latest] = await db
    .select()
    .from(commuteGenerationJobs)
    .where(eq(commuteGenerationJobs.userId, userId))
    .orderBy(desc(commuteGenerationJobs.startedAt))
    .limit(1);

  if (
    latest &&
    (latest.status === "queued" || latest.status === "running") &&
    Date.now() - latest.updatedAt.getTime() < STALE_JOB_MS
  ) {
    if (!activeCommuteRunners.has(latest.id)) {
      void runCommuteGenerationJob(
        latest.id,
        userId,
        latest.weekKey,
        latest.geminiInteractionId,
      );
    }
    return { job: latest, alreadyRunning: true };
  }

  const jobId = crypto.randomUUID();
  const now = new Date();
  const [created] = await db
    .insert(commuteGenerationJobs)
    .values({
      id: jobId,
      userId,
      weekKey,
      trigger: options.trigger ?? "manual",
      status: "running",
      stage: "Queued weekly commute generation",
      primaryModel: PRIMARY_GEMINI_MODEL,
      activeModel: PRIMARY_GEMINI_MODEL,
      fallbackUsed: false,
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  void runCommuteGenerationJob(jobId, userId, weekKey);
  return { job: created, alreadyRunning: false };
}

export async function applyCommuteDayToSpotify(
  userId: string,
  options: {
    weekday?: number;
    dateKey?: string;
    kind?: CommuteKind;
  } = {},
) {
  const clock = getLocalClockParts();
  const targetWeekday =
    options.weekday ??
    (clock.weekday >= 1 && clock.weekday <= 5 ? clock.weekday : 1);
  const dateKey = options.dateKey ?? clock.dateKey;
  const kinds: CommuteKind[] = options.kind
    ? [options.kind]
    : ["morning", "evening"];

  const configs = await ensureCommuteConfigs(userId);
  const db = getDb();
  const applied: Array<{
    kind: CommuteKind;
    weekday: number;
    playlistId: string;
    spotifyUrl: string | null;
    trackCount: number;
  }> = [];

  for (const kind of kinds) {
    const config = configs.find((c) => c.kind === kind);
    if (!config) continue;

    const editionWeekday = kind === "discovery" ? 0 : targetWeekday;

    // Load the latest week's edition for this kind + weekday from SQLite
    const [edition] = await db
      .select()
      .from(commuteDailyEditions)
      .where(
        and(
          eq(commuteDailyEditions.userId, userId),
          eq(commuteDailyEditions.kind, kind),
          eq(commuteDailyEditions.weekday, editionWeekday),
        ),
      )
      .orderBy(desc(commuteDailyEditions.weekKey), desc(commuteDailyEditions.createdAt))
      .limit(1);

    if (!edition) {
      throw new Error(
        kind === "discovery"
          ? "No Weekly Discovery edition found yet. Generate the week's playlists first."
          : `No ${kind} commute edition found for ${WEEKDAY_NAMES[targetWeekday] ?? `day ${targetWeekday}`}. Generate the week's playlists first.`,
      );
    }

    const tracks = safeJsonParse<CommuteTrackItem[]>(edition.tracksJson, []);
    const uris = tracks
      .map((t) => t.spotifyUri)
      .filter((u): u is string => Boolean(u));

    if (uris.length === 0) {
      throw new Error(
        kind === "discovery"
          ? "No matched Spotify tracks found in the Weekly Discovery edition."
          : `No matched Spotify tracks found in the ${WEEKDAY_NAMES[targetWeekday]} ${kind} edition.`,
      );
    }

    let playlistId = config.spotifyPlaylistId;
    let spotifyUrl = config.spotifyUrl;
    const dayLabel =
      kind === "discovery"
        ? `Week of ${edition.weekKey}`
        : (WEEKDAY_NAMES[targetWeekday] ?? "Weekday");
    const description = `${config.description} (${dayLabel}: ${edition.theme})`;

    if (!playlistId) {
      const created = await createSpotifyPlaylistWithTracks(userId, {
        name: config.name,
        description,
        isPublic: false,
        trackUris: uris,
      });
      playlistId = created.id;
      spotifyUrl = created.url;
    } else {
      await replaceSpotifyPlaylistItems(userId, playlistId, uris);
      await spotifyFetch(userId, `/playlists/${encodeURIComponent(playlistId)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: config.name,
          description,
        }),
      }).catch((err) => {
        console.warn("Could not update commute playlist description:", err);
      });
    }

    const now = new Date();
    const appliedKey = kind === "discovery" ? edition.weekKey : dateKey;
    await db
      .update(commuteConfigs)
      .set({
        spotifyPlaylistId: playlistId,
        spotifyUrl,
        lastAppliedDateKey: appliedKey,
        lastAppliedWeekday: editionWeekday,
        lastAppliedAt: now,
        updatedAt: now,
      })
      .where(eq(commuteConfigs.id, config.id));

    await db
      .insert(spotifyPlaylists)
      .values({
        id: `${userId}:${playlistId}`,
        userId,
        playlistId,
        name: config.name,
        description,
        ownerId: userId,
        ownerName: "You",
        isOwnedByUser: true,
        isPublic: false,
        trackCount: uris.length,
        imageUrl: tracks.find((t) => t.albumImageUrl)?.albumImageUrl ?? null,
        spotifyUrl,
        snapshotId: null,
      })
      .onConflictDoUpdate({
        target: spotifyPlaylists.id,
        set: {
          name: config.name,
          description,
          trackCount: uris.length,
          spotifyUrl,
        },
      });

    const [plCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(spotifyPlaylists)
      .where(eq(spotifyPlaylists.userId, userId));
    await db
      .update(spotifySyncState)
      .set({
        playlistsTotal: Number(plCountRow?.count ?? 0),
        updatedAt: now,
      })
      .where(eq(spotifySyncState.userId, userId));

    applied.push({
      kind,
      weekday: editionWeekday,
      playlistId,
      spotifyUrl,
      trackCount: uris.length,
    });
  }

  return applied;
}

export async function getCommuteState(userId: string) {
  const configs = await ensureCommuteConfigs(userId);
  const db = getDb();
  const clock = getLocalClockParts();

  const [latestJob] = await db
    .select()
    .from(commuteGenerationJobs)
    .where(eq(commuteGenerationJobs.userId, userId))
    .orderBy(desc(commuteGenerationJobs.startedAt))
    .limit(1);

  if (
    latestJob &&
    (latestJob.status === "queued" || latestJob.status === "running") &&
    !activeCommuteRunners.has(latestJob.id)
  ) {
    const idleMs = Date.now() - latestJob.updatedAt.getTime();
    if (latestJob.geminiInteractionId && idleMs >= RECOVERY_HEARTBEAT_GAP_MS) {
      void runCommuteGenerationJob(
        latestJob.id,
        userId,
        latestJob.weekKey,
        latestJob.geminiInteractionId,
      );
    } else if (!latestJob.geminiInteractionId && idleMs >= STALE_JOB_MS) {
      await updateCommuteJob(latestJob.id, {
        status: "failed",
        stage: "Interrupted",
        errorMessage:
          "The previous commute generation was interrupted. Tap Generate Week Now to try again.",
        completedAt: new Date(),
      });
      latestJob.status = "failed";
    }
  }

  const [latestCompletedJob] = await db
    .select()
    .from(commuteGenerationJobs)
    .where(
      and(
        eq(commuteGenerationJobs.userId, userId),
        eq(commuteGenerationJobs.status, "completed"),
      ),
    )
    .orderBy(desc(commuteGenerationJobs.completedAt))
    .limit(1);

  const activeWeekKey = latestCompletedJob?.weekKey ?? null;
  const editionsRaw = activeWeekKey
    ? await db
        .select()
        .from(commuteDailyEditions)
        .where(
          and(
            eq(commuteDailyEditions.userId, userId),
            eq(commuteDailyEditions.weekKey, activeWeekKey),
          ),
        )
    : [];

  const editions = editionsRaw
    .map((e) => ({
      ...e,
      kind: e.kind as CommuteKind,
      tracks: safeJsonParse<CommuteTrackItem[]>(e.tracksJson, []),
    }))
    .sort((a, b) => a.weekday - b.weekday);

  return {
    schedule: {
      timeZone: clock.timeZone,
      currentDateKey: clock.dateKey,
      currentWeekday: clock.weekday,
      currentWeekKey: clock.sundayWeekKey,
      weeklyGenerationLabel: "Sundays at 1:00 AM",
      dailyRotationLabel: "Mon–Fri at 1:00 AM",
    },
    configs: configs.map((c) => ({
      ...c,
      kind: c.kind as CommuteKind,
      lastAppliedAt: c.lastAppliedAt?.toISOString() ?? null,
      updatedAt: c.updatedAt.toISOString(),
    })),
    latestJob: latestJob
      ? {
          ...latestJob,
          startedAt: latestJob.startedAt.toISOString(),
          completedAt: latestJob.completedAt?.toISOString() ?? null,
          updatedAt: latestJob.updatedAt.toISOString(),
        }
      : null,
    activeWeekKey,
    morningEditions: editions.filter((e) => e.kind === "morning"),
    eveningEditions: editions.filter((e) => e.kind === "evening"),
    discoveryEdition: editions.find((e) => e.kind === "discovery") ?? null,
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
