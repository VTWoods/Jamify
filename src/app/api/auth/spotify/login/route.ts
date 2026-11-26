import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getRequestOrigin,
  getSpotifyRedirectUri,
  isOriginSecure,
  OAUTH_STATE_COOKIE_NAME,
  SPOTIFY_SCOPES,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      `${origin}/?authError=${encodeURIComponent("SPOTIFY_CLIENT_ID is not configured on the server.")}`,
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: isOriginSecure(origin),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: getSpotifyRedirectUri(origin),
    state,
    show_dialog: "false",
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`,
  );
}
