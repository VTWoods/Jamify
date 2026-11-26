import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { SpotifyApiError } from "@/lib/spotify";
import {
  getSpotifyAssetsSnapshot,
  syncSpotifyAssets,
} from "@/lib/spotify-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Automatically refreshes from Spotify if >= 1 hour old or never synced
    await syncSpotifyAssets(user.id, { force: false });
  } catch (err) {
    console.error("Auto-sync failed, serving cached assets if available:", err);
    if (err instanceof SpotifyApiError && err.status === 401) {
      return NextResponse.json(
        { error: err.message, reconnectRequired: true },
        { status: 401 },
      );
    }
  }

  const snapshot = await getSpotifyAssetsSnapshot(user.id);
  return NextResponse.json(snapshot);
}
