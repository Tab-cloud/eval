DO $$
BEGIN
	IF (SELECT COUNT(*) FROM "tenants") > 1 THEN
		RAISE EXCEPTION 'single-site migration requires at most one tenant; merge tenant data before retrying';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;
--> statement-breakpoint
UPDATE "users" AS "u"
SET "role" = 'admin'
WHERE EXISTS (
	SELECT 1 FROM "memberships" AS "m"
	WHERE "m"."user_id" = "u"."id"
		AND "m"."role" IN ('platform_admin', 'tenant_admin')
);
--> statement-breakpoint
ALTER TABLE "auth_provider_settings" RENAME COLUMN "tenant_id" TO "encryption_context";
--> statement-breakpoint
ALTER TABLE "auth_provider_settings" DROP CONSTRAINT IF EXISTS "auth_provider_settings_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_provider_settings" DROP CONSTRAINT IF EXISTS "auth_provider_settings_pkey";
--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD COLUMN "id" text DEFAULT 'global';
--> statement-breakpoint
UPDATE "auth_provider_settings" SET "id" = 'global';
--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_provider_settings" ADD CONSTRAINT "auth_provider_settings_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "release_settings" RENAME COLUMN "tenant_id" TO "id";
--> statement-breakpoint
ALTER TABLE "release_settings" DROP CONSTRAINT IF EXISTS "release_settings_tenant_id_tenants_id_fk";
--> statement-breakpoint
UPDATE "release_settings" SET "id" = 'global';
--> statement-breakpoint
ALTER TABLE "agent_artifacts" DROP CONSTRAINT IF EXISTS "agent_artifacts_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP CONSTRAINT IF EXISTS "auth_sessions_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "billing_plans" DROP CONSTRAINT IF EXISTS "billing_plans_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "blog_posts" DROP CONSTRAINT IF EXISTS "blog_posts_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "desktop_auth_requests" DROP CONSTRAINT IF EXISTS "desktop_auth_requests_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "desktop_sessions" DROP CONSTRAINT IF EXISTS "desktop_sessions_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "forum_replies" DROP CONSTRAINT IF EXISTS "forum_replies_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "forum_topics" DROP CONSTRAINT IF EXISTS "forum_topics_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "release_versions" DROP CONSTRAINT IF EXISTS "release_versions_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "releases" DROP CONSTRAINT IF EXISTS "releases_tenant_id_tenants_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "agent_artifacts_tenant_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "agent_artifacts_tenant_embedded_version_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "audit_tenant_time_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "billing_plans_tenant_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "blog_posts_tenant_slug_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "blog_posts_tenant_status_time_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "forum_replies_tenant_time_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "forum_topics_tenant_slug_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "forum_topics_tenant_activity_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "release_versions_tenant_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "release_versions_tenant_version_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "release_versions_one_published_channel_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "releases_tenant_idx";
--> statement-breakpoint
UPDATE "releases" SET "visibility" = 'internal' WHERE "visibility" = 'tenant';
--> statement-breakpoint
ALTER TABLE "agent_artifacts" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "billing_plans" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "billing_plans" DROP COLUMN "seat_limit";
--> statement-breakpoint
ALTER TABLE "blog_posts" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "desktop_auth_requests" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "desktop_sessions" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "forum_replies" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "forum_topics" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "release_versions" DROP COLUMN "tenant_id";
--> statement-breakpoint
ALTER TABLE "releases" DROP COLUMN "tenant_id";
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_artifacts_embedded_version_uq" ON "agent_artifacts" USING btree ("embedded_version");
--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "blog_posts_slug_uq" ON "blog_posts" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "blog_posts_status_time_idx" ON "blog_posts" USING btree ("status", "published_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "forum_topics_slug_uq" ON "forum_topics" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "forum_topics_activity_idx" ON "forum_topics" USING btree ("last_activity_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "release_versions_version_uq" ON "release_versions" USING btree ("version", "channel");
--> statement-breakpoint
CREATE UNIQUE INDEX "release_versions_one_published_channel_uq" ON "release_versions" USING btree ("channel") WHERE "status" = 'published';
--> statement-breakpoint
DROP TABLE "memberships";
--> statement-breakpoint
DROP TABLE "tenants";
