CREATE TABLE `recommendation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'Starting recommendation job' NOT NULL,
	`primary_model` text DEFAULT 'gemini-4-hydrogen' NOT NULL,
	`active_model` text DEFAULT 'gemini-4-hydrogen' NOT NULL,
	`fallback_used` integer DEFAULT false NOT NULL,
	`fallback_reason` text,
	`gemini_interaction_id` text,
	`error_message` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommended_artists` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`genre` text NOT NULL,
	`reason` text NOT NULL,
	`sample_tracks_json` text DEFAULT '[]' NOT NULL,
	`spotify_artist_id` text,
	`spotify_url` text,
	`image_url` text,
	`is_followed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `recommendation_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommended_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`vibe` text NOT NULL,
	`reason` text NOT NULL,
	`tracks_json` text DEFAULT '[]' NOT NULL,
	`added_spotify_playlist_id` text,
	`added_spotify_url` text,
	FOREIGN KEY (`job_id`) REFERENCES `recommendation_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spotify_followed_artists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`name` text NOT NULL,
	`genres_json` text DEFAULT '[]' NOT NULL,
	`image_url` text,
	`followers` integer DEFAULT 0 NOT NULL,
	`popularity` integer DEFAULT 0 NOT NULL,
	`spotify_url` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spotify_liked_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`track_name` text NOT NULL,
	`artist_names` text NOT NULL,
	`album_name` text NOT NULL,
	`album_image_url` text,
	`spotify_url` text,
	`added_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spotify_listening_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`track_name` text NOT NULL,
	`artist_names` text NOT NULL,
	`album_name` text NOT NULL,
	`album_image_url` text,
	`spotify_url` text,
	`played_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spotify_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`is_owned_by_user` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`track_count` integer DEFAULT 0 NOT NULL,
	`image_url` text,
	`spotify_url` text,
	`snapshot_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spotify_sync_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_synced_at` integer,
	`sync_status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`liked_songs_total` integer DEFAULT 0 NOT NULL,
	`followed_artists_total` integer DEFAULT 0 NOT NULL,
	`playlists_total` integer DEFAULT 0 NOT NULL,
	`history_total` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_url` text;