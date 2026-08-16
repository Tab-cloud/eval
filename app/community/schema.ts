import { authDatabase, ensureAuthSchema } from "../auth/core";
import { ensureContentSchema } from "../content/store";

let initialization: Promise<void> | null = null;

export function ensureAgentCommunitySchema() {
  initialization ??= initialize().catch(error => {
    initialization = null;
    throw error;
  });
  return initialization;
}
async function initialize() {
  await ensureAuthSchema();
  await ensureContentSchema();
  const db = authDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    "ALTER TABLE desktop_auth_requests ADD COLUMN IF NOT EXISTS requested_scopes jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE desktop_auth_requests ADD COLUMN IF NOT EXISTS approved_scopes jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE desktop_sessions ADD COLUMN IF NOT EXISTS granted_scopes jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE desktop_sessions ADD COLUMN IF NOT EXISTS permissions_updated_at bigint NOT NULL DEFAULT 0",
    "ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'web'",
    "ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS desktop_session_id text",
    "ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'web'",
    "ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS desktop_session_id text",
    "ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'web'",
    "ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS desktop_session_id text",
    "CREATE TABLE IF NOT EXISTS agent_community_policy (id text PRIMARY KEY NOT NULL DEFAULT 'global', enabled boolean NOT NULL DEFAULT false, writes_enabled boolean NOT NULL DEFAULT false, allow_forum_read boolean NOT NULL DEFAULT false, allow_forum_topic_create boolean NOT NULL DEFAULT false, allow_forum_reply_create boolean NOT NULL DEFAULT false, allow_blog_draft_create boolean NOT NULL DEFAULT false, allow_blog_publish boolean NOT NULL DEFAULT false, forum_topics_per_hour integer NOT NULL DEFAULT 3, forum_replies_per_hour integer NOT NULL DEFAULT 15, blog_drafts_per_day integer NOT NULL DEFAULT 3, blog_publishes_per_day integer NOT NULL DEFAULT 1, policy_version integer NOT NULL DEFAULT 1, updated_by text REFERENCES users(id) ON DELETE SET NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE TABLE IF NOT EXISTS user_agent_community_settings (user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT false, allow_forum_read boolean NOT NULL DEFAULT false, allow_forum_topic_create boolean NOT NULL DEFAULT false, allow_forum_reply_create boolean NOT NULL DEFAULT false, allow_blog_draft_create boolean NOT NULL DEFAULT false, allow_blog_publish boolean NOT NULL DEFAULT false, updated_at bigint NOT NULL)",
    "CREATE TABLE IF NOT EXISTS agent_community_actions (id text PRIMARY KEY NOT NULL, request_id text NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, desktop_session_id text NOT NULL REFERENCES desktop_sessions(id) ON DELETE CASCADE, action text NOT NULL, idempotency_key_hash text NOT NULL, request_digest text NOT NULL, resource_type text, resource_id text, status text NOT NULL, reason_code text, response jsonb, created_at bigint NOT NULL, completed_at bigint)",
    "CREATE UNIQUE INDEX IF NOT EXISTS agent_community_actions_session_key_uq ON agent_community_actions (desktop_session_id, idempotency_key_hash)",
    "CREATE INDEX IF NOT EXISTS agent_community_actions_user_time_idx ON agent_community_actions (user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS agent_community_actions_session_time_idx ON agent_community_actions (desktop_session_id, created_at)",
    "CREATE INDEX IF NOT EXISTS forum_topics_agent_time_idx ON forum_topics (created_via, created_at)",
    "CREATE INDEX IF NOT EXISTS forum_replies_agent_time_idx ON forum_replies (created_via, created_at)",
    "CREATE INDEX IF NOT EXISTS blog_posts_agent_time_idx ON blog_posts (created_via, created_at)",
  ].map(sql => db.prepare(sql)));
  await db.prepare(`INSERT INTO agent_community_policy (id, created_at, updated_at)
    VALUES ('global', ?, ?) ON CONFLICT (id) DO NOTHING`).bind(now, now).run();
}
