ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD COLUMN "intent" text DEFAULT 'login' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD COLUMN "link_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_locale" text DEFAULT 'zh' NOT NULL;--> statement-breakpoint
UPDATE "users" AS u SET "account_locale" = 'en' WHERE u."phone_e164" IS NULL AND EXISTS (SELECT 1 FROM "auth_oidc_identities" AS i WHERE i."user_id" = u."id" AND i."provider" = 'google');--> statement-breakpoint
ALTER TABLE "auth_oauth_states" ADD CONSTRAINT "auth_oauth_states_link_user_id_users_id_fk" FOREIGN KEY ("link_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_ci_uq" ON "users" USING btree (lower("username")) WHERE "users"."username" IS NOT NULL;
