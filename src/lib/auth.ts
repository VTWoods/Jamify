import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { signSessionToken, verifySessionToken } from "@/lib/crypto";
import { getAllowedSpotifyUserIds } from "@/lib/env";

export const SESSION_COOKIE_NAME = "jamify_session";
export const OAUTH_STATE_COOKIE_NAME = "jamify_oauth_state";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export const SPOTIFY_SCOPES = [
  "user-read-recently-played",
  "user-top-read",
  "user-library-read",
  "user-library-modify",
  "user-follow-read",
  "user-follow-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

export function getAppBaseUrl(): string {
  return (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
}

export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  const host = request.headers.get("host")?.trim();
  if (host) {
    const urlProto = new URL(request.url).protocol.replace(/:$/, "");
    const proto = forwardedProto || urlProto || "http";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  return getAppBaseUrl();
}

export function isOriginSecure(origin: string): boolean {
  return origin.startsWith("https://");
}

export function getSpotifyRedirectUri(origin?: string): string {
  const base = (origin ?? getAppBaseUrl()).replace(/\/+$/, "");
  return `${base}/api/auth/spotify/callback`;
}

export function isSpotifyUserAllowed(spotifyUserId: string): boolean {
  const allowed = getAllowedSpotifyUserIds();
  if (allowed.length === 0) return true;
  return allowed.includes(spotifyUserId);
}

export interface SessionUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function setSessionCookie(
  userId: string,
  secure?: boolean,
): Promise<void> {
  const token = signSessionToken({
    userId,
    exp: Date.now() + SESSION_TTL_MS,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: secure ?? isOriginSecure(getAppBaseUrl()),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifySessionToken(token);
    if (!payload) return null;
    if (!isSpotifyUserAllowed(payload.userId)) return null;

    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    return user ?? null;
  } catch {
    return null;
  }
}
