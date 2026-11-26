import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { applyCommuteDayToSpotify } from "@/lib/commute-playlists";
import { SpotifyApiError } from "@/lib/spotify";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  kind: z.enum(["morning", "evening"]).optional(),
  weekday: z.number().int().min(1).max(5).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await request.json().catch(() => ({}));
    const body = applySchema.parse(raw);
    const applied = await applyCommuteDayToSpotify(user.id, {
      kind: body.kind,
      weekday: body.weekday,
    });
    return NextResponse.json({ ok: true, applied });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid commute apply parameters." },
        { status: 400 },
      );
    }
    const status = err instanceof SpotifyApiError ? err.status : 400;
    const message =
      err instanceof Error
        ? err.message
        : "Failed to update commute playlist in Spotify.";
    return NextResponse.json({ error: message }, { status });
  }
}
