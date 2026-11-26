import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  recommendedPlaylists,
  spotifyPlaylists,
  spotifySyncState,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import type { ResolvedPlaylistTrack } from "@/lib/gemini-recommendations";
import {
  createSpotifyPlaylistWithTracks,
  SpotifyApiError,
} from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getDb();
  const [playlist] = await db
    .select()
    .from(recommendedPlaylists)
    .where(
      and(
        eq(recommendedPlaylists.id, id),
        eq(recommendedPlaylists.userId, user.id),
      ),
    )
    .limit(1);

  if (!playlist) {
    return NextResponse.json(
      { error: "Recommended playlist not found." },
      { status: 404 },
    );
  }

  if (playlist.addedSpotifyPlaylistId) {
    return NextResponse.json({
      ok: true,
      alreadyAdded: true,
      spotifyPlaylistId: playlist.addedSpotifyPlaylistId,
      spotifyUrl: playlist.addedSpotifyUrl,
    });
  }

  let tracks: ResolvedPlaylistTrack[] = [];
  try {
    tracks = JSON.parse(playlist.tracksJson) as ResolvedPlaylistTrack[];
  } catch {
    tracks = [];
  }

  const trackUris = tracks
    .map((t) => t.spotifyUri)
    .filter((uri): uri is string => Boolean(uri));

  if (trackUris.length === 0) {
    return NextResponse.json(
      { error: "No matching Spotify tracks were found for this playlist." },
      { status: 400 },
    );
  }

  try {
    const created = await createSpotifyPlaylistWithTracks(user.id, {
      name: playlist.title,
      description: `${playlist.description} (Curated by Jamify)`,
      isPublic: false,
      trackUris,
    });

    await db
      .update(recommendedPlaylists)
      .set({
        addedSpotifyPlaylistId: created.id,
        addedSpotifyUrl: created.url,
      })
      .where(eq(recommendedPlaylists.id, playlist.id));

    await db
      .insert(spotifyPlaylists)
      .values({
        id: `${user.id}:${created.id}`,
        userId: user.id,
        playlistId: created.id,
        name: playlist.title,
        description: `${playlist.description} (Curated by Jamify)`,
        ownerId: user.id,
        ownerName: user.displayName ?? user.id,
        isOwnedByUser: true,
        isPublic: false,
        trackCount: trackUris.length,
        imageUrl: tracks.find((t) => t.albumImageUrl)?.albumImageUrl ?? null,
        spotifyUrl: created.url,
        snapshotId: null,
      })
      .onConflictDoNothing();

    await db
      .update(spotifySyncState)
      .set({
        playlistsTotal: sql`${spotifySyncState.playlistsTotal} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(spotifySyncState.userId, user.id));

    return NextResponse.json({
      ok: true,
      spotifyPlaylistId: created.id,
      spotifyUrl: created.url,
      addedTrackCount: trackUris.length,
    });
  } catch (err) {
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error
        ? err.message
        : "Failed to create playlist in Spotify.";
    return NextResponse.json({ error: message }, { status });
  }
}
