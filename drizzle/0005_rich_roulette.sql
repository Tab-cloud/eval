CREATE TABLE "desktop_auth_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code_hash" text NOT NULL,
	"source_hash" text NOT NULL,
	"device_name" text NOT NULL,
	"client_version" text NOT NULL,
	"status" text NOT NULL,
	"user_id" text,
	"tenant_id" text,
	"expires_at" bigint NOT NULL,
	"approved_at" bigint,
	"consumed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desktop_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"device_name" text NOT NULL,
	"client_version" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"revoked_at" bigint,
	"last_used_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD COLUMN "return_path" text DEFAULT '/console' NOT NULL;--> statement-breakpoint
ALTER TABLE "desktop_auth_requests" ADD CONSTRAINT "desktop_auth_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_auth_requests" ADD CONSTRAINT "desktop_auth_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_sessions" ADD CONSTRAINT "desktop_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_sessions" ADD CONSTRAINT "desktop_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_auth_device_code_uq" ON "desktop_auth_requests" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_auth_user_code_uq" ON "desktop_auth_requests" USING btree ("user_code_hash");--> statement-breakpoint
CREATE INDEX "desktop_auth_source_time_idx" ON "desktop_auth_requests" USING btree ("source_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_sessions_token_uq" ON "desktop_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "desktop_sessions_user_idx" ON "desktop_sessions" USING btree ("user_id");