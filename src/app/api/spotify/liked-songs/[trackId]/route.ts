import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { spotifyLikedSongs, spotifySyncState } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { SpotifyApiError, spotifyFetch } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ trackId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trackId } = await context.params;
  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }

  try {
    await spotifyFetch(user.id, `/me/tracks?ids=${encodeURIComponent(trackId)}`, {
      method: "DELETE",
    });

    const db = getDb();
    await db
      .delete(spotifyLikedSongs)
      .where(
        and(
          eq(spotifyLikedSongs.userId, user.id),
          eq(spotifyLikedSongs.trackId, trackId),
        ),
      );
    await db
      .update(spotifySyncState)
      .set({
        likedSongsTotal: sql`MAX(0, ${spotifySyncState.likedSongsTotal} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(spotifySyncState.userId, user.id));

    return NextResponse.json({ ok: true, trackId });
  } catch (err) {
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to remove liked song.";
    return NextResponse.json({ error: message }, { status });
  }
}
