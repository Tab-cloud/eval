CREATE TABLE "artifact_cleanup_queue" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
WITH "ranked_artifacts" AS (
	SELECT "id", "object_key",
		FIRST_VALUE("id") OVER (PARTITION BY "tenant_id", "embedded_version" ORDER BY "created_at" DESC, "id" DESC) AS "keeper_id",
		ROW_NUMBER() OVER (PARTITION BY "tenant_id", "embedded_version" ORDER BY "created_at" DESC, "id" DESC) AS "artifact_rank"
	FROM "agent_artifacts"
	WHERE "embedded_version" IS NOT NULL
)
INSERT INTO "artifact_cleanup_queue" ("object_key", "created_at")
SELECT "object_key", FLOOR(EXTRACT(EPOCH FROM NOW()))::bigint
FROM "ranked_artifacts"
WHERE "artifact_rank" > 1
ON CONFLICT ("object_key") DO NOTHING;
--> statement-breakpoint
WITH "ranked_artifacts" AS (
	SELECT "id",
		FIRST_VALUE("id") OVER (PARTITION BY "tenant_id", "embedded_version" ORDER BY "created_at" DESC, "id" DESC) AS "keeper_id",
		ROW_NUMBER() OVER (PARTITION BY "tenant_id", "embedded_version" ORDER BY "created_at" DESC, "id" DESC) AS "artifact_rank"
	FROM "agent_artifacts"
	WHERE "embedded_version" IS NOT NULL
)
UPDATE "release_versions"
SET "artifact_id" = "ranked_artifacts"."keeper_id"
FROM "ranked_artifacts"
WHERE "ranked_artifacts"."artifact_rank" > 1
	AND "release_versions"."artifact_id" = "ranked_artifacts"."id";
--> statement-breakpoint
WITH "ranked_artifacts" AS (
	SELECT "id",
		ROW_NUMBER() OVER (PARTITION BY "tenant_id", "embedded_version" ORDER BY "created_at" DESC, "id" DESC) AS "artifact_rank"
	FROM "agent_artifacts"
	WHERE "embedded_version" IS NOT NULL
)
DELETE FROM "agent_artifacts"
WHERE "id" IN (SELECT "id" FROM "ranked_artifacts" WHERE "artifact_rank" > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_artifacts_tenant_embedded_version_uq" ON "agent_artifacts" USING btree ("tenant_id","embedded_version");
