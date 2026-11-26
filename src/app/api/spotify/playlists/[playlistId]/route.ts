import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { spotifyPlaylists } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { SpotifyApiError, spotifyFetch } from "@/lib/spotify";

export const dynamic = "force-dynamic";

const updatePlaylistSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ playlistId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { playlistId } = await context.params;
  try {
    const body = updatePlaylistSchema.parse(await request.json());

    await spotifyFetch(user.id, `/playlists/${encodeURIComponent(playlistId)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: body.name,
        description: body.description ?? "",
      }),
    });

    const db = getDb();
    await db
      .update(spotifyPlaylists)
      .set({
        name: body.name,
        description: body.description ?? "",
      })
      .where(
        and(
          eq(spotifyPlaylists.userId, user.id),
          eq(spotifyPlaylists.playlistId, playlistId),
        ),
      );

    return NextResponse.json({
      ok: true,
      playlistId,
      name: body.name,
      description: body.description ?? "",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid playlist name or description." },
        { status: 400 },
      );
    }
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to update playlist.";
    return NextResponse.json({ error: message }, { status });
  }
}
