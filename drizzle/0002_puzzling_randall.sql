ALTER TABLE "agent_artifacts" ADD COLUMN "updater_signature" text;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD COLUMN "platform" text DEFAULT 'windows' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD COLUMN "architecture" text DEFAULT 'x86_64' NOT NULL;