import { describe, expect, it } from "vitest";
import { isSyncStale, SPOTIFY_SYNC_INTERVAL_MS } from "./spotify-sync";

describe("Spotify hourly sync staleness", () => {
  it("treats null lastSyncedAt as stale", () => {
    expect(isSyncStale(null)).toBe(true);
    expect(isSyncStale(undefined)).toBe(true);
  });

  it("treats sync within the last hour as fresh", () => {
    const now = Date.now();
    const fiftyNineMinAgo = new Date(now - (SPOTIFY_SYNC_INTERVAL_MS - 60_000));
    expect(isSyncStale(fiftyNineMinAgo, now)).toBe(false);
  });

  it("treats sync at or beyond 1 hour as stale", () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - SPOTIFY_SYNC_INTERVAL_MS);
    expect(isSyncStale(oneHourAgo, now)).toBe(true);
  });
});
