ALTER TABLE "agent_artifacts" ADD COLUMN "signature_verified_at" bigint;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD COLUMN "signature_key_id" text;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD COLUMN "embedded_version" text;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD COLUMN "product_name" text;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD COLUMN "version_source" text;--> statement-breakpoint
WITH ranked_releases AS (
	SELECT "id", ROW_NUMBER() OVER (
		PARTITION BY "tenant_id", "channel"
		ORDER BY "published_at" DESC NULLS LAST, "created_at" DESC
	) AS "release_rank"
	FROM "release_versions"
	WHERE "status" = 'published'
)
UPDATE "release_versions"
SET "status" = 'draft'
WHERE "id" IN (SELECT "id" FROM ranked_releases WHERE "release_rank" > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "release_versions_one_published_channel_uq" ON "release_versions" USING btree ("tenant_id","channel") WHERE "release_versions"."status" = 'published';
