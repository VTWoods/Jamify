import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { spotifyTokens, users } from "@/db/schema";
import {
  getAppBaseUrl,
  getSpotifyRedirectUri,
  isSpotifyUserAllowed,
  OAUTH_STATE_COOKIE_NAME,
  setSessionCookie,
} from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

interface SpotifyMeResponse {
  id: string;
  display_name?: string | null;
  images?: Array<{ url: string }>;
}

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/?authError=${encodeURIComponent(`Spotify authorization failed: ${error}`)}`,
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE_NAME);

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${baseUrl}/?authError=${encodeURIComponent("Invalid OAuth state. Please try connecting again.")}`,
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${baseUrl}/?authError=${encodeURIComponent("Spotify server credentials are missing.")}`,
    );
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getSpotifyRedirectUri(),
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("Spotify token exchange failed:", detail);
      return NextResponse.redirect(
        `${baseUrl}/?authError=${encodeURIComponent("Failed to exchange Spotify authorization code.")}`,
      );
    }

    const tokenData = (await tokenRes.json()) as SpotifyTokenResponse;
    if (!tokenData.refresh_token) {
      return NextResponse.redirect(
        `${baseUrl}/?authError=${encodeURIComponent("Spotify did not return a refresh token.")}`,
      );
    }

    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    if (!meRes.ok) {
      return NextResponse.redirect(
        `${baseUrl}/?authError=${encodeURIComponent("Failed to load Spotify profile.")}`,
      );
    }

    const profile = (await meRes.json()) as SpotifyMeResponse;
    if (!isSpotifyUserAllowed(profile.id)) {
      return NextResponse.redirect(
        `${baseUrl}/?authError=${encodeURIComponent("This Spotify account is not on the instance allowlist.")}`,
      );
    }

    const db = getDb();
    const now = new Date();
    const avatarUrl = profile.images?.[0]?.url ?? null;

    await db
      .insert(users)
      .values({
        id: profile.id,
        displayName: profile.display_name ?? profile.id,
        avatarUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          displayName: profile.display_name ?? profile.id,
          avatarUrl,
          updatedAt: now,
        },
      });

    const expiresAt = Date.now() + tokenData.expires_in * 1000;
    await db
      .insert(spotifyTokens)
      .values({
        userId: profile.id,
        encryptedAccessToken: encryptSecret(tokenData.access_token),
        encryptedRefreshToken: encryptSecret(tokenData.refresh_token),
        expiresAt,
        scope: tokenData.scope ?? "",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: spotifyTokens.userId,
        set: {
          encryptedAccessToken: encryptSecret(tokenData.access_token),
          encryptedRefreshToken: encryptSecret(tokenData.refresh_token),
          expiresAt,
          scope: tokenData.scope ?? "",
          updatedAt: now,
        },
      });

    await setSessionCookie(profile.id);
    return NextResponse.redirect(`${baseUrl}/`);
  } catch (err) {
    console.error("Spotify callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/?authError=${encodeURIComponent("Unexpected error during Spotify sign-in.")}`,
    );
  }
}
