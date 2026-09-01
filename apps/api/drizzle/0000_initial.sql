CREATE TABLE IF NOT EXISTS `sync_entities` (
  `user_id` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `version` integer NOT NULL,
  `payload_json` text,
  `updated_at` text NOT NULL,
  `deleted_at` text,
  PRIMARY KEY (`user_id`, `entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sync_entities_user_type_idx`
  ON `sync_entities` (`user_id`, `entity_type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sync_changes` (
  `sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `version` integer NOT NULL,
  `operation` text NOT NULL,
  `payload_json` text,
  `changed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sync_changes_user_sequence_idx`
  ON `sync_changes` (`user_id`, `sequence`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `processed_mutations` (
  `user_id` text NOT NULL,
  `mutation_id` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `version` integer NOT NULL,
  `processed_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `mutation_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_devices` (
  `user_id` text NOT NULL,
  `device_id` text NOT NULL,
  `last_seen_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `device_id`)
);

