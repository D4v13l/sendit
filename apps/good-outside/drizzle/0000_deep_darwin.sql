CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`source_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`geometry` text,
	`activities` text NOT NULL,
	`activity_evidence` text NOT NULL,
	`source_url` text NOT NULL,
	`license` text NOT NULL,
	`attribution` text NOT NULL,
	`country` text,
	`road` text,
	`camp` text DEFAULT 'unknown' NOT NULL,
	`camp_note` text,
	`access` text DEFAULT 'unknown' NOT NULL,
	`upstream_sources` text,
	`fetched_at` text NOT NULL,
	`last_verified_at` text NOT NULL,
	`stale_at` text NOT NULL,
	`removed_at` text,
	`run_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_provider_source` ON `locations` (`provider`,`source_id`);--> statement-breakpoint
CREATE INDEX `locations_coordinates` ON `locations` (`lat`,`lon`);--> statement-breakpoint
CREATE INDEX `locations_canonical` ON `locations` (`canonical_id`);--> statement-breakpoint
CREATE TABLE `provider_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`received_count` integer DEFAULT 0 NOT NULL,
	`written_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`last_success_at` text
);
--> statement-breakpoint
CREATE INDEX `provider_runs_provider` ON `provider_runs` (`provider`,`started_at`);--> statement-breakpoint
CREATE TABLE `provider_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`expected_count` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_snapshots_active` ON `provider_snapshots` (`provider`) WHERE status = 'running';--> statement-breakpoint
CREATE TABLE `refresh_jobs` (
	`provider` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`snapshot_id` text,
	`last_attempt_at` text,
	`last_success_at` text,
	`cursor` integer DEFAULT 0 NOT NULL,
	`received_count` integer DEFAULT 0 NOT NULL,
	`written_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`updated_at` text NOT NULL,
	`lease_until` text
);
