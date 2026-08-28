CREATE TABLE "release_artifacts" (
	"release_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "release_artifacts_pk" PRIMARY KEY("release_id","artifact_id")
);
--> statement-breakpoint
DROP INDEX "agent_artifacts_embedded_version_uq";--> statement-breakpoint
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_release_id_release_versions_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_artifact_id_agent_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."agent_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_artifacts_artifact_idx" ON "release_artifacts" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_artifacts_release_target_uq" ON "agent_artifacts" USING btree ("embedded_version","platform","architecture","format");--> statement-breakpoint
INSERT INTO "release_artifacts" ("release_id", "artifact_id", "created_at") SELECT "id", "artifact_id", "created_at" FROM "release_versions" ON CONFLICT ("release_id", "artifact_id") DO NOTHING;
