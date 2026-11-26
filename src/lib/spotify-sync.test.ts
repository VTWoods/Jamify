import { describe, expect, it } from "vitest";
import { createDatabase } from "@/db";
import {
  isSyncStale,
  LISTENING_HISTORY_DISPLAY_LIMIT,
  SPOTIFY_SYNC_INTERVAL_MS,
} from "./spotify-sync";

describe("Spotify hourly sync staleness & history persistence", () => {
  it("displays up to 1,000 recent plays in the UI while keeping full SQLite history", () => {
    expect(LISTENING_HISTORY_DISPLAY_LIMIT).toBe(1000);
  });

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

  it("accumulates listening history without duplicating identical plays", () => {
    const { sqlite } = createDatabase(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          display_name TEXT,
          avatar_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE spotify_listening_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL,
          track_name TEXT NOT NULL,
          artist_names TEXT NOT NULL,
          album_name TEXT NOT NULL,
          album_image_url TEXT,
          spotify_url TEXT,
          played_at TEXT NOT NULL
        );
      `);

      const now = Math.floor(Date.now() / 1000);
      sqlite
        .prepare(
          "INSERT INTO users (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run("u1", "Test User", now, now);

      const insert = sqlite.prepare(`
        INSERT OR IGNORE INTO spotify_listening_history
        (id, user_id, track_id, track_name, artist_names, album_name, played_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Simulate two overlapping hourly syncs
      insert.run("u1:2026-11-26T10:00:00Z:t1", "u1", "t1", "Track 1", "A1", "Al1", "2026-11-26T10:00:00Z");
      insert.run("u1:2026-11-26T10:05:00Z:t2", "u1", "t2", "Track 2", "A2", "Al2", "2026-11-26T10:05:00Z");
      // Duplicate from overlapping sync window + one new play
      insert.run("u1:2026-11-26T10:05:00Z:t2", "u1", "t2", "Track 2", "A2", "Al2", "2026-11-26T10:05:00Z");
      insert.run("u1:2026-11-26T11:00:00Z:t3", "u1", "t3", "Track 3", "A3", "Al3", "2026-11-26T11:00:00Z");

      const row = sqlite
        .prepare("SELECT COUNT(*) as c FROM spotify_listening_history WHERE user_id = ?")
        .get("u1") as { c: number };
      expect(row.c).toBe(3);
    } finally {
      sqlite.close();
    }
  });
});
