import { authDatabase, type AuthenticatedUser } from "../auth/core";
import { ensureAdminSchema } from "../admin/store";

export async function consoleSnapshot(user: AuthenticatedUser) {
  await ensureAdminSchema();
  const db = authDatabase();
  const now = Math.floor(Date.now() / 1000);
  const admin = user.role === "tenant_admin" || user.role === "platform_admin";
  const [members, releases, forumTopics, forumTopicCount, forumReplies, blogPosts, blogPostCount, desktopSessions, audits] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END), 0) AS active
      FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ?`)
      .bind(user.tenantId).first<Record<string, number | string>>(),
    db.prepare(`SELECT r.id, r.version, r.channel, r.status, r.published_at AS "publishedAt",
      a.file_name AS "fileName", a.format, a.size_bytes AS "sizeBytes"
      FROM release_versions r JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id
      WHERE r.tenant_id = ? ORDER BY r.created_at DESC LIMIT 12`).bind(user.tenantId).all(),
    db.prepare(`SELECT t.id, t.title, t.slug, t.category, t.status, t.pinned,
      t.last_activity_at AS "lastActivityAt", u.display_name AS "authorName",
      COUNT(r.id) FILTER (WHERE r.status = 'visible') AS "replyCount"
      FROM forum_topics t JOIN users u ON u.id = t.author_id
      LEFT JOIN forum_replies r ON r.topic_id = t.id AND r.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? AND t.status <> 'hidden'
      GROUP BY t.id, u.display_name ORDER BY t.pinned DESC, t.last_activity_at DESC LIMIT 8`)
      .bind(user.tenantId).all(),
    db.prepare("SELECT COUNT(*) AS count FROM forum_topics WHERE tenant_id = ? AND status <> 'hidden'")
      .bind(user.tenantId).first<Record<string, number | string>>(),
    db.prepare("SELECT COUNT(*) AS count FROM forum_replies WHERE tenant_id = ? AND status = 'visible'")
      .bind(user.tenantId).first<Record<string, number | string>>(),
    db.prepare(`SELECT p.id, p.title, p.slug, p.excerpt, p.published_at AS "publishedAt",
      u.display_name AS "authorName" FROM blog_posts p JOIN users u ON u.id = p.author_id
      WHERE p.tenant_id = ? AND p.status = 'published'
      ORDER BY p.published_at DESC NULLS LAST LIMIT 6`).bind(user.tenantId).all(),
    db.prepare("SELECT COUNT(*) AS count FROM blog_posts WHERE tenant_id = ? AND status = 'published' AND published_at IS NOT NULL AND published_at <= ?")
      .bind(user.tenantId, now).first<Record<string, number | string>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM desktop_sessions
      WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL AND expires_at > ?`)
      .bind(user.id, user.tenantId, now).first<Record<string, number | string>>(),
    db.prepare(`SELECT id, action, resource_type AS "resourceType", resource_id AS "resourceId",
      created_at AS "createdAt" FROM audit_logs WHERE tenant_id = ? ${admin ? "" : "AND actor_id = ?"}
      ORDER BY created_at DESC LIMIT 20`)
      .bind(...(admin ? [user.tenantId] : [user.tenantId, user.id])).all(),
  ]);
  const releaseRows = releases.results as Array<Record<string, unknown>>;
  return {
    generatedAt: now,
    metrics: {
      activeMembers: Number(members?.active ?? 0),
      totalMembers: Number(members?.total ?? 0),
      publishedReleases: releaseRows.filter(item => item.status === "published").length,
      forumTopics: Number(forumTopicCount?.count ?? 0),
      forumReplies: Number(forumReplies?.count ?? 0),
      publishedPosts: Number(blogPostCount?.count ?? 0),
      activeDesktopSessions: Number(desktopSessions?.count ?? 0),
    },
    releases: releaseRows,
    forumTopics: forumTopics.results,
    blogPosts: blogPosts.results,
    audits: audits.results,
  };
}
