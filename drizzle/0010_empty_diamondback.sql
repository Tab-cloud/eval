CREATE TABLE "release_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"updater_public_key" text NOT NULL,
	"updater_public_key_id" text NOT NULL,
	"updated_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "release_settings" ADD CONSTRAINT "release_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_settings" ADD CONSTRAINT "release_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;