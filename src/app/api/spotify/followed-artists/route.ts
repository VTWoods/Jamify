import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  recommendedArtists,
  spotifyFollowedArtists,
  spotifySyncState,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  SpotifyApiError,
  spotifyFetch,
  type SpotifyArtistItem,
} from "@/lib/spotify";

export const dynamic = "force-dynamic";

const followArtistSchema = z.object({
  artistId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = followArtistSchema.parse(await request.json());
    await spotifyFetch(
      user.id,
      `/me/following?type=artist&ids=${encodeURIComponent(body.artistId)}`,
      { method: "PUT" },
    );

    const artist = await spotifyFetch<SpotifyArtistItem>(
      user.id,
      `/artists/${encodeURIComponent(body.artistId)}`,
    );

    const db = getDb();
    await db
      .insert(spotifyFollowedArtists)
      .values({
        id: `${user.id}:${artist.id}`,
        userId: user.id,
        artistId: artist.id,
        name: artist.name,
        genresJson: JSON.stringify(artist.genres ?? []),
        imageUrl: artist.images?.[0]?.url ?? null,
        followers: artist.followers?.total ?? 0,
        popularity: artist.popularity ?? 0,
        spotifyUrl: artist.external_urls?.spotify ?? null,
      })
      .onConflictDoNothing();

    await db
      .update(spotifySyncState)
      .set({
        followedArtistsTotal: sql`${spotifySyncState.followedArtistsTotal} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(spotifySyncState.userId, user.id));

    await db
      .update(recommendedArtists)
      .set({ isFollowed: true })
      .where(
        and(
          eq(recommendedArtists.userId, user.id),
          eq(recommendedArtists.spotifyArtistId, artist.id),
        ),
      );

    return NextResponse.json({ ok: true, artistId: artist.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to follow artist.";
    return NextResponse.json({ error: message }, { status });
  }
}
