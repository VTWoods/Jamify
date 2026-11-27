import { describe, expect, it } from "vitest";
import {
  buildSpotifyTasteContext,
  FALLBACK_GEMINI_MODEL,
  parseGeminiRecommendationsJson,
  PRIMARY_GEMINI_MODEL,
} from "./gemini-recommendations";

describe("Gemini recommendations helpers", () => {
  it("uses gemini-4-hydrogen as default and gemini-3.5-flash-lite as fallback", () => {
    expect(PRIMARY_GEMINI_MODEL).toBe("gemini-4-hydrogen");
    expect(FALLBACK_GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("builds Spotify context and excludes all known artists from recommendations", () => {
    const { prompt, knownArtistsNormalized } = buildSpotifyTasteContext({
      sync: {
        lastSyncedAt: new Date().toISOString(),
        nextRefreshAt: null,
        isStale: false,
        status: "idle",
        lastError: null,
        refreshIntervalMinutes: 60,
      },
      summary: {
        historyCount: 1,
        likedSongsTotal: 1,
        likedSongsCached: 1,
        followedArtistsTotal: 1,
        playlistsTotal: 1,
        ownedPlaylistsCount: 1,
        topGenres: ["indie rock"],
      },
      history: [
        {
          id: "h1",
          userId: "u1",
          trackId: "t1",
          trackName: "Song A",
          artistNames: "Artist One, Artist Two",
          albumName: "Album A",
          albumImageUrl: null,
          spotifyUrl: null,
          playedAt: new Date().toISOString(),
        },
      ],
      likedSongs: [
        {
          id: "l1",
          userId: "u1",
          trackId: "t2",
          trackName: "Song B",
          artistNames: "Artist Three",
          albumName: "Album B",
          albumImageUrl: null,
          spotifyUrl: null,
          addedAt: new Date().toISOString(),
        },
      ],
      followedArtists: [
        {
          id: "a1",
          userId: "u1",
          artistId: "sp1",
          name: "Artist Four",
          genresJson: '["indie rock"]',
          genres: ["indie rock"],
          imageUrl: null,
          followers: 1000,
          popularity: 60,
          spotifyUrl: null,
        },
      ],
      playlists: [
        {
          id: "p1",
          userId: "u1",
          playlistId: "pl1",
          name: "Roadtrip",
          description: "Chill driving music",
          ownerId: "u1",
          ownerName: "Listener",
          isOwnedByUser: true,
          isPublic: false,
          trackCount: 15,
          imageUrl: null,
          spotifyUrl: null,
          snapshotId: null,
        },
      ],
    });

    expect(knownArtistsNormalized.has("artist one")).toBe(true);
    expect(knownArtistsNormalized.has("artist two")).toBe(true);
    expect(knownArtistsNormalized.has("artist three")).toBe(true);
    expect(knownArtistsNormalized.has("artist four")).toBe(true);
    expect(prompt).toContain("Roadtrip");
    expect(prompt).toContain("STRICT EXCLUSION LIST");
  });

  it("parses valid fenced and raw JSON recommendations", () => {
    const sample = {
      artists: [
        {
          name: "New Band",
          genre: "dream pop",
          reason: "Matches your indie listening.",
          sampleTracks: ["Track 1", "Track 2"],
        },
      ],
      playlists: [
        {
          title: "Late Night Drive",
          description: "Atmospheric tracks for night driving.",
          vibe: "Dreamy",
          reason: "Built from your Roadtrip playlist.",
          tracks: [
            { title: "T1", artist: "A1" },
            { title: "T2", artist: "A2" },
            { title: "T3", artist: "A3" },
            { title: "T4", artist: "A4" },
            { title: "T5", artist: "A5" },
          ],
        },
      ],
    };

    const parsed = parseGeminiRecommendationsJson(
      `\`\`\`json\n${JSON.stringify(sample)}\n\`\`\``,
    );
    expect(parsed.artists[0].name).toBe("New Band");
    expect(parsed.playlists[0].tracks).toHaveLength(5);
  });

  it("rejects empty or invalid JSON responses", () => {
    expect(() => parseGeminiRecommendationsJson("")).toThrow();
    expect(() => parseGeminiRecommendationsJson("not json")).toThrow();
    expect(() =>
      parseGeminiRecommendationsJson(JSON.stringify({ artists: [], playlists: [] })),
    ).toThrow();
  });
});
