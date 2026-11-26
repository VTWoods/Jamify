import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  spotifyFollowedArtists,
  spotifyLikedSongs,
  spotifyListeningHistory,
  spotifyPlaylists,
  spotifySyncState,
} from "@/db/schema";
import {
  spotifyFetch,
  type SpotifyArtistItem,
  type SpotifyImage,
  type SpotifyTrackItem,
} from "@/lib/spotify";

export const SPOTIFY_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const LISTENING_HISTORY_DISPLAY_LIMIT = 1000;

const inFlightSyncs = new Map<string, Promise<void>>();

export function isSyncStale(
  lastSyncedAt: Date | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastSyncedAt) return true;
  return nowMs - lastSyncedAt.getTime() >= SPOTIFY_SYNC_INTERVAL_MS;
}

interface RecentlyPlayedResponse {
  items: Array<{
    played_at: string;
    track: SpotifyTrackItem;
  }>;
}

interface LikedSongsResponse {
  total: number;
  next: string | null;
  items: Array<{
    added_at: string;
    track: SpotifyTrackItem | null;
  }>;
}

interface FollowedArtistsResponse {
  artists: {
    total: number;
    next: string | null;
    items: SpotifyArtistItem[];
  };
}

interface PlaylistsResponse {
  total: number;
  next: string | null;
  items: Array<{
    id: string;
    name: string;
    description?: string | null;
    public?: boolean | null;
    snapshot_id?: string | null;
    owner?: { id?: string; display_name?: string | null };
    items?: { total?: number };
    tracks?: { total?: number };
    images?: SpotifyImage[];
    external_urls?: { spotify?: string };
  } | null>;
}

async function performSpotifySync(userId: string): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db
    .insert(spotifySyncState)
    .values({
      userId,
      syncStatus: "syncing",
      lastError: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: spotifySyncState.userId,
      set: {
        syncStatus: "syncing",
        lastError: null,
        updatedAt: now,
      },
    });

  try {
    // 1. Listening history (up to 50 most recent plays)
    const historyRes = await spotifyFetch<RecentlyPlayedResponse>(
      userId,
      "/me/player/recently-played?limit=50",
    );
    const historyRows = (historyRes.items ?? [])
      .filter((item) => item.track?.id)
      .map((item) => ({
        id: `${userId}:${item.played_at}:${item.track.id}`,
        userId,
        trackId: item.track.id,
        trackName: item.track.name,
        artistNames: item.track.artists.map((a) => a.name).join(", "),
        albumName: item.track.album?.name ?? "",
        albumImageUrl: item.track.album?.images?.[0]?.url ?? null,
        spotifyUrl: item.track.external_urls?.spotify ?? null,
        playedAt: item.played_at,
      }));

    // 2. Liked songs (paginate up to 200 most recent for fast, reliable sync)
    const likedRows: Array<typeof spotifyLikedSongs.$inferInsert> = [];
    let likedTotal = 0;
    let likedNext: string | null = "/me/tracks?limit=50";
    let likedPages = 0;
    while (likedNext && likedPages < 4) {
      const page: LikedSongsResponse = await spotifyFetch<LikedSongsResponse>(
        userId,
        likedNext,
      );
      likedTotal = page.total ?? likedTotal;
      for (const item of page.items ?? []) {
        if (!item.track?.id) continue;
        likedRows.push({
          id: `${userId}:${item.track.id}`,
          userId,
          trackId: item.track.id,
          trackName: item.track.name,
          artistNames: item.track.artists.map((a) => a.name).join(", "),
          albumName: item.track.album?.name ?? "",
          albumImageUrl: item.track.album?.images?.[0]?.url ?? null,
          spotifyUrl: item.track.external_urls?.spotify ?? null,
          addedAt: item.added_at,
        });
      }
      likedNext = page.next;
      likedPages += 1;
    }

    // 3. Followed artists (paginate up to 300)
    const artistRows: Array<typeof spotifyFollowedArtists.$inferInsert> = [];
    let artistsTotal = 0;
    let artistsNext: string | null = "/me/following?type=artist&limit=50";
    let artistPages = 0;
    while (artistsNext && artistPages < 6) {
      const page: FollowedArtistsResponse =
        await spotifyFetch<FollowedArtistsResponse>(userId, artistsNext);
      artistsTotal = page.artists?.total ?? artistsTotal;
      for (const artist of page.artists?.items ?? []) {
        if (!artist?.id) continue;
        artistRows.push({
          id: `${userId}:${artist.id}`,
          userId,
          artistId: artist.id,
          name: artist.name,
          genresJson: JSON.stringify(artist.genres ?? []),
          imageUrl: artist.images?.[0]?.url ?? null,
          followers: artist.followers?.total ?? 0,
          popularity: artist.popularity ?? 0,
          spotifyUrl: artist.external_urls?.spotify ?? null,
        });
      }
      artistsNext = page.artists?.next ?? null;
      artistPages += 1;
    }

    // 4. Personal playlists (paginate up to 200)
    const playlistRows: Array<typeof spotifyPlaylists.$inferInsert> = [];
    let playlistsTotal = 0;
    let playlistsNext: string | null = "/me/playlists?limit=50";
    let playlistPages = 0;
    while (playlistsNext && playlistPages < 4) {
      const page: PlaylistsResponse = await spotifyFetch<PlaylistsResponse>(
        userId,
        playlistsNext,
      );
      playlistsTotal = page.total ?? playlistsTotal;
      for (const pl of page.items ?? []) {
        if (!pl?.id) continue;
        const ownerId = pl.owner?.id ?? "";
        playlistRows.push({
          id: `${userId}:${pl.id}`,
          userId,
          playlistId: pl.id,
          name: pl.name,
          description: pl.description ?? "",
          ownerId,
          ownerName: pl.owner?.display_name ?? ownerId ?? "Spotify",
          isOwnedByUser: ownerId === userId,
          isPublic: Boolean(pl.public),
          trackCount: pl.items?.total ?? pl.tracks?.total ?? 0,
          imageUrl: pl.images?.[0]?.url ?? null,
          spotifyUrl: pl.external_urls?.spotify ?? null,
          snapshotId: pl.snapshot_id ?? null,
        });
      }
      playlistsNext = page.next;
      playlistPages += 1;
    }

    // Replace playlists/liked/artists and accumulate full listening history in SQLite
    const syncedAt = new Date();
    db.transaction((tx) => {
      // Accumulate listening history indefinitely across hourly syncs (Spotify caps each fetch at 50)
      if (historyRows.length > 0) {
        tx.insert(spotifyListeningHistory)
          .values(historyRows)
          .onConflictDoNothing()
          .run();
      }

      const [historyCountRow] = tx
        .select({ count: sql<number>`count(*)` })
        .from(spotifyListeningHistory)
        .where(eq(spotifyListeningHistory.userId, userId))
        .all();
      const accumulatedHistoryTotal = Number(historyCountRow?.count ?? 0);

      tx.delete(spotifyLikedSongs)
        .where(eq(spotifyLikedSongs.userId, userId))
        .run();
      if (likedRows.length > 0) {
        tx.insert(spotifyLikedSongs)
          .values(likedRows)
          .onConflictDoNothing()
          .run();
      }

      tx.delete(spotifyFollowedArtists)
        .where(eq(spotifyFollowedArtists.userId, userId))
        .run();
      if (artistRows.length > 0) {
        tx.insert(spotifyFollowedArtists)
          .values(artistRows)
          .onConflictDoNothing()
          .run();
      }

      tx.delete(spotifyPlaylists)
        .where(eq(spotifyPlaylists.userId, userId))
        .run();
      if (playlistRows.length > 0) {
        tx.insert(spotifyPlaylists)
          .values(playlistRows)
          .onConflictDoNothing()
          .run();
      }

      tx.insert(spotifySyncState)
        .values({
          userId,
          lastSyncedAt: syncedAt,
          syncStatus: "idle",
          lastError: null,
          likedSongsTotal: likedTotal || likedRows.length,
          followedArtistsTotal: artistsTotal || artistRows.length,
          playlistsTotal: playlistsTotal || playlistRows.length,
          historyTotal: accumulatedHistoryTotal,
          updatedAt: syncedAt,
        })
        .onConflictDoUpdate({
          target: spotifySyncState.userId,
          set: {
            lastSyncedAt: syncedAt,
            syncStatus: "idle",
            lastError: null,
            likedSongsTotal: likedTotal || likedRows.length,
            followedArtistsTotal: artistsTotal || artistRows.length,
            playlistsTotal: playlistsTotal || playlistRows.length,
            historyTotal: accumulatedHistoryTotal,
            updatedAt: syncedAt,
          },
        })
        .run();
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to sync Spotify assets.";
    await db
      .update(spotifySyncState)
      .set({
        syncStatus: "error",
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(spotifySyncState.userId, userId));
    throw err;
  }
}

export async function syncSpotifyAssets(
  userId: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const db = getDb();
  const [state] = await db
    .select()
    .from(spotifySyncState)
    .where(eq(spotifySyncState.userId, userId))
    .limit(1);

  if (!options.force && !isSyncStale(state?.lastSyncedAt)) {
    return false;
  }

  let existing = inFlightSyncs.get(userId);
  if (!existing) {
    existing = performSpotifySync(userId).finally(() => {
      inFlightSyncs.delete(userId);
    });
    inFlightSyncs.set(userId, existing);
  }

  await existing;
  return true;
}

export async function getSpotifyAssetsSnapshot(userId: string) {
  const db = getDb();
  const [state] = await db
    .select()
    .from(spotifySyncState)
    .where(eq(spotifySyncState.userId, userId))
    .limit(1);

  const [history, likedSongs, followedArtistsRaw, playlists] =
    await Promise.all([
      db
        .select()
        .from(spotifyListeningHistory)
        .where(eq(spotifyListeningHistory.userId, userId))
        .orderBy(desc(spotifyListeningHistory.playedAt))
        .limit(LISTENING_HISTORY_DISPLAY_LIMIT),
      db
        .select()
        .from(spotifyLikedSongs)
        .where(eq(spotifyLikedSongs.userId, userId))
        .orderBy(desc(spotifyLikedSongs.addedAt)),
      db
        .select()
        .from(spotifyFollowedArtists)
        .where(eq(spotifyFollowedArtists.userId, userId))
        .orderBy(desc(spotifyFollowedArtists.popularity)),
      db
        .select()
        .from(spotifyPlaylists)
        .where(eq(spotifyPlaylists.userId, userId)),
    ]);

  const followedArtists = followedArtistsRaw.map((a) => ({
    ...a,
    genres: safeParseStringArray(a.genresJson),
  }));

  const lastSyncedAt = state?.lastSyncedAt ?? null;
  const nextRefreshAt = lastSyncedAt
    ? new Date(lastSyncedAt.getTime() + SPOTIFY_SYNC_INTERVAL_MS).toISOString()
    : null;

  return {
    sync: {
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      nextRefreshAt,
      isStale: isSyncStale(lastSyncedAt),
      status: state?.syncStatus ?? "idle",
      lastError: state?.lastError ?? null,
      refreshIntervalMinutes: 60,
    },
    summary: {
      historyCount: Math.max(state?.historyTotal ?? 0, history.length),
      likedSongsTotal: Math.max(state?.likedSongsTotal ?? 0, likedSongs.length),
      likedSongsCached: likedSongs.length,
      followedArtistsTotal: Math.max(
        state?.followedArtistsTotal ?? 0,
        followedArtists.length,
      ),
      playlistsTotal: Math.max(state?.playlistsTotal ?? 0, playlists.length),
      ownedPlaylistsCount: playlists.filter((p) => p.isOwnedByUser).length,
      topGenres: computeTopGenres(followedArtists, 5),
    },
    history,
    likedSongs,
    followedArtists,
    playlists,
  };
}

function safeParseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function computeTopGenres(
  artists: Array<{ genres: string[] }>,
  limit: number,
): string[] {
  const counts = new Map<string, number>();
  for (const artist of artists) {
    for (const genre of artist.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre]) => genre);
}
