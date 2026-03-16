CREATE TABLE `analytics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`campaign_id` integer,
	`lead_id` integer,
	`metadata` text DEFAULT '{}',
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `apify_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer,
	`actor_id` text NOT NULL,
	`run_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`input_params` text DEFAULT '{}',
	`result_count` integer DEFAULT 0,
	`dataset_id` text,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`finished_at` text,
	`cost_usd` real,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`agency_type` text DEFAULT 'general' NOT NULL,
	`target_niche` text NOT NULL,
	`apify_actors` text DEFAULT '[]',
	`search_params` text DEFAULT '{}',
	`actor_configs` text DEFAULT '{}',
	`kpi_definitions` text DEFAULT '[]',
	`lead_field_definitions` text DEFAULT '[]',
	`schedule_frequency` text DEFAULT 'once' NOT NULL,
	`last_discovery_at` text,
	`ai_provider` text DEFAULT 'openai' NOT NULL,
	`auto_enrich` integer DEFAULT true NOT NULL,
	`max_leads_per_run` integer DEFAULT 50,
	`max_pages_per_search` integer DEFAULT 5,
	`status` text DEFAULT 'draft' NOT NULL,
	`enrichment_concurrency` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_actors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text NOT NULL,
	`name` text NOT NULL,
	`phase` text NOT NULL,
	`description` text,
	`required_input_fields` text DEFAULT '[]',
	`input_field_descriptions` text DEFAULT '{}',
	`default_input` text DEFAULT '{}',
	`page_limit_key` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_actors_actor_id_unique` ON `custom_actors` (`actor_id`);--> statement-breakpoint
CREATE TABLE `lead_personalization` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`website_tech_stack` text DEFAULT '[]',
	`website_quality_score` integer,
	`has_chatbot` integer DEFAULT false,
	`has_booking_system` integer DEFAULT false,
	`has_automation` integer DEFAULT false,
	`recent_news` text,
	`company_description` text,
	`key_products` text,
	`founders_info` text,
	`last_blog_post` text,
	`social_media_presence` text DEFAULT '{}',
	`pain_points` text DEFAULT '[]',
	`personalization_summary` text,
	`enrichment_actors` text DEFAULT '[]',
	`raw_enrichment_data` text DEFAULT '{}',
	`campaign_kpis` text DEFAULT '{}',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer,
	`source` text NOT NULL,
	`source_run_id` text,
	`display_name` text,
	`email` text,
	`phone` text,
	`website` text,
	`score` integer DEFAULT 0,
	`status` text DEFAULT 'new' NOT NULL,
	`raw_data` text DEFAULT '{}',
	`mapped_data` text DEFAULT '{}',
	`llm_cost_usd` real DEFAULT 0,
	`llm_input_tokens` integer DEFAULT 0,
	`llm_output_tokens` integer DEFAULT 0,
	`apify_cost_usd` real DEFAULT 0 NOT NULL,
	`discovery_llm_cost_usd` real DEFAULT 0 NOT NULL,
	`discovery_apify_cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `llm_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`operation` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);