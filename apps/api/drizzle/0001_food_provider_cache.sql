CREATE TABLE IF NOT EXISTS `food_provider_cache` (
  `cache_key` text PRIMARY KEY NOT NULL,
  `payload_json` text NOT NULL,
  `expires_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `food_provider_cache_expires_idx`
  ON `food_provider_cache` (`expires_at`);
