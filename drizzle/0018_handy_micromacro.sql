ALTER TABLE "auth_provider_settings" ADD COLUMN "google_client_id" text;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "google_client_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "github_client_id" text;--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "github_client_secret_encrypted" text;