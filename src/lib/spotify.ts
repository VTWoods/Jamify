import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { spotifyTokens } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export async function getValidSpotifyAccessToken(
  userId: string,
  forceRefresh = false,
): Promise<string> {
  const db = getDb();
  const [tokenRow] = await db
    .select()
    .from(spotifyTokens)
    .where(eq(spotifyTokens.userId, userId))
    .limit(1);

  if (!tokenRow) {
    throw new SpotifyApiError(
      "Spotify account is not connected. Please sign in again.",
      401,
    );
  }

  const now = Date.now();
  const shouldRefresh = forceRefresh || tokenRow.expiresAt - now < 60_000;

  if (!shouldRefresh) {
    return decryptSecret(tokenRow.encryptedAccessToken);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SpotifyApiError(
      "Spotify client credentials are not configured.",
      500,
    );
  }

  const refreshToken = decryptSecret(tokenRow.encryptedRefreshToken);
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new SpotifyApiError(
      "Failed to refresh Spotify access token. Please reconnect Spotify.",
      res.status,
      detail,
    );
  }

  const data = (await res.json()) as RefreshTokenResponse;
  const newExpiresAt = Date.now() + data.expires_in * 1000;

  await db
    .update(spotifyTokens)
    .set({
      encryptedAccessToken: encryptSecret(data.access_token),
      encryptedRefreshToken: data.refresh_token
        ? encryptSecret(data.refresh_token)
        : tokenRow.encryptedRefreshToken,
      expiresAt: newExpiresAt,
      scope: data.scope ?? tokenRow.scope,
      updatedAt: new Date(),
    })
    .where(eq(spotifyTokens.userId, userId));

  return data.access_token;
}

export async function spotifyFetch<T>(
  userId: string,
  pathOrUrl: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const accessToken = await getValidSpotifyAccessToken(userId, attempt > 0);
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${SPOTIFY_API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && attempt === 0) {
    return spotifyFetch<T>(userId, pathOrUrl, init, 1);
  }

  if (res.status === 429 && attempt < 2) {
    const retryAfterSec = Number(res.headers.get("Retry-After") ?? "2");
    const delayMs = Math.min(Math.max(retryAfterSec, 1), 10) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return spotifyFetch<T>(userId, pathOrUrl, init, attempt + 1);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new SpotifyApiError(
      `Spotify API error (${res.status})`,
      res.status,
      detail,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export interface SpotifyImage {
  url: string;
  height?: number | null;
  width?: number | null;
}

export interface SpotifyArtistItem {
  id: string;
  name: string;
  genres?: string[];
  images?: SpotifyImage[];
  followers?: { total: number };
  popularity?: number;
  external_urls?: { spotify?: string };
}

export interface SpotifyTrackItem {
  id: string;
  uri: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    name: string;
    images?: SpotifyImage[];
  };
  external_urls?: { spotify?: string };
}

export async function searchSpotifyArtist(
  userId: string,
  artistName: string,
): Promise<SpotifyArtistItem | null> {
  try {
    const params = new URLSearchParams({
      q: `artist:${artistName}`,
      type: "artist",
      limit: "3",
    });
    const res = await spotifyFetch<{
      artists?: { items: SpotifyArtistItem[] };
    }>(userId, `/search?${params.toString()}`);

    const items = res.artists?.items ?? [];
    if (items.length === 0) return null;

    const normalized = artistName.trim().toLowerCase();
    return (
      items.find((a) => a.name.trim().toLowerCase() === normalized) ?? items[0]
    );
  } catch {
    return null;
  }
}

export async function searchSpotifyTrack(
  userId: string,
  title: string,
  artist: string,
): Promise<SpotifyTrackItem | null> {
  try {
    const params = new URLSearchParams({
      q: `track:${title} artist:${artist}`,
      type: "track",
      limit: "3",
    });
    const res = await spotifyFetch<{
      tracks?: { items: SpotifyTrackItem[] };
    }>(userId, `/search?${params.toString()}`);

    const items = res.tracks?.items ?? [];
    if (items.length > 0) return items[0];

    // Fallback broader search
    const fallbackParams = new URLSearchParams({
      q: `${title} ${artist}`,
      type: "track",
      limit: "1",
    });
    const fallbackRes = await spotifyFetch<{
      tracks?: { items: SpotifyTrackItem[] };
    }>(userId, `/search?${fallbackParams.toString()}`);

    return fallbackRes.tracks?.items?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function createSpotifyPlaylistWithTracks(
  userId: string,
  input: {
    name: string;
    description: string;
    isPublic?: boolean;
    trackUris: string[];
  },
): Promise<{ id: string; url: string | null }> {
  const created = await spotifyFetch<{
    id: string;
    external_urls?: { spotify?: string };
  }>(userId, `/users/${encodeURIComponent(userId)}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      public: input.isPublic ?? false,
    }),
  });

  // Spotify accepts max 100 URIs per request
  for (let i = 0; i < input.trackUris.length; i += 100) {
    const chunk = input.trackUris.slice(i, i + 100);
    if (chunk.length > 0) {
      await spotifyFetch(userId, `/playlists/${created.id}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: chunk }),
      });
    }
  }

  return {
    id: created.id,
    url: created.external_urls?.spotify ?? null,
  };
}
