import { authDatabase, ensureAuthSchema, type AuthenticatedUser } from "../auth/core";
import { displayBlogAuthorName, normalizeContentCreationChannel } from "./attribution";

export const forumCategories = ["general", "hardware", "firmware", "agents"] as const;
export type ForumCategory = typeof forumCategories[number];

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentValidationError";
  }
}

export type ForumTopicSummary = {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: ForumCategory;
  status: "open" | "locked";
  pinned: boolean;
  authorName: string;
  authorId: string;
  replyCount: number;
  lastActivityAt: number;
  createdAt: number;
  createdVia: "web" | "eval_agent";
};

export type ForumReply = {
  id: string;
  body: string;
  authorName: string;
  authorId: string;
  createdAt: number;
  createdVia: "web" | "eval_agent";
};

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  authorName: string;
  publishedAt: number;
  updatedAt: number;
  createdVia: "web" | "eval_agent";
};

let contentSchemaInitialization: Promise<void> | null = null;

export function ensureContentSchema() {
  contentSchemaInitialization ??= initializeContentSchema().catch(error => {
    contentSchemaInitialization = null;
    throw error;
  });
  return contentSchemaInitialization;
}

async function initializeContentSchema() {
  await ensureAuthSchema();
  const statements = [
    "CREATE TABLE IF NOT EXISTS forum_topics (id text PRIMARY KEY NOT NULL, author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, title text NOT NULL, slug text NOT NULL, body text NOT NULL, category text DEFAULT 'general' NOT NULL, status text DEFAULT 'open' NOT NULL, pinned boolean DEFAULT false NOT NULL, last_activity_at bigint NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS forum_topics_slug_uq ON forum_topics (slug)",
    "CREATE INDEX IF NOT EXISTS forum_topics_activity_idx ON forum_topics (last_activity_at)",
    "CREATE INDEX IF NOT EXISTS forum_topics_author_time_idx ON forum_topics (author_id, created_at)",
    "CREATE TABLE IF NOT EXISTS forum_replies (id text PRIMARY KEY NOT NULL, topic_id text NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE, author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, body text NOT NULL, status text DEFAULT 'visible' NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS forum_replies_topic_time_idx ON forum_replies (topic_id, created_at)",
    "CREATE INDEX IF NOT EXISTS forum_replies_author_time_idx ON forum_replies (author_id, created_at)",
    "CREATE TABLE IF NOT EXISTS blog_posts (id text PRIMARY KEY NOT NULL, author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, title text NOT NULL, slug text NOT NULL, excerpt text NOT NULL, body text NOT NULL, status text DEFAULT 'draft' NOT NULL, published_at bigint, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_uq ON blog_posts (slug)",
    "CREATE INDEX IF NOT EXISTS blog_posts_status_time_idx ON blog_posts (status, published_at)",
    "ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'web'",
    "ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS desktop_session_id text",
    "ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'web'",
    "ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS desktop_session_id text",
    "ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'web'",
    "ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS desktop_session_id text",
    "CREATE INDEX IF NOT EXISTS forum_topics_agent_time_idx ON forum_topics (created_via, created_at)",
    "CREATE INDEX IF NOT EXISTS forum_replies_agent_time_idx ON forum_replies (created_via, created_at)",
    "CREATE INDEX IF NOT EXISTS blog_posts_agent_time_idx ON blog_posts (created_via, created_at)",
  ];
  await authDatabase().batch(statements.map(sql => authDatabase().prepare(sql)));
}

export async function forumOverview(_user: AuthenticatedUser, category?: string) {
  await ensureContentSchema();
  const selected = forumCategories.includes(category as ForumCategory) ? category as ForumCategory : null;
  const db = authDatabase();
  const topicsQuery = `
    SELECT t.id, t.slug, t.title, LEFT(t.body, 600) AS body, t.category, t.status, t.pinned, t.created_via AS "createdVia",
           t.author_id AS authorId, u.display_name AS authorName,
           t.last_activity_at AS lastActivityAt, t.created_at AS createdAt,
           COUNT(r.id) AS replyCount
    FROM forum_topics t
    JOIN users u ON u.id = t.author_id
    LEFT JOIN forum_replies r ON r.topic_id = t.id AND r.status = 'visible'
    WHERE t.status <> 'hidden'${selected ? " AND t.category = ?" : ""}
    GROUP BY t.id, u.display_name
    ORDER BY t.pinned DESC, t.last_activity_at DESC
    LIMIT 100
  `;
  const [topics, counts] = await Promise.all([
    db.prepare(topicsQuery).bind(...(selected ? [selected] : [])).all<ForumTopicSummary>(),
    db.prepare("SELECT category, COUNT(*) AS count FROM forum_topics WHERE status <> 'hidden' GROUP BY category")
      .all<{ category: ForumCategory; count: number }>(),
  ]);
  const categoryCounts = Object.fromEntries(forumCategories.map(item => [item, 0])) as Record<ForumCategory, number>;
  for (const row of counts.results) categoryCounts[row.category] = Number(row.count);
  return { topics: topics.results.map(mapForumTopic), categoryCounts, selectedCategory: selected };
}

export async function forumTopic(_user: AuthenticatedUser, slug: string) {
  await ensureContentSchema();
  const db = authDatabase();
  const topic = await db.prepare(`
    SELECT t.id, t.slug, t.title, t.body, t.category, t.status, t.pinned, t.created_via AS "createdVia",
           t.author_id AS authorId, u.display_name AS authorName,
           t.last_activity_at AS lastActivityAt, t.created_at AS createdAt,
           (SELECT COUNT(*) FROM forum_replies r WHERE r.topic_id = t.id AND r.status = 'visible') AS replyCount
    FROM forum_topics t JOIN users u ON u.id = t.author_id
    WHERE t.slug = ? AND t.status <> 'hidden'
    LIMIT 1
  `).bind(slug).first<ForumTopicSummary>();
  if (!topic) return null;
  const replies = await db.prepare(`
    SELECT r.id, r.body, r.author_id AS authorId, u.display_name AS authorName, r.created_at AS createdAt, r.created_via AS "createdVia"
    FROM forum_replies r JOIN users u ON u.id = r.author_id
    WHERE r.topic_id = ? AND r.status = 'visible'
    ORDER BY r.created_at ASC LIMIT 500
  `).bind(topic.id).all<ForumReply>();
  return { topic: mapForumTopic(topic), replies: replies.results.map(mapForumReply) };
}

export async function createForumTopic(user: AuthenticatedUser, input: Record<string, unknown>) {
  await ensureContentSchema();
  const { title, body, category } = validateForumTopicInput(input);
  const db = authDatabase();
  const now = epochSeconds();
  const recent = await db.prepare("SELECT COUNT(*) AS count FROM forum_topics WHERE author_id = ? AND created_at >= ?")
    .bind(user.id, now - 3600).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 5) throw new Error("每小时最多发布 5 个主题，请稍后再试。");
  const id = `topic_${crypto.randomUUID()}`;
  const slug = contentSlug(title, "topic");
  await db.batch([
    db.prepare("INSERT INTO forum_topics (id, author_id, title, slug, body, category, status, pinned, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', false, ?, ?, ?)")
      .bind(id, user.id, title, slug, body, category, now, now, now),
    auditStatement(user, "forum.topic.create", "forum_topic", id, { category, titleLength: title.length, bodyLength: body.length }, now),
  ]);
  return { id, slug };
}

export async function createForumReply(user: AuthenticatedUser, topicId: string, input: Record<string, unknown>) {
  await ensureContentSchema();
  const body = validateForumReplyInput(input);
  const db = authDatabase();
  const now = epochSeconds();
  const [topic, recent] = await Promise.all([
    db.prepare("SELECT id, slug, status FROM forum_topics WHERE id = ?").bind(topicId).first<{ id: string; slug: string; status: string }>(),
    db.prepare("SELECT COUNT(*) AS count FROM forum_replies WHERE author_id = ? AND created_at >= ?")
      .bind(user.id, now - 3600).first<{ count: number }>(),
  ]);
  if (!topic || topic.status === "hidden") throw new Error("主题不存在。");
  if (topic.status === "locked") throw new Error("该主题已锁定，不能继续回复。");
  if (Number(recent?.count ?? 0) >= 30) throw new Error("每小时最多发布 30 条回复，请稍后再试。");
  const id = `reply_${crypto.randomUUID()}`;
  await db.batch([
    db.prepare("INSERT INTO forum_replies (id, topic_id, author_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'visible', ?, ?)")
      .bind(id, topicId, user.id, body, now, now),
    db.prepare("UPDATE forum_topics SET last_activity_at = ?, updated_at = ? WHERE id = ? AND status = 'open'")
      .bind(now, now, topicId),
    auditStatement(user, "forum.reply.create", "forum_reply", id, { topicId, bodyLength: body.length }, now),
  ]);
  return { id, slug: topic.slug };
}

export async function publishedBlogPosts(limit = 50) {
  await ensureContentSchema();
  const now = epochSeconds();
  const rows = await authDatabase().prepare(`
    SELECT p.id, p.slug, p.title, p.excerpt, '' AS body, u.display_name AS authorName, p.created_via AS "createdVia",
           p.published_at AS publishedAt, p.updated_at AS updatedAt
    FROM blog_posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.status = 'published' AND p.published_at IS NOT NULL AND p.published_at <= ?
    ORDER BY p.published_at DESC LIMIT ?
  `).bind(now, Math.min(Math.max(limit, 1), 100)).all<BlogPostSummary>();
  return rows.results.map(mapBlogPost);
}

export async function publishedBlogPost(slug: string) {
  await ensureContentSchema();
  const now = epochSeconds();
  const row = await authDatabase().prepare(`
    SELECT p.id, p.slug, p.title, p.excerpt, p.body, u.display_name AS authorName, p.created_via AS "createdVia",
           p.published_at AS publishedAt, p.updated_at AS updatedAt
    FROM blog_posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.slug = ? AND p.status = 'published'
      AND p.published_at IS NOT NULL AND p.published_at <= ?
    LIMIT 1
  `).bind(slug, now).first<BlogPostSummary>();
  return row ? mapBlogPost(row) : null;
}

export function contentSlug(title: string, fallback: string) {
  const base = title.normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || fallback;
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.replaceAll("\0", "").replace(/\r\n?/g, "\n").trim() : "";
}

export function validateForumTopicInput(input: Record<string, unknown>) {
  const title = cleanText(input.title);
  const body = cleanText(input.body);
  const category = forumCategories.includes(input.category as ForumCategory) ? input.category as ForumCategory : "general";
  if (title.length < 4 || title.length > 120) throw new ContentValidationError("主题标题需要 4–120 个字符。");
  if (body.length < 20 || body.length > 10_000) throw new ContentValidationError("主题正文需要 20–10,000 个字符。");
  return { title, body, category };
}

export function validateForumReplyInput(input: Record<string, unknown>) {
  const body = cleanText(input.body);
  if (body.length < 2 || body.length > 5_000) throw new ContentValidationError("回复需要 2–5,000 个字符。");
  return body;
}

export function validateBlogDraftInput(input: Record<string, unknown>) {
  const title = cleanText(input.title);
  const excerpt = cleanText(input.excerpt);
  const body = cleanText(input.body);
  if (title.length < 4 || title.length > 140) throw new ContentValidationError("博客标题需要 4–140 个字符。");
  if (excerpt.length < 10 || excerpt.length > 320) throw new ContentValidationError("博客摘要需要 10–320 个字符。");
  if (body.length < 40 || body.length > 50_000) throw new ContentValidationError("博客正文需要 40–50,000 个字符。");
  return { title, excerpt, body };
}

function auditStatement(user: AuthenticatedUser, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>, now: number) {
  return authDatabase().prepare("INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(`audit_${crypto.randomUUID()}`, user.id, action, resourceType, resourceId, JSON.stringify(metadata), now);
}

function mapForumTopic(row: ForumTopicSummary): ForumTopicSummary {
  return { ...row, createdVia: row.createdVia === "eval_agent" ? "eval_agent" : "web", pinned: Boolean(row.pinned), replyCount: Number(row.replyCount), lastActivityAt: Number(row.lastActivityAt), createdAt: Number(row.createdAt) };
}

function mapForumReply(row: ForumReply): ForumReply {
  return { ...row, createdVia: row.createdVia === "eval_agent" ? "eval_agent" : "web", createdAt: Number(row.createdAt) };
}

function mapBlogPost(row: BlogPostSummary): BlogPostSummary {
  const createdVia = normalizeContentCreationChannel(row.createdVia);
  return {
    ...row,
    authorName: displayBlogAuthorName(row.authorName, createdVia),
    createdVia,
    publishedAt: Number(row.publishedAt),
    updatedAt: Number(row.updatedAt),
  };
}

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}
