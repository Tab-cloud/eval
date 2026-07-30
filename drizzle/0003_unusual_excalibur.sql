CREATE TABLE `auth_login_attempts` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`first_failed_at` integer NOT NULL,
	`blocked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gateway_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`api_key_id` text NOT NULL,
	`model_config_id` text,
	`endpoint` text NOT NULL,
	`status_code` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_config_id`) REFERENCES `llm_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gateway_requests_tenant_time_idx` ON `gateway_requests` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `gateway_requests_key_time_idx` ON `gateway_requests` (`api_key_id`,`created_at`);