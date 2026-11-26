import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { SpotifyApiError } from "@/lib/spotify";
import {
  getSpotifyAssetsSnapshot,
  syncSpotifyAssets,
} from "@/lib/spotify-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await syncSpotifyAssets(user.id, { force: true });
    const snapshot = await getSpotifyAssetsSnapshot(user.id);
    return NextResponse.json(snapshot);
  } catch (err) {
    const status = err instanceof SpotifyApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to sync Spotify assets.";
    return NextResponse.json({ error: message }, { status });
  }
}
