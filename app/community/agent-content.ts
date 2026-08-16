import { authDatabase } from "../auth/core";
import { contentSlug, forumCategories, validateBlogDraftInput, validateForumReplyInput, validateForumTopicInput, type ForumCategory } from "../content/store";
import { AgentApiError, isoTime } from "./agent-api";
import { agentCompletionStatements, type AgentActionHandle } from "./agent-actions";
import type { AgentCommunityContext } from "./policy-store";
import { ensureAgentCommunitySchema } from "./schema";

type TopicCursor = { key: number; id: string };

export async function agentForumTopics(options: { category: string | null; sort: string | null; since: number | null; cursor: string | null; limit: number }) {
  await ensureAgentCommunitySchema();
  const category = options.category && forumCategories.includes(options.category as ForumCategory) ? options.category as ForumCategory : null;
  if (options.category && !category) throw new AgentApiError("validation_error", "category 不在允许范围内。", 422);
  const sort = options.sort === "recent" ? "recent" : options.sort === "active" || !options.sort ? "active" : null;
  if (!sort) throw new AgentApiError("validation_error", "sort 只能是 recent 或 active。", 422);
  const cursor = decodeCursor(options.cursor);
  const sortColumn = sort === "recent" ? "t.created_at" : "t.last_activity_at";
  const conditions = ["t.status <> 'hidden'"];
  const parameters: unknown[] = [];
  if (category) { conditions.push("t.category = ?"); parameters.push(category); }
  if (options.since) { conditions.push(`${sortColumn} >= ?`); parameters.push(options.since); }
  if (cursor) { conditions.push(`(${sortColumn} < ? OR (${sortColumn} = ? AND t.id < ?))`); parameters.push(cursor.key, cursor.key, cursor.id); }
  const rows = await authDatabase().prepare(`SELECT t.id, t.slug, t.title, LEFT(t.body, 600) AS body,
    t.category, t.status, t.pinned, t.created_via AS "createdVia", t.created_at AS "createdAt",
    t.last_activity_at AS "lastActivityAt", u.display_name AS "authorName",
    COUNT(r.id) FILTER (WHERE r.status='visible') AS "replyCount"
    FROM forum_topics t JOIN users u ON u.id=t.author_id
    LEFT JOIN forum_replies r ON r.topic_id=t.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY t.id, u.display_name ORDER BY ${sortColumn} DESC, t.id DESC LIMIT ?`)
    .bind(...parameters, options.limit + 1).all<Record<string, unknown>>();
  const items = rows.results.slice(0, options.limit).map(row => mapTopic(row));
  const last = rows.results.length > options.limit ? rows.results[options.limit - 1] : null;
  const key = last ? Number(sort === "recent" ? last.createdAt : last.lastActivityAt) : 0;
  return { items, nextCursor: last ? encodeCursor({ key, id: String(last.id) }) : null };
}

export async function agentForumTopic(topicId: string, options: { replyCursor: string | null; replyLimit: number }) {
  await ensureAgentCommunitySchema();
  const db = authDatabase();
  const topic = await db.prepare(`SELECT t.id, t.slug, t.title, t.body, t.category, t.status, t.pinned,
    t.created_via AS "createdVia", t.created_at AS "createdAt", t.last_activity_at AS "lastActivityAt",
    u.display_name AS "authorName", (SELECT COUNT(*) FROM forum_replies r WHERE r.topic_id=t.id AND r.status='visible') AS "replyCount"
    FROM forum_topics t JOIN users u ON u.id=t.author_id WHERE t.id=? AND t.status<>'hidden' LIMIT 1`)
    .bind(topicId).first<Record<string, unknown>>();
  if (!topic) throw new AgentApiError("content_not_found", "论坛主题不存在。", 404);
  const cursor = decodeCursor(options.replyCursor);
  const conditions = ["r.topic_id=?", "r.status='visible'"];
  const parameters: unknown[] = [topicId];
  if (cursor) { conditions.push("(r.created_at > ? OR (r.created_at = ? AND r.id > ?))"); parameters.push(cursor.key, cursor.key, cursor.id); }
  const replies = await db.prepare(`SELECT r.id, r.body, r.created_via AS "createdVia", r.created_at AS "createdAt",
    u.display_name AS "authorName" FROM forum_replies r JOIN users u ON u.id=r.author_id
    WHERE ${conditions.join(" AND ")} ORDER BY r.created_at ASC, r.id ASC LIMIT ?`)
    .bind(...parameters, options.replyLimit + 1).all<Record<string, unknown>>();
  const items = replies.results.slice(0, options.replyLimit).map(row => ({
    id: String(row.id), body: String(row.body), authorName: String(row.authorName),
    createdVia: row.createdVia === "eval_agent" ? "eval_agent" : "web", createdAt: isoTime(Number(row.createdAt)),
  }));
  const last = replies.results.length > options.replyLimit ? replies.results[options.replyLimit - 1] : null;
  return { topic: mapTopic(topic, false), replies: { items, nextCursor: last ? encodeCursor({ key: Number(last.createdAt), id: String(last.id) }) : null } };
}

export async function createAgentForumTopic(context: AgentCommunityContext, input: Record<string, unknown>, handle: AgentActionHandle, requestId: string) {
  await ensureAgentCommunitySchema();
  const { title, body, category } = validateForumTopicInput(input);
  const now = epochSeconds();
  const id = `topic_${crypto.randomUUID()}`;
  const slug = contentSlug(title, "topic");
  const response = { id, slug, url: `/forum/${slug}`, createdVia: "eval_agent" };
  const db = authDatabase();
  await db.batch([
    db.prepare(`INSERT INTO forum_topics (id, author_id, title, slug, body, category, status, pinned,
      created_via, desktop_session_id, last_activity_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', false, 'eval_agent', ?, ?, ?, ?)`)
      .bind(id, context.user.id, title, slug, body, category, context.session.id, now, now, now),
    ...agentCompletionStatements(context, handle, requestId, "agent.forum.topic.create", "forum_topic", id, 201, response),
  ]);
  return response;
}

export async function createAgentForumReply(context: AgentCommunityContext, topicId: string, input: Record<string, unknown>, handle: AgentActionHandle, requestId: string) {
  await ensureAgentCommunitySchema();
  const body = validateForumReplyInput(input);
  const db = authDatabase();
  const topic = await db.prepare("SELECT id, slug, status FROM forum_topics WHERE id=? LIMIT 1").bind(topicId).first<{ id: string; slug: string; status: string }>();
  if (!topic || topic.status === "hidden") throw new AgentApiError("content_not_found", "论坛主题不存在。", 404);
  if (topic.status === "locked") throw new AgentApiError("topic_locked", "该主题已锁定，不能继续回复。", 409);
  const now = epochSeconds();
  const id = `reply_${crypto.randomUUID()}`;
  const response = { id, topicId, url: `/forum/${topic.slug}`, createdVia: "eval_agent" };
  await db.batch([
    db.prepare(`INSERT INTO forum_replies (id, topic_id, author_id, body, status, created_via, desktop_session_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'visible', 'eval_agent', ?, ?, ?)`)
      .bind(id, topicId, context.user.id, body, context.session.id, now, now),
    db.prepare("UPDATE forum_topics SET last_activity_at=?, updated_at=? WHERE id=? AND status='open'").bind(now, now, topicId),
    ...agentCompletionStatements(context, handle, requestId, "agent.forum.reply.create", "forum_reply", id, 201, response),
  ]);
  return response;
}

export async function createAgentBlogDraft(context: AgentCommunityContext, input: Record<string, unknown>, handle: AgentActionHandle, requestId: string) {
  await ensureAgentCommunitySchema();
  const { title, excerpt, body } = validateBlogDraftInput(input);
  const now = epochSeconds();
  const id = `post_${crypto.randomUUID()}`;
  const slug = contentSlug(title, "article");
  const response = { id, slug, status: "draft", createdVia: "eval_agent" };
  const db = authDatabase();
  await db.batch([
    db.prepare(`INSERT INTO blog_posts (id, author_id, title, slug, excerpt, body, status, published_at,
      created_via, desktop_session_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', NULL, 'eval_agent', ?, ?, ?)`)
      .bind(id, context.user.id, title, slug, excerpt, body, context.session.id, now, now),
    ...agentCompletionStatements(context, handle, requestId, "agent.blog.draft.create", "blog_post", id, 201, response),
  ]);
  return response;
}

export async function updateAgentBlogDraft(context: AgentCommunityContext, postId: string, input: Record<string, unknown>, handle: AgentActionHandle, requestId: string) {
  await ensureAgentCommunitySchema();
  const db = authDatabase();
  const existing = await db.prepare(`SELECT id, title, excerpt, body, slug FROM blog_posts
    WHERE id=? AND author_id=? AND created_via='eval_agent' AND status='draft' LIMIT 1`)
    .bind(postId, context.user.id).first<Record<string, string>>();
  if (!existing) throw new AgentApiError("content_not_found", "博客草稿不存在。", 404);
  const values = validateBlogDraftInput({
    title: input.title ?? existing.title,
    excerpt: input.excerpt ?? existing.excerpt,
    body: input.body ?? existing.body,
  });
  const now = epochSeconds();
  const response = { id: postId, slug: existing.slug, status: "draft", createdVia: "eval_agent" };
  await db.batch([
    db.prepare("UPDATE blog_posts SET title=?, excerpt=?, body=?, updated_at=? WHERE id=? AND author_id=? AND created_via='eval_agent' AND status='draft'")
      .bind(values.title, values.excerpt, values.body, now, postId, context.user.id),
    ...agentCompletionStatements(context, handle, requestId, "agent.blog.draft.update", "blog_post", postId, 200, response),
  ]);
  return response;
}

export async function publishAgentBlogDraft(context: AgentCommunityContext, postId: string, handle: AgentActionHandle, requestId: string) {
  await ensureAgentCommunitySchema();
  const db = authDatabase();
  const existing = await db.prepare(`SELECT id, slug FROM blog_posts
    WHERE id=? AND author_id=? AND created_via='eval_agent' AND status='draft' LIMIT 1`)
    .bind(postId, context.user.id).first<{ id: string; slug: string }>();
  if (!existing) throw new AgentApiError("content_not_found", "博客草稿不存在。", 404);
  const now = epochSeconds();
  const response = { id: postId, slug: existing.slug, status: "published", url: `/blog/${existing.slug}`, publishedAt: isoTime(now), createdVia: "eval_agent" };
  await db.batch([
    db.prepare("UPDATE blog_posts SET status='published', published_at=?, updated_at=? WHERE id=? AND author_id=? AND created_via='eval_agent' AND status='draft'")
      .bind(now, now, postId, context.user.id),
    ...agentCompletionStatements(context, handle, requestId, "agent.blog.publish", "blog_post", postId, 200, response),
  ]);
  return response;
}

function mapTopic(row: Record<string, unknown>, summarize = true) {
  const body = String(row.body ?? "");
  return {
    id: String(row.id), slug: String(row.slug), title: String(row.title),
    body: summarize && body.length > 600 ? `${body.slice(0, 600)}…` : body,
    category: String(row.category), status: String(row.status), pinned: Boolean(row.pinned),
    authorName: String(row.authorName), replyCount: Number(row.replyCount ?? 0),
    createdVia: row.createdVia === "eval_agent" ? "eval_agent" : "web",
    createdAt: isoTime(Number(row.createdAt)), lastActivityAt: isoTime(Number(row.lastActivityAt)),
  };
}

function encodeCursor(value: TopicCursor) { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function decodeCursor(value: string | null): TopicCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TopicCursor>;
    if (!Number.isInteger(parsed.key) || typeof parsed.id !== "string" || !parsed.id) throw new Error();
    return { key: Number(parsed.key), id: parsed.id };
  } catch {
    throw new AgentApiError("validation_error", "cursor 无效。", 422);
  }
}

function epochSeconds() { return Math.floor(Date.now() / 1000); }
