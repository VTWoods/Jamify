import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { spotifyPlaylists } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  SpotifyApiError,
  spotifyFetch,
  type SpotifyTrackItem,
} from "@/lib/spotify";

export const dynamic = "force-dynamic";

interface PlaylistItemsResponse {
  items: Array<{
    added_at: string;
    item?: SpotifyTrackItem | null;
    track?: SpotifyTrackItem | null;
  }>;
  total: number;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ playlistId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { playlistId } = await context.params;
  try {
    const res = await spotifyFetch<PlaylistItemsResponse>(
      user.id,
      `/playlists/${encodeURIComponent(playlistId)}/items?limit=100`,
    );

    const tracks = (res.items ?? [])
      .map((entry) => ({
        addedAt: entry.added_at,
        track: entry.item ?? entry.track ?? null,
      }))
      .filter((entry): entry is { addedAt: string; track: SpotifyTrackItem } =>
        Boolean(entry.track?.id && entry.track?.uri),
      )
      .map((entry) => ({
        id: entry.track.id,
        uri: entry.track.uri,
        name: entry.track.name,
        artistNames: (entry.track.artists ?? []).map((a) => a.name).join(", "),
        albumName: entry.track.album?.name ?? "",
        albumImageUrl: entry.track.album?.images?.[0]?.url ?? null,
        spotifyUrl: entry.track.external_urls?.spotify ?? null,
        addedAt: entry.addedAt,
      }));

    return NextResponse.json({
      total: res.total ?? tracks.length,
      tracks,
      restricted: false,
    });
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 403) {
      return NextResponse.json({
        total: 0,
        tracks: [],
        restricted: true,
        restrictionReason:
          "Spotify Development Mode restricts reading tracks for playlists you don't own. Open this playlist in Spotify to view its tracks.",
      });
    }
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to load playlist tracks.";
    return NextResponse.json({ error: message }, { status });
  }
}

const removeTrackSchema = z.object({
  uri: z.string().min(1),
});

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ playlistId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { playlistId } = await context.params;
  try {
    const body = removeTrackSchema.parse(await request.json());
    await spotifyFetch(
      user.id,
      `/playlists/${encodeURIComponent(playlistId)}/items`,
      {
        method: "DELETE",
        body: JSON.stringify({ items: [{ uri: body.uri }] }),
      },
    );

    const db = getDb();
    await db
      .update(spotifyPlaylists)
      .set({
        trackCount: sql`MAX(0, ${spotifyPlaylists.trackCount} - 1)`,
      })
      .where(
        and(
          eq(spotifyPlaylists.userId, user.id),
          eq(spotifyPlaylists.playlistId, playlistId),
        ),
      );

    return NextResponse.json({ ok: true, uri: body.uri });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid track URI." }, { status: 400 });
    }
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to remove track.";
    return NextResponse.json({ error: message }, { status });
  }
}
