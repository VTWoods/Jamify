import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  recommendationJobs,
  recommendedArtists,
  recommendedPlaylists,
} from "@/db/schema";
import {
  searchSpotifyArtist,
  searchSpotifyTrack,
} from "@/lib/spotify";
import {
  getSpotifyAssetsSnapshot,
  syncSpotifyAssets,
} from "@/lib/spotify-sync";

export const PRIMARY_GEMINI_MODEL = "gemini-4-hydrogen";
export const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash-lite";

const JOB_POLL_INTERVAL_MS = 3_000;
const JOB_MAX_WAIT_MS = 4 * 60 * 1000; // 4 minutes
const STALE_JOB_MS = 6 * 60 * 1000; // 6 minutes
const RECOVERY_HEARTBEAT_GAP_MS = 15_000;

// Share active runner tracking across all Next.js route bundles in the same process
const globalForRunners = globalThis as typeof globalThis & {
  __jamifyRecommendationRunners?: Set<string>;
};
const activeRunners =
  globalForRunners.__jamifyRecommendationRunners ??
  (globalForRunners.__jamifyRecommendationRunners = new Set<string>());

export const recommendationsOutputSchema = z.object({
  artists: z
    .array(
      z.object({
        name: z.string().min(1),
        genre: z.string().min(1),
        reason: z.string().min(1),
        sampleTracks: z.array(z.string().min(1)).min(1).max(4),
      }),
    )
    .min(1)
    .max(10),
  playlists: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        vibe: z.string().min(1),
        reason: z.string().min(1),
        tracks: z
          .array(
            z.object({
              title: z.string().min(1),
              artist: z.string().min(1),
            }),
          )
          .min(5)
          .max(20),
      }),
    )
    .min(1)
    .max(6),
});

export type RecommendationsOutput = z.infer<typeof recommendationsOutputSchema>;

export interface ResolvedPlaylistTrack {
  title: string;
  artist: string;
  spotifyUri: string | null;
  spotifyUrl: string | null;
  albumImageUrl: string | null;
}

const RECOMMENDATIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    artists: {
      type: "array",
      description:
        "6 artists the user has NEVER listened to that fit their music taste.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          genre: { type: "string" },
          reason: {
            type: "string",
            description:
              "Concise 1-2 sentence explanation referencing their existing taste.",
          },
          sampleTracks: {
            type: "array",
            items: { type: "string" },
            description: "2-3 real, well-known song titles by this artist.",
          },
        },
        required: ["name", "genre", "reason", "sampleTracks"],
      },
    },
    playlists: {
      type: "array",
      description:
        "3 custom Spotify playlists curated for the user, each with 10-12 real tracks.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          vibe: { type: "string" },
          reason: { type: "string" },
          tracks: {
            type: "array",
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
        required: ["title", "description", "vibe", "reason", "tracks"],
      },
    },
  },
  required: ["artists", "playlists"],
};

const SYSTEM_INSTRUCTION = `You are Jamify, an expert music curator with encyclopedic knowledge of Spotify's catalog.
Given a listener's Spotify library (followed artists, recent listening history, liked songs, and personal playlists), recommend:
1. 6 artists the listener has NEVER listened to (strictly exclude every artist in their known artists list) who strongly match their taste.
2. 3 cohesive, creative custom playlists they can add directly to Spotify, each with 10-12 real, existing songs (mixing fresh discoveries with complementary tracks).
Always use real, verifiable artist names and song titles. Return strictly valid JSON matching the schema.`;

export function buildSpotifyTasteContext(
  snapshot: Awaited<ReturnType<typeof getSpotifyAssetsSnapshot>>,
): { prompt: string; knownArtistsNormalized: Set<string> } {
  const knownArtistsNormalized = new Set<string>();

  const addArtistNames = (raw: string) => {
    for (const part of raw.split(",")) {
      const normalized = part.trim().toLowerCase();
      if (normalized) knownArtistsNormalized.add(normalized);
    }
  };

  for (const a of snapshot.followedArtists) addArtistNames(a.name);
  for (const h of snapshot.history) addArtistNames(h.artistNames);
  for (const s of snapshot.likedSongs) addArtistNames(s.artistNames);

  const followedSummary = snapshot.followedArtists
    .slice(0, 60)
    .map(
      (a) =>
        `${a.name}${a.genres.length > 0 ? ` (${a.genres.slice(0, 3).join(", ")})` : ""}`,
    )
    .join("; ");

  const historySummary = snapshot.history
    .slice(0, 80)
    .map((h) => `${h.trackName} — ${h.artistNames}`)
    .join("\n");

  const likedSummary = snapshot.likedSongs
    .slice(0, 50)
    .map((s) => `${s.trackName} — ${s.artistNames}`)
    .join("\n");

  const playlistsSummary = snapshot.playlists
    .slice(0, 25)
    .map(
      (p) =>
        `${p.name} (${p.trackCount} tracks)${p.description ? `: ${p.description.slice(0, 120)}` : ""}`,
    )
    .join("\n");

  const knownArtistsList = [...knownArtistsNormalized].slice(0, 200).join(", ");

  const prompt = `Analyze this listener's Spotify library and generate fresh artist recommendations (artists they have NEVER listened to) and custom playlists they will love.

## Top Genres
${snapshot.summary.topGenres.join(", ") || "Not specified"}

## Followed Artists (${snapshot.summary.followedArtistsTotal} total)
${followedSummary || "None yet"}

## Recent Listening History (${snapshot.history.length} recent plays)
${historySummary || "None yet"}

## Liked Songs (sample of ${snapshot.summary.likedSongsTotal} total)
${likedSummary || "None yet"}

## Personal Playlists (${snapshot.summary.playlistsTotal} total)
${playlistsSummary || "None yet"}

## STRICT EXCLUSION LIST (do NOT recommend any of these artists in the "artists" section)
${knownArtistsList || "None"}`;

  return { prompt, knownArtistsNormalized };
}

export function parseGeminiRecommendationsJson(
  rawText: string | null | undefined,
): RecommendationsOutput {
  if (!rawText || !rawText.trim()) {
    throw new Error("Gemini returned an empty response.");
  }

  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const parsed = JSON.parse(cleaned);
  return recommendationsOutputSchema.parse(parsed);
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({ apiKey });
}

async function updateJob(
  jobId: string,
  patch: Partial<typeof recommendationJobs.$inferInsert>,
) {
  const db = getDb();
  await db
    .update(recommendationJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(recommendationJobs.id, jobId));
}

async function pollBackgroundInteraction(
  client: GoogleGenAI,
  jobId: string,
  interactionId: string,
): Promise<string> {
  const deadline = Date.now() + JOB_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const interaction = await client.interactions.get(interactionId);

    if (interaction.status === "completed") {
      if (!interaction.output_text) {
        throw new Error("Gemini background interaction completed with no text.");
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

    await updateJob(jobId, {
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

async function createFallbackWithRetry<T>(
  jobId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const delaysMs = [4_000, 8_000, 15_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      if (attempt > 0) {
        await updateJob(jobId, {
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
      await updateJob(jobId, {
        stage: `${FALLBACK_GEMINI_MODEL} busy (503) — waiting ${waitSec}s before retry ${attempt + 1}/${delaysMs.length}`,
      });
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
  throw lastErr;
}

async function runWithModelFallback(
  jobId: string,
  prompt: string,
  existingInteractionId?: string | null,
): Promise<{
  output: RecommendationsOutput;
  modelUsed: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
}> {
  const client = getGeminiClient();
  const responseFormat = {
    type: "text" as const,
    mime_type: "application/json",
    schema: RECOMMENDATIONS_JSON_SCHEMA,
  };

  // Primary attempt: gemini-4-hydrogen using native Interactions API background execution
  try {
    let interactionId = existingInteractionId ?? null;
    if (!interactionId) {
      await updateJob(jobId, {
        activeModel: PRIMARY_GEMINI_MODEL,
        stage: `Starting ${PRIMARY_GEMINI_MODEL} background analysis`,
      });

      const created = await client.interactions.create({
        model: PRIMARY_GEMINI_MODEL,
        input: prompt,
        system_instruction: SYSTEM_INSTRUCTION,
        response_format: responseFormat,
        background: true,
      });

      if (!created.id) {
        throw new Error("Gemini did not return an interaction ID.");
      }
      interactionId = created.id;
      await updateJob(jobId, {
        geminiInteractionId: interactionId,
        stage: `Analyzing your Spotify taste with ${PRIMARY_GEMINI_MODEL}`,
      });
    }

    const rawText = await pollBackgroundInteraction(
      client,
      jobId,
      interactionId,
    );
    const output = parseGeminiRecommendationsJson(rawText);
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
      `Primary model ${PRIMARY_GEMINI_MODEL} failed for job ${jobId}, falling back to ${FALLBACK_GEMINI_MODEL}:`,
      reason,
    );

    await updateJob(jobId, {
      activeModel: FALLBACK_GEMINI_MODEL,
      fallbackUsed: true,
      fallbackReason: reason.slice(0, 300),
      geminiInteractionId: null,
      stage: `Falling back to ${FALLBACK_GEMINI_MODEL}`,
    });

    const fallbackInteraction = await createFallbackWithRetry(jobId, () =>
      client.interactions.create({
        model: FALLBACK_GEMINI_MODEL,
        input: prompt,
        system_instruction: SYSTEM_INSTRUCTION,
        response_format: responseFormat,
      }),
    );

    const output = parseGeminiRecommendationsJson(
      fallbackInteraction.output_text,
    );
    return {
      output,
      modelUsed: FALLBACK_GEMINI_MODEL,
      fallbackUsed: true,
      fallbackReason: reason.slice(0, 300),
    };
  }
}

async function runRecommendationJob(
  jobId: string,
  userId: string,
  existingInteractionId?: string | null,
): Promise<void> {
  if (activeRunners.has(jobId)) return;
  activeRunners.add(jobId);

  try {
    await updateJob(jobId, {
      status: "running",
      stage: "Loading your Spotify library context",
    });

    // Ensure Spotify assets exist and are fresh before building context
    await syncSpotifyAssets(userId, { force: false });
    const snapshot = await getSpotifyAssetsSnapshot(userId);

    const hasAnySpotifyData =
      snapshot.history.length > 0 ||
      snapshot.likedSongs.length > 0 ||
      snapshot.followedArtists.length > 0 ||
      snapshot.playlists.length > 0;

    if (!hasAnySpotifyData) {
      throw new Error(
        "No Spotify assets found yet. Sync your Spotify tab first so Gemini has context.",
      );
    }

    const { prompt, knownArtistsNormalized } =
      buildSpotifyTasteContext(snapshot);

    const result = await runWithModelFallback(
      jobId,
      prompt,
      existingInteractionId,
    );

    await updateJob(jobId, {
      stage: "Matching recommendations with Spotify catalog",
    });

    // Filter out any artist already in the user's library/history and deduplicate by name/Spotify ID
    const seenArtistNames = new Set<string>();
    const freshArtists = result.output.artists.filter((a) => {
      const normalized = a.name.trim().toLowerCase();
      if (
        knownArtistsNormalized.has(normalized) ||
        seenArtistNames.has(normalized)
      ) {
        return false;
      }
      seenArtistNames.add(normalized);
      return true;
    });
    const enrichedArtistsRaw = await Promise.all(
      freshArtists.map(async (artist) => {
        const match = await searchSpotifyArtist(userId, artist.name);
        return {
          id: crypto.randomUUID(),
          jobId,
          userId,
          name: match?.name ?? artist.name,
          genre: artist.genre,
          reason: artist.reason,
          sampleTracksJson: JSON.stringify(artist.sampleTracks),
          spotifyArtistId: match?.id ?? null,
          spotifyUrl: match?.external_urls?.spotify ?? null,
          imageUrl: match?.images?.[0]?.url ?? null,
          isFollowed: false,
        };
      }),
    );

    const seenSpotifyArtistIds = new Set<string>();
    const enrichedArtists = enrichedArtistsRaw.filter((artist) => {
      const key =
        artist.spotifyArtistId ?? artist.name.trim().toLowerCase();
      if (seenSpotifyArtistIds.has(key)) return false;
      seenSpotifyArtistIds.add(key);
      return true;
    });

    const enrichedPlaylists = await Promise.all(
      result.output.playlists.map(async (pl) => {
        const resolvedTracks: ResolvedPlaylistTrack[] = [];
        for (const track of pl.tracks) {
          const match = await searchSpotifyTrack(
            userId,
            track.title,
            track.artist,
          );
          resolvedTracks.push({
            title: match?.name ?? track.title,
            artist:
              match?.artists.map((a) => a.name).join(", ") ?? track.artist,
            spotifyUri: match?.uri ?? null,
            spotifyUrl: match?.external_urls?.spotify ?? null,
            albumImageUrl: match?.album?.images?.[0]?.url ?? null,
          });
        }

        return {
          id: crypto.randomUUID(),
          jobId,
          userId,
          title: pl.title,
          description: pl.description,
          vibe: pl.vibe,
          reason: pl.reason,
          tracksJson: JSON.stringify(resolvedTracks),
          addedSpotifyPlaylistId: null,
          addedSpotifyUrl: null,
        };
      }),
    );

    const db = getDb();
    const completedAt = new Date();
    db.transaction((tx) => {
      const [currentJob] = tx
        .select({ status: recommendationJobs.status })
        .from(recommendationJobs)
        .where(eq(recommendationJobs.id, jobId))
        .all();

      // Idempotency guard: never insert duplicate rows if another worker already completed this job
      if (currentJob?.status === "completed") {
        return;
      }

      tx.delete(recommendedArtists)
        .where(eq(recommendedArtists.jobId, jobId))
        .run();
      tx.delete(recommendedPlaylists)
        .where(eq(recommendedPlaylists.jobId, jobId))
        .run();

      if (enrichedArtists.length > 0) {
        tx.insert(recommendedArtists).values(enrichedArtists).run();
      }
      if (enrichedPlaylists.length > 0) {
        tx.insert(recommendedPlaylists).values(enrichedPlaylists).run();
      }
      tx.update(recommendationJobs)
        .set({
          status: "completed",
          stage: "Recommendations ready",
          activeModel: result.modelUsed,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          errorMessage: null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(recommendationJobs.id, jobId))
        .run();
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to generate Gemini recommendations.";
    console.error(`Recommendation job ${jobId} failed:`, err);
    await updateJob(jobId, {
      status: "failed",
      stage: "Generation failed",
      errorMessage: message,
      completedAt: new Date(),
    });
  } finally {
    activeRunners.delete(jobId);
  }
}

export async function startRecommendationRefresh(userId: string) {
  const db = getDb();
  const [latest] = await db
    .select()
    .from(recommendationJobs)
    .where(eq(recommendationJobs.userId, userId))
    .orderBy(desc(recommendationJobs.startedAt))
    .limit(1);

  if (
    latest &&
    (latest.status === "queued" || latest.status === "running") &&
    Date.now() - latest.updatedAt.getTime() < STALE_JOB_MS
  ) {
    // Re-attach background poller if server restarted while Gemini was running
    if (!activeRunners.has(latest.id)) {
      void runRecommendationJob(
        latest.id,
        userId,
        latest.geminiInteractionId,
      );
    }
    return { job: latest, alreadyRunning: true };
  }

  const jobId = crypto.randomUUID();
  const now = new Date();
  const [created] = await db
    .insert(recommendationJobs)
    .values({
      id: jobId,
      userId,
      status: "running",
      stage: "Queued recommendation refresh",
      primaryModel: PRIMARY_GEMINI_MODEL,
      activeModel: PRIMARY_GEMINI_MODEL,
      fallbackUsed: false,
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  void runRecommendationJob(jobId, userId);

  return { job: created, alreadyRunning: false };
}

export async function getRecommendationsState(userId: string) {
  const db = getDb();
  const [latestJob] = await db
    .select()
    .from(recommendationJobs)
    .where(eq(recommendationJobs.userId, userId))
    .orderBy(desc(recommendationJobs.startedAt))
    .limit(1);

  // Crash/restart recovery: only re-attach if no worker is active AND heartbeat is stale
  if (
    latestJob &&
    (latestJob.status === "queued" || latestJob.status === "running") &&
    !activeRunners.has(latestJob.id)
  ) {
    const idleMs = Date.now() - latestJob.updatedAt.getTime();
    if (latestJob.geminiInteractionId && idleMs >= RECOVERY_HEARTBEAT_GAP_MS) {
      void runRecommendationJob(
        latestJob.id,
        userId,
        latestJob.geminiInteractionId,
      );
    } else if (!latestJob.geminiInteractionId && idleMs >= STALE_JOB_MS) {
      await updateJob(latestJob.id, {
        status: "failed",
        stage: "Interrupted",
        errorMessage:
          "The previous refresh was interrupted before starting. Tap Refresh to try again.",
        completedAt: new Date(),
      });
      latestJob.status = "failed";
      latestJob.errorMessage =
        "The previous refresh was interrupted before starting. Tap Refresh to try again.";
    }
  }

  // Always show the latest completed recommendations even while a new refresh is running!
  const [latestCompleted] = await db
    .select()
    .from(recommendationJobs)
    .where(
      and(
        eq(recommendationJobs.userId, userId),
        eq(recommendationJobs.status, "completed"),
      ),
    )
    .orderBy(desc(recommendationJobs.completedAt))
    .limit(1);

  if (!latestCompleted) {
    return {
      latestJob: latestJob ?? null,
      completedJob: null,
      artists: [],
      playlists: [],
    };
  }

  const [artistsRaw, playlistsRaw] = await Promise.all([
    db
      .select()
      .from(recommendedArtists)
      .where(eq(recommendedArtists.jobId, latestCompleted.id)),
    db
      .select()
      .from(recommendedPlaylists)
      .where(eq(recommendedPlaylists.jobId, latestCompleted.id)),
  ]);

  return {
    latestJob: latestJob ?? null,
    completedJob: latestCompleted,
    artists: artistsRaw.map((a) => ({
      ...a,
      sampleTracks: safeJsonParse<string[]>(a.sampleTracksJson, []),
    })),
    playlists: playlistsRaw.map((p) => ({
      ...p,
      tracks: safeJsonParse<ResolvedPlaylistTrack[]>(p.tracksJson, []),
    })),
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
