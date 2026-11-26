CREATE TABLE `commute_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`target_minutes` integer DEFAULT 60 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`spotify_playlist_id` text,
	`spotify_url` text,
	`last_generated_week_key` text,
	`last_applied_date_key` text,
	`last_applied_weekday` integer,
	`last_applied_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `commute_daily_editions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`week_key` text NOT NULL,
	`kind` text NOT NULL,
	`weekday` integer NOT NULL,
	`theme` text NOT NULL,
	`tracks_json` text DEFAULT '[]' NOT NULL,
	`total_duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `commute_generation_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `commute_generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_key` text NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'Queued commute playlist generation' NOT NULL,
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
