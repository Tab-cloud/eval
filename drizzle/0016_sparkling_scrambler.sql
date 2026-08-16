CREATE TABLE "agent_community_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"desktop_session_id" text NOT NULL,
	"action" text NOT NULL,
	"idempotency_key_hash" text NOT NULL,
	"request_digest" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"status" text NOT NULL,
	"reason_code" text,
	"response" jsonb,
	"created_at" bigint NOT NULL,
	"completed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "agent_community_policy" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"writes_enabled" boolean DEFAULT false NOT NULL,
	"allow_forum_read" boolean DEFAULT false NOT NULL,
	"allow_forum_topic_create" boolean DEFAULT false NOT NULL,
	"allow_forum_reply_create" boolean DEFAULT false NOT NULL,
	"allow_blog_draft_create" boolean DEFAULT false NOT NULL,
	"allow_blog_publish" boolean DEFAULT false NOT NULL,
	"forum_topics_per_hour" integer DEFAULT 3 NOT NULL,
	"forum_replies_per_hour" integer DEFAULT 15 NOT NULL,
	"blog_drafts_per_day" integer DEFAULT 3 NOT NULL,
	"blog_publishes_per_day" integer DEFAULT 1 NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_agent_community_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allow_forum_read" boolean DEFAULT false NOT NULL,
	"allow_forum_topic_create" boolean DEFAULT false NOT NULL,
	"allow_forum_reply_create" boolean DEFAULT false NOT NULL,
	"allow_blog_draft_create" boolean DEFAULT false NOT NULL,
	"allow_blog_publish" boolean DEFAULT false NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "created_via" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "desktop_session_id" text;--> statement-breakpoint
ALTER TABLE "desktop_auth_requests" ADD COLUMN "requested_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "desktop_auth_requests" ADD COLUMN "approved_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "desktop_sessions" ADD COLUMN "granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "desktop_sessions" ADD COLUMN "permissions_updated_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD COLUMN "created_via" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD COLUMN "desktop_session_id" text;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD COLUMN "created_via" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD COLUMN "desktop_session_id" text;--> statement-breakpoint
ALTER TABLE "agent_community_actions" ADD CONSTRAINT "agent_community_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_community_actions" ADD CONSTRAINT "agent_community_actions_desktop_session_id_desktop_sessions_id_fk" FOREIGN KEY ("desktop_session_id") REFERENCES "public"."desktop_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_community_policy" ADD CONSTRAINT "agent_community_policy_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_community_settings" ADD CONSTRAINT "user_agent_community_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_community_actions_session_key_uq" ON "agent_community_actions" USING btree ("desktop_session_id","idempotency_key_hash");--> statement-breakpoint
CREATE INDEX "agent_community_actions_user_time_idx" ON "agent_community_actions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_community_actions_session_time_idx" ON "agent_community_actions" USING btree ("desktop_session_id","created_at");--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_desktop_session_id_desktop_sessions_id_fk" FOREIGN KEY ("desktop_session_id") REFERENCES "public"."desktop_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_desktop_session_id_desktop_sessions_id_fk" FOREIGN KEY ("desktop_session_id") REFERENCES "public"."desktop_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_desktop_session_id_desktop_sessions_id_fk" FOREIGN KEY ("desktop_session_id") REFERENCES "public"."desktop_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_posts_agent_time_idx" ON "blog_posts" USING btree ("created_via","created_at");--> statement-breakpoint
CREATE INDEX "forum_replies_agent_time_idx" ON "forum_replies" USING btree ("created_via","created_at");--> statement-breakpoint
CREATE INDEX "forum_topics_agent_time_idx" ON "forum_topics" USING btree ("created_via","created_at");
--> statement-breakpoint
INSERT INTO "agent_community_policy" ("id", "created_at", "updated_at")
VALUES ('global', FLOOR(EXTRACT(EPOCH FROM NOW()))::bigint, FLOOR(EXTRACT(EPOCH FROM NOW()))::bigint)
ON CONFLICT ("id") DO NOTHING;
