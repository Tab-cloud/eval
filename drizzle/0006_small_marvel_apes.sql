ALTER TABLE "auth_oauth_states" ADD COLUMN "provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "github_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "github_client_id_ref" text DEFAULT 'GITHUB_OAUTH_CLIENT_ID' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "github_client_secret_ref" text DEFAULT 'GITHUB_OAUTH_CLIENT_SECRET' NOT NULL;