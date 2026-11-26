import { describe, expect, it } from "vitest";
import type { SpotifyAssetsSnapshot } from "@/types/jamify";
import { computeSpotifyStats } from "./spotify-stats";

describe("computeSpotifyStats", () => {
  it("computes top artists, most played track, variety, and popularity", () => {
    const snapshot: SpotifyAssetsSnapshot = {
      sync: {
        lastSyncedAt: "2026-11-26T15:00:00Z",
        nextRefreshAt: "2026-11-26T16:00:00Z",
        isStale: false,
        status: "idle",
        lastError: null,
        refreshIntervalMinutes: 60,
      },
      summary: {
        historyCount: 4,
        likedSongsTotal: 10,
        likedSongsCached: 10,
        followedArtistsTotal: 2,
        playlistsTotal: 2,
        ownedPlaylistsCount: 1,
        topGenres: ["indie rock", "electronic"],
      },
      history: [
        {
          id: "h1",
          trackId: "t1",
          trackName: "Digital Love",
          artistNames: "Daft Punk",
          albumName: "Discovery",
          albumImageUrl: null,
          spotifyUrl: null,
          playedAt: "2026-11-26T09:00:00",
        },
        {
          id: "h2",
          trackId: "t1",
          trackName: "Digital Love",
          artistNames: "Daft Punk",
          albumName: "Discovery",
          albumImageUrl: null,
          spotifyUrl: null,
          playedAt: "2026-11-26T09:30:00",
        },
        {
          id: "h3",
          trackId: "t2",
          trackName: "Harder, Better, Faster, Stronger",
          artistNames: "Daft Punk",
          albumName: "Discovery",
          albumImageUrl: null,
          spotifyUrl: null,
          playedAt: "2026-11-26T10:00:00",
        },
        {
          id: "h4",
          trackId: "t3",
          trackName: "The Less I Know The Better",
          artistNames: "Tame Impala",
          albumName: "Currents",
          albumImageUrl: null,
          spotifyUrl: null,
          playedAt: "2026-11-26T19:00:00",
        },
      ],
      likedSongs: [],
      followedArtists: [
        {
          id: "a1",
          artistId: "sp1",
          name: "Daft Punk",
          genres: ["electronic"],
          imageUrl: null,
          followers: 1000000,
          popularity: 80,
          spotifyUrl: null,
        },
        {
          id: "a2",
          artistId: "sp2",
          name: "Tame Impala",
          genres: ["indie rock"],
          imageUrl: null,
          followers: 1000000,
          popularity: 76,
          spotifyUrl: null,
        },
      ],
      playlists: [
        {
          id: "p1",
          playlistId: "pl1",
          name: "Morning Commute",
          description: "",
          ownerId: "u1",
          ownerName: "You",
          isOwnedByUser: true,
          isPublic: false,
          trackCount: 16,
          imageUrl: null,
          spotifyUrl: null,
        },
        {
          id: "p2",
          playlistId: "pl2",
          name: "Evening Commute",
          description: "",
          ownerId: "u1",
          ownerName: "You",
          isOwnedByUser: true,
          isPublic: false,
          trackCount: 14,
          imageUrl: null,
          spotifyUrl: null,
        },
      ],
    };

    const stats = computeSpotifyStats(snapshot);
    expect(stats.topRecentArtists[0]).toEqual({ name: "Daft Punk", plays: 3 });
    expect(stats.mostPlayedTrack).toEqual({
      trackName: "Digital Love",
      artistNames: "Daft Punk",
      plays: 2,
    });
    expect(stats.uniqueTracksInHistory).toBe(3);
    expect(stats.listeningVarietyPct).toBe(75);
    expect(stats.peakListeningWindow?.label).toBe("Morning");
    expect(stats.peakListeningWindow?.pct).toBe(75);
    expect(stats.avgArtistPopularity).toBe(78);
    expect(stats.popularityLabel).toBe("Mainstream");
    expect(stats.totalPlaylistTracks).toBe(30);
  });
});
