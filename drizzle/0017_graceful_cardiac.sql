CREATE TABLE "artifact_download_stats" (
	"artifact_id" text NOT NULL,
	"download_date" text NOT NULL,
	"download_count" bigint DEFAULT 0 NOT NULL,
	"last_downloaded_at" bigint NOT NULL,
	CONSTRAINT "artifact_download_stats_pk" PRIMARY KEY("artifact_id","download_date")
);
--> statement-breakpoint
ALTER TABLE "artifact_download_stats" ADD CONSTRAINT "artifact_download_stats_artifact_id_agent_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."agent_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_download_stats_date_idx" ON "artifact_download_stats" USING btree ("download_date");