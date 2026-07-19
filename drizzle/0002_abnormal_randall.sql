CREATE TABLE `agent_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`file_name` text NOT NULL,
	`label` text NOT NULL,
	`format` text NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_artifacts_tenant_idx` ON `agent_artifacts` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_artifacts_object_key_uq` ON `agent_artifacts` (`object_key`);--> statement-breakpoint
CREATE TABLE `billing_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`monthly_price_cents` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`request_limit` integer NOT NULL,
	`seat_limit` integer NOT NULL,
	`features` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `billing_plans_tenant_idx` ON `billing_plans` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `llm_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`display_name` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`base_url` text NOT NULL,
	`secret_ref` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`requests_per_minute` integer DEFAULT 60 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `llm_configs_tenant_idx` ON `llm_configs` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `release_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`version` text NOT NULL,
	`channel` text NOT NULL,
	`artifact_id` text NOT NULL,
	`notes` text NOT NULL,
	`mandatory` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `agent_artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `release_versions_tenant_idx` ON `release_versions` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_versions_tenant_version_uq` ON `release_versions` (`tenant_id`,`version`,`channel`);