CREATE TABLE "auth_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"consumed_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_oidc_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"email_at_link" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sms_challenges" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" bigint NOT NULL,
	"consumed_at" bigint,
	"aliyun_biz_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sms_rate_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_started_at" bigint NOT NULL,
	"send_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" bigint,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "auth_oidc_identities" ADD CONSTRAINT "auth_oidc_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_oidc_provider_subject_uq" ON "auth_oidc_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_oidc_provider_user_uq" ON "auth_oidc_identities" USING btree ("provider","user_id");--> statement-breakpoint
CREATE INDEX "auth_oidc_user_idx" ON "auth_oidc_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone_e164");