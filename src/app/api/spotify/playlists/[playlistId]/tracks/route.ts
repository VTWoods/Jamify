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

interface PlaylistTracksResponse {
  items: Array<{
    added_at: string;
    track: SpotifyTrackItem | null;
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
    const res = await spotifyFetch<PlaylistTracksResponse>(
      user.id,
      `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`,
    );

    const tracks = (res.items ?? [])
      .filter((item): item is { added_at: string; track: SpotifyTrackItem } =>
        Boolean(item.track?.id),
      )
      .map((item) => ({
        id: item.track.id,
        uri: item.track.uri,
        name: item.track.name,
        artistNames: item.track.artists.map((a) => a.name).join(", "),
        albumName: item.track.album?.name ?? "",
        albumImageUrl: item.track.album?.images?.[0]?.url ?? null,
        spotifyUrl: item.track.external_urls?.spotify ?? null,
        addedAt: item.added_at,
      }));

    return NextResponse.json({ total: res.total ?? tracks.length, tracks });
  } catch (err) {
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
      `/playlists/${encodeURIComponent(playlistId)}/tracks`,
      {
        method: "DELETE",
        body: JSON.stringify({ tracks: [{ uri: body.uri }] }),
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
