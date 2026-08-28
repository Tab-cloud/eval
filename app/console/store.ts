import { authDatabase, type AuthenticatedUser } from "../auth/core";
import { ensureAdminSchema } from "../admin/store";
import { publicReleaseSigningSettings } from "../releases/settings";

export async function consoleSnapshot(user: AuthenticatedUser) {
  await ensureAdminSchema();
  const db = authDatabase();
  const now = Math.floor(Date.now() / 1000);
  const admin = user.role === "admin";
  const signingSettings = await publicReleaseSigningSettings("windows");
  const publicKeyId = signingSettings?.publicKeyId ?? "__not_configured__";
  const [releases, forumTopics, forumTopicCount, forumReplies, blogPostCount, desktopSessions, audits] = await Promise.all([
    db.prepare(`SELECT a.id, r.id AS "releaseId", r.version, r.channel, r.status, r.published_at AS "publishedAt",
      a.file_name AS "fileName", a.format, a.platform, a.architecture, a.size_bytes AS "sizeBytes"
      FROM release_versions r
      JOIN release_artifacts ra ON ra.release_id = r.id
      JOIN agent_artifacts a ON a.id = ra.artifact_id AND a.format IN ('NSIS', 'DMG')
      WHERE r.status = 'published' AND r.channel = 'stable'
        AND a.status = 'ready'
        AND (a.format = 'DMG' OR (a.signature_verified_at IS NOT NULL AND a.signature_key_id = ?))
        AND a.embedded_version = r.version
      ORDER BY r.published_at DESC NULLS LAST, r.created_at DESC, a.platform DESC, a.architecture LIMIT 6`).bind(publicKeyId).all(),
    db.prepare(`SELECT t.id, t.title, t.slug, t.category, t.status, t.pinned,
      t.last_activity_at AS "lastActivityAt", u.display_name AS "authorName",
      COUNT(r.id) FILTER (WHERE r.status = 'visible') AS "replyCount"
      FROM forum_topics t JOIN users u ON u.id = t.author_id
      LEFT JOIN forum_replies r ON r.topic_id = t.id
      WHERE t.status <> 'hidden'
      GROUP BY t.id, u.display_name ORDER BY t.pinned DESC, t.last_activity_at DESC LIMIT 8`)
      .all(),
    db.prepare("SELECT COUNT(*) AS count FROM forum_topics WHERE status <> 'hidden'").first<Record<string, number | string>>(),
    db.prepare("SELECT COUNT(*) AS count FROM forum_replies WHERE status = 'visible'").first<Record<string, number | string>>(),
    db.prepare("SELECT COUNT(*) AS count FROM blog_posts WHERE status = 'published' AND published_at IS NOT NULL AND published_at <= ?")
      .bind(now).first<Record<string, number | string>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM desktop_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?`)
      .bind(user.id, now).first<Record<string, number | string>>(),
    db.prepare(`SELECT id, action, resource_type AS "resourceType", resource_id AS "resourceId",
      created_at AS "createdAt" FROM audit_logs ${admin ? "" : "WHERE actor_id = ?"}
      ORDER BY created_at DESC LIMIT 20`)
      .bind(...(admin ? [] : [user.id])).all(),
  ]);
  const releaseRows = releases.results as Array<Record<string, unknown>>;
  return {
    generatedAt: now,
    metrics: {
      publishedReleases: new Set(releaseRows.filter(item => item.status === "published").map(item => item.releaseId)).size,
      forumTopics: Number(forumTopicCount?.count ?? 0),
      forumReplies: Number(forumReplies?.count ?? 0),
      publishedPosts: Number(blogPostCount?.count ?? 0),
      activeDesktopSessions: Number(desktopSessions?.count ?? 0),
    },
    releases: releaseRows,
    forumTopics: forumTopics.results,
    audits: audits.results,
  };
}
