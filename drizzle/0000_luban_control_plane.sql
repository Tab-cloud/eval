CREATE TABLE `tenants` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `slug` text NOT NULL, `plan` text DEFAULT 'team' NOT NULL, `status` text DEFAULT 'active' NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_uq` ON `tenants` (`slug`);
--> statement-breakpoint
CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL, `email` text NOT NULL, `display_name` text NOT NULL, `avatar_url` text, `status` text NOT NULL, `last_login_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `memberships` (`id` text PRIMARY KEY NOT NULL, `tenant_id` text NOT NULL REFERENCES `tenants`(`id`), `user_id` text NOT NULL REFERENCES `users`(`id`), `role` text NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_tenant_user_uq` ON `memberships` (`tenant_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `membership_tenant_idx` ON `memberships` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `api_keys` (`id` text PRIMARY KEY NOT NULL, `tenant_id` text NOT NULL REFERENCES `tenants`(`id`), `owner_id` text NOT NULL REFERENCES `users`(`id`), `name` text NOT NULL, `prefix` text NOT NULL, `secret_hash` text NOT NULL, `scopes` text NOT NULL, `expires_at` integer, `last_used_at` integer, `revoked_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `api_keys_tenant_idx` ON `api_keys` (`tenant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash_uq` ON `api_keys` (`secret_hash`);
--> statement-breakpoint
CREATE TABLE `models` (`id` text PRIMARY KEY NOT NULL, `provider` text NOT NULL, `upstream_model` text NOT NULL, `display_name` text NOT NULL, `capabilities` text NOT NULL, `status` text NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_provider_name_uq` ON `models` (`provider`,`upstream_model`);
--> statement-breakpoint
CREATE TABLE `tenant_model_grants` (`id` text PRIMARY KEY NOT NULL, `tenant_id` text NOT NULL REFERENCES `tenants`(`id`), `model_id` text NOT NULL REFERENCES `models`(`id`), `requests_per_minute` integer DEFAULT 60 NOT NULL, `monthly_token_limit` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_model_grant_uq` ON `tenant_model_grants` (`tenant_id`,`model_id`);
--> statement-breakpoint
CREATE INDEX `model_grants_tenant_idx` ON `tenant_model_grants` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (`id` text PRIMARY KEY NOT NULL, `tenant_id` text NOT NULL REFERENCES `tenants`(`id`), `actor_id` text, `action` text NOT NULL, `resource_type` text NOT NULL, `resource_id` text, `ip_hash` text, `metadata` text, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `audit_tenant_time_idx` ON `audit_logs` (`tenant_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `releases` (`id` text PRIMARY KEY NOT NULL, `tenant_id` text REFERENCES `tenants`(`id`), `name` text NOT NULL, `version` text NOT NULL, `object_key` text NOT NULL, `sha256` text NOT NULL, `visibility` text NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `releases_tenant_idx` ON `releases` (`tenant_id`);
