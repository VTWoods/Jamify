import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { spotifyFollowedArtists, spotifySyncState } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { SpotifyApiError, spotifyFetch } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ artistId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artistId } = await context.params;
  if (!artistId) {
    return NextResponse.json({ error: "Missing artistId" }, { status: 400 });
  }

  try {
    await spotifyFetch(
      user.id,
      `/me/following?type=artist&ids=${encodeURIComponent(artistId)}`,
      { method: "DELETE" },
    );

    const db = getDb();
    await db
      .delete(spotifyFollowedArtists)
      .where(
        and(
          eq(spotifyFollowedArtists.userId, user.id),
          eq(spotifyFollowedArtists.artistId, artistId),
        ),
      );

    await db
      .update(spotifySyncState)
      .set({
        followedArtistsTotal: sql`MAX(0, ${spotifySyncState.followedArtistsTotal} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(spotifySyncState.userId, user.id));

    return NextResponse.json({ ok: true, artistId });
  } catch (err) {
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to unfollow artist.";
    return NextResponse.json({ error: message }, { status });
  }
}
