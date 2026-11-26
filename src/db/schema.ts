import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const spotifyTokens = sqliteTable("spotify_tokens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  expiresAt: integer("expires_at").notNull(),
  scope: text("scope").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const playlistRules = sqliteTable("playlist_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  spotifyPlaylistId: text("spotify_playlist_id"),
  autoRefresh: integer("auto_refresh", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const spotifySyncState = sqliteTable("spotify_sync_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  syncStatus: text("sync_status").notNull().default("idle"),
  lastError: text("last_error"),
  likedSongsTotal: integer("liked_songs_total").notNull().default(0),
  followedArtistsTotal: integer("followed_artists_total").notNull().default(0),
  playlistsTotal: integer("playlists_total").notNull().default(0),
  historyTotal: integer("history_total").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const spotifyListeningHistory = sqliteTable("spotify_listening_history", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trackId: text("track_id").notNull(),
  trackName: text("track_name").notNull(),
  artistNames: text("artist_names").notNull(),
  albumName: text("album_name").notNull(),
  albumImageUrl: text("album_image_url"),
  spotifyUrl: text("spotify_url"),
  playedAt: text("played_at").notNull(),
});

export const spotifyLikedSongs = sqliteTable("spotify_liked_songs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trackId: text("track_id").notNull(),
  trackName: text("track_name").notNull(),
  artistNames: text("artist_names").notNull(),
  albumName: text("album_name").notNull(),
  albumImageUrl: text("album_image_url"),
  spotifyUrl: text("spotify_url"),
  addedAt: text("added_at").notNull(),
});

export const spotifyFollowedArtists = sqliteTable("spotify_followed_artists", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  artistId: text("artist_id").notNull(),
  name: text("name").notNull(),
  genresJson: text("genres_json").notNull().default("[]"),
  imageUrl: text("image_url"),
  followers: integer("followers").notNull().default(0),
  popularity: integer("popularity").notNull().default(0),
  spotifyUrl: text("spotify_url"),
});

export const spotifyPlaylists = sqliteTable("spotify_playlists", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  playlistId: text("playlist_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name").notNull(),
  isOwnedByUser: integer("is_owned_by_user", { mode: "boolean" })
    .notNull()
    .default(false),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  trackCount: integer("track_count").notNull().default(0),
  imageUrl: text("image_url"),
  spotifyUrl: text("spotify_url"),
  snapshotId: text("snapshot_id"),
});

export const recommendationJobs = sqliteTable("recommendation_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"), // queued | running | completed | failed
  stage: text("stage").notNull().default("Starting recommendation job"),
  primaryModel: text("primary_model").notNull().default("gemini-4-hydrogen"),
  activeModel: text("active_model").notNull().default("gemini-4-hydrogen"),
  fallbackUsed: integer("fallback_used", { mode: "boolean" })
    .notNull()
    .default(false),
  fallbackReason: text("fallback_reason"),
  geminiInteractionId: text("gemini_interaction_id"),
  errorMessage: text("error_message"),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const recommendedArtists = sqliteTable("recommended_artists", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => recommendationJobs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  genre: text("genre").notNull(),
  reason: text("reason").notNull(),
  sampleTracksJson: text("sample_tracks_json").notNull().default("[]"),
  spotifyArtistId: text("spotify_artist_id"),
  spotifyUrl: text("spotify_url"),
  imageUrl: text("image_url"),
  isFollowed: integer("is_followed", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const recommendedPlaylists = sqliteTable("recommended_playlists", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => recommendationJobs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  vibe: text("vibe").notNull(),
  reason: text("reason").notNull(),
  tracksJson: text("tracks_json").notNull().default("[]"),
  addedSpotifyPlaylistId: text("added_spotify_playlist_id"),
  addedSpotifyUrl: text("added_spotify_url"),
});
