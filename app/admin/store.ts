import type { PostgresDatabase } from "../../db/postgres";
import { authDatabase, createPasswordHash, ensureAuthSchema, type AuthenticatedUser } from "../auth/core";
import { normalizeChinesePhone } from "../auth/phone";
import { providerSettingsSnapshot, saveTenantProviderSettings, tenantProviderSettings } from "../auth/provider-settings";
import { cleanText, contentSlug, ensureContentSchema, publicContentTenantSlug } from "../content/store";
import { normalizeSemver } from "../releases/public";
import { releaseSettingsSnapshot, requireTenantReleaseSigningSettings, saveTenantReleaseSigningSettings, tenantReleaseSigningSettings } from "../releases/settings";
import { artifactExists } from "../storage/artifacts";

let adminSchemaInitialization: Promise<void> | null = null;

export function ensureAdminSchema() {
  adminSchemaInitialization ??= initializeAdminSchema().catch(error => {
    adminSchemaInitialization = null;
    throw error;
  });
  return adminSchemaInitialization;
}

async function initializeAdminSchema() {
  await ensureAuthSchema();
  await ensureContentSchema();
  const db = authDatabase();
  await db.batch([
    "CREATE TABLE IF NOT EXISTS agent_artifacts (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, file_name text NOT NULL, label text NOT NULL, format text NOT NULL, object_key text NOT NULL, size_bytes bigint NOT NULL, sha256 text NOT NULL, status text NOT NULL, created_at bigint NOT NULL)",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS updater_signature text",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS signature_verified_at bigint",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS signature_key_id text",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS embedded_version text",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS product_name text",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS version_source text",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'windows'",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS architecture text NOT NULL DEFAULT 'x86_64'",
    "CREATE INDEX IF NOT EXISTS agent_artifacts_tenant_idx ON agent_artifacts (tenant_id)",
    "CREATE TABLE IF NOT EXISTS release_versions (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, version text NOT NULL, channel text NOT NULL, artifact_id text NOT NULL REFERENCES agent_artifacts(id), notes text NOT NULL, mandatory boolean NOT NULL, status text NOT NULL, published_at bigint, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS release_versions_tenant_idx ON release_versions (tenant_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS release_versions_tenant_version_uq ON release_versions (tenant_id, version, channel)",
    "WITH ranked_releases AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id, channel ORDER BY published_at DESC NULLS LAST, created_at DESC) AS release_rank FROM release_versions WHERE status = 'published') UPDATE release_versions SET status = 'draft' WHERE id IN (SELECT id FROM ranked_releases WHERE release_rank > 1)",
    "CREATE UNIQUE INDEX IF NOT EXISTS release_versions_one_published_channel_uq ON release_versions (tenant_id, channel) WHERE status = 'published'",
    "CREATE TABLE IF NOT EXISTS release_settings (tenant_id text PRIMARY KEY NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, updater_public_key text NOT NULL, updater_public_key_id text NOT NULL, updated_by text REFERENCES users(id) ON DELETE SET NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE TABLE IF NOT EXISTS billing_plans (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name text NOT NULL, monthly_price_cents integer NOT NULL, currency text NOT NULL, seat_limit integer NOT NULL, features jsonb NOT NULL, status text NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS billing_plans_tenant_idx ON billing_plans (tenant_id)",
    "CREATE TABLE IF NOT EXISTS audit_logs (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, actor_id text, action text NOT NULL, resource_type text NOT NULL, resource_id text, ip_hash text, metadata jsonb, created_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS audit_tenant_time_idx ON audit_logs (tenant_id, created_at)",
  ].map(sql => db.prepare(sql)));
}

export async function adminSnapshot(user: AuthenticatedUser) {
  await ensureAdminSchema();
  const db = authDatabase();
  const tenantId = user.tenantId;
  const [users, artifacts, releases, plans, audits, blogPosts, forumTopics, forumReplies] = await Promise.all([
    db.prepare("SELECT u.id, u.username, u.email, u.phone_e164 AS phoneE164, u.display_name AS displayName, u.status, m.role, u.last_login_at AS lastLoginAt FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.tenant_id = ? ORDER BY u.created_at DESC").bind(tenantId).all(),
    db.prepare("SELECT id, file_name AS fileName, label, format, size_bytes AS sizeBytes, sha256, signature_verified_at IS NOT NULL AS signed, signature_verified_at AS signatureVerifiedAt, signature_key_id AS signatureKeyId, embedded_version AS embeddedVersion, product_name AS productName, version_source AS versionSource, platform, architecture, status, created_at AS createdAt FROM agent_artifacts WHERE tenant_id = ? AND format = 'NSIS' ORDER BY created_at DESC").bind(tenantId).all(),
    db.prepare(`SELECT r.id, r.version, r.channel, r.artifact_id AS artifactId, a.file_name AS fileName,
      r.notes, r.mandatory, r.status, r.published_at AS publishedAt
      FROM release_versions r
      JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id AND a.format = 'NSIS'
      WHERE r.tenant_id = ? ORDER BY r.created_at DESC`).bind(tenantId).all(),
    db.prepare("SELECT id, name, monthly_price_cents AS monthlyPriceCents, currency, seat_limit AS seatLimit, features, status FROM billing_plans WHERE tenant_id = ? ORDER BY monthly_price_cents ASC").bind(tenantId).all(),
    db.prepare("SELECT a.id, a.action, a.resource_type AS resourceType, a.resource_id AS resourceId, a.metadata, a.created_at AS createdAt, COALESCE(u.display_name, '系统') AS actorName FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 100").bind(tenantId).all(),
    db.prepare(`SELECT p.id, p.title, p.slug, p.excerpt, p.body, p.status, p.published_at AS publishedAt,
      p.updated_at AS updatedAt, u.display_name AS authorName
      FROM blog_posts p JOIN users u ON u.id = p.author_id
      WHERE p.tenant_id = ? ORDER BY p.created_at DESC LIMIT 100`).bind(tenantId).all(),
    db.prepare(`SELECT t.id, t.title, t.slug, t.category, t.status, t.pinned, t.created_at AS createdAt,
      t.last_activity_at AS lastActivityAt, u.display_name AS authorName,
      COUNT(r.id) FILTER (WHERE r.status = 'visible') AS replyCount
      FROM forum_topics t JOIN users u ON u.id = t.author_id
      LEFT JOIN forum_replies r ON r.topic_id = t.id AND r.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? GROUP BY t.id, u.display_name
      ORDER BY t.pinned DESC, t.last_activity_at DESC LIMIT 100`).bind(tenantId).all(),
    db.prepare(`SELECT r.id, r.topic_id AS topicId, r.body, r.status, r.created_at AS createdAt,
      t.title AS topicTitle, u.display_name AS authorName
      FROM forum_replies r JOIN forum_topics t ON t.id = r.topic_id JOIN users u ON u.id = r.author_id
      WHERE r.tenant_id = ? ORDER BY r.created_at DESC LIMIT 50`).bind(tenantId).all(),
  ]);
  const userRows = users.results as Array<Record<string, unknown>>;
  const authSettings = providerSettingsSnapshot(await tenantProviderSettings(tenantId));
  const signingSettings = await tenantReleaseSigningSettings(tenantId);
  const releaseSettings = releaseSettingsSnapshot(signingSettings, authSettings.tenantSlug);
  const artifactRows = artifacts.results as Array<Record<string, unknown>>;
  const releaseRows = releases.results as Array<Record<string, unknown>>;
  const planRows = plans.results as Array<Record<string, unknown>>;
  const activeUsers = userRows.filter(item => item.status === "active").length;
  const signedArtifacts = artifactRows.filter(item => item.status === "ready" && item.signed && item.embeddedVersion && item.signatureKeyId === signingSettings?.publicKeyId).length;
  const publishedReleases = releaseRows.filter(item => item.status === "published").length;
  const activePlans = planRows.filter(item => item.status === "active").length;
  return {
    currentUser: user,
    metrics: {
      users: userRows.length,
      activeUsers,
      artifacts: artifacts.results.length,
      publishedReleases,
      activePlans,
      auditEvents: audits.results.length,
      blogPosts: blogPosts.results.length,
      forumTopics: forumTopics.results.length,
      forumReplies: forumReplies.results.length,
    },
    readiness: {
      users: activeUsers > 0,
      identity: authSettings.smsConfigured || authSettings.googleConfigured || authSettings.githubConfigured,
      content: blogPosts.results.length > 0 || forumTopics.results.length > 0,
      artifacts: signedArtifacts > 0,
      releases: publishedReleases > 0,
      billing: activePlans > 0,
    },
    users: userRows,
    artifacts: artifacts.results,
    releases: releases.results,
    plans: plans.results,
    audits: audits.results,
    authSettings,
    releaseSettings,
    content: {
      publicTenant: user.tenantId && user.tenantName ? publicContentTenantSlug() === await tenantSlug(tenantId) : false,
      publicTenantSlug: publicContentTenantSlug(),
      blogPosts: blogPosts.results,
      forumTopics: forumTopics.results,
      forumReplies: forumReplies.results,
    },
  };
}

export async function executeAdminAction(user: AuthenticatedUser, action: string, input: Record<string, unknown>) {
  await ensureAdminSchema();
  const db = authDatabase();
  const now = Math.floor(Date.now() / 1000);
  if (action === "create_user") {
    const email = text(input.email).toLowerCase();
    const displayName = text(input.displayName);
    const role = allowed(text(input.role), ["tenant_admin", "developer", "auditor", "viewer"], "developer");
    const username = text(input.username).toLowerCase();
    const password = text(input.password);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2) throw new Error("请填写有效邮箱和姓名。");
    if (role === "tenant_admin" && (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || password.length < 12 || password.length > 128)) {
      throw new Error("管理员账号需要 3–32 位用户名和至少 12 位初始密码。");
    }
    const id = `usr_${crypto.randomUUID()}`;
    const statements = [
      db.prepare("INSERT INTO users (id, username, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").bind(id, role === "tenant_admin" ? username : null, email, displayName, now, now),
      db.prepare("INSERT INTO memberships (id, tenant_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`mem_${crypto.randomUUID()}`, user.tenantId, id, role, now, now),
    ];
    if (role === "tenant_admin") {
      const credential = await createPasswordHash(password);
      statements.push(
        db.prepare("INSERT INTO password_credentials (user_id, password_hash, password_salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?)")
          .bind(id, credential.passwordHash, credential.salt, credential.iterations, now),
      );
    }
    await db.batch(statements);
    await recordAudit(db, user, "user.create", "user", id, { email, username: role === "tenant_admin" ? username : null, role });
    return { id };
  }
  if (action === "update_user") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["active", "disabled"], "active");
    const role = allowed(text(input.role), ["tenant_admin", "developer", "auditor", "viewer"], "developer");
    if (id === user.id && status === "disabled") throw new Error("不能停用当前登录账号。");
    if (id === user.id && role !== "tenant_admin") throw new Error("不能移除当前登录账号的管理员权限。");
    const target = await db.prepare("SELECT m.role, u.status FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = ? AND m.tenant_id = ?").bind(id, user.tenantId).first<{ role: string; status: string }>();
    if (!target) throw new Error("用户不存在或不属于当前组织。");
    if (target.role === "tenant_admin" && target.status === "active" && (role !== "tenant_admin" || status !== "active")) {
      const admins = await db.prepare("SELECT COUNT(*) AS count FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND m.role IN ('tenant_admin','platform_admin') AND u.status = 'active'").bind(user.tenantId).first<{ count: number }>();
      if (Number(admins?.count ?? 0) <= 1) throw new Error("当前组织至少需要保留一名可用管理员。");
    }
    await db.batch([
      db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND id IN (SELECT user_id FROM memberships WHERE tenant_id = ?)").bind(status, now, id, user.tenantId),
      db.prepare("UPDATE memberships SET role = ?, updated_at = ? WHERE user_id = ? AND tenant_id = ?").bind(role, now, id, user.tenantId),
    ]);
    await recordAudit(db, user, "user.update", "user", id, { status, role });
    return { id };
  }
  if (action === "update_user_phone") {
    const id = text(input.id);
    const rawPhone = text(input.phone);
    const phoneE164 = rawPhone ? normalizeChinesePhone(rawPhone) : null;
    if (!id || (rawPhone && !phoneE164)) throw new Error("请输入有效的中国大陆手机号。");
    const target = await db.prepare("SELECT user_id FROM memberships WHERE user_id = ? AND tenant_id = ?")
      .bind(id, user.tenantId)
      .first();
    if (!target) throw new Error("用户不存在或不属于当前组织。");
    await db.prepare(
      "UPDATE users SET phone_e164 = ?, updated_at = ? WHERE id = ? AND id IN (SELECT user_id FROM memberships WHERE tenant_id = ?)",
    ).bind(phoneE164, now, id, user.tenantId).run();
    await recordAudit(db, user, "user.phone.update", "user", id, { configured: Boolean(phoneE164) });
    return { id, phoneConfigured: Boolean(phoneE164) };
  }
  if (action === "save_auth_settings") {
    const settings = await saveTenantProviderSettings(user.tenantId, input);
    await recordAudit(db, user, "auth.providers.save", "auth_provider_settings", user.tenantId, {
      smsEnabled: settings.smsEnabled,
      googleEnabled: settings.googleEnabled,
      aliyunAccessKeyIdRef: settings.aliyunAccessKeyIdRef,
      aliyunAccessKeySecretRef: settings.aliyunAccessKeySecretRef,
      smsCodePepperRef: settings.smsCodePepperRef,
      googleClientIdRef: settings.googleClientIdRef,
      googleClientSecretRef: settings.googleClientSecretRef,
      hostedDomainRestricted: Boolean(settings.googleAllowedHostedDomain),
      githubEnabled: settings.githubEnabled,
      githubClientIdRef: settings.githubClientIdRef,
      githubClientSecretRef: settings.githubClientSecretRef,
    });
    return providerSettingsSnapshot(settings);
  }
  if (action === "save_release_settings") {
    const settings = await saveTenantReleaseSigningSettings(user.tenantId, user.id, input.updaterPublicKey);
    await recordAudit(db, user, "release.settings.save", "release_settings", user.tenantId, {
      updaterPublicKeyId: settings?.publicKeyId ?? null,
      source: settings?.source ?? "missing",
    });
    return releaseSettingsSnapshot(settings, await tenantSlug(user.tenantId));
  }
  if (action === "save_blog_post") {
    const id = text(input.id);
    const title = cleanText(input.title);
    const excerpt = cleanText(input.excerpt);
    const body = cleanText(input.body);
    const status = allowed(text(input.status), ["draft", "published", "archived"], "draft");
    if (title.length < 4 || title.length > 140) throw new Error("博客标题需要 4–140 个字符。");
    if (excerpt.length < 10 || excerpt.length > 320) throw new Error("博客摘要需要 10–320 个字符。");
    if (body.length < 40 || body.length > 50_000) throw new Error("博客正文需要 40–50,000 个字符。");
    if (id) {
      const existing = await db.prepare("SELECT status, published_at FROM blog_posts WHERE id = ? AND tenant_id = ?")
        .bind(id, user.tenantId).first<{ status: string; published_at: number | null }>();
      if (!existing) throw new Error("博客文章不存在或不属于当前组织。");
      const publishedAt = status === "published" ? (existing.status === "published" && existing.published_at ? existing.published_at : now) : existing.published_at;
      await db.prepare("UPDATE blog_posts SET title = ?, excerpt = ?, body = ?, status = ?, published_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .bind(title, excerpt, body, status, publishedAt, now, id, user.tenantId).run();
      await recordAudit(db, user, "blog.post.update", "blog_post", id, { status, titleLength: title.length, bodyLength: body.length });
      return { id };
    }
    const postId = `post_${crypto.randomUUID()}`;
    const slug = contentSlug(title, "article");
    await db.prepare("INSERT INTO blog_posts (id, tenant_id, author_id, title, slug, excerpt, body, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(postId, user.tenantId, user.id, title, slug, excerpt, body, status, status === "published" ? now : null, now, now).run();
    await recordAudit(db, user, "blog.post.create", "blog_post", postId, { status, titleLength: title.length, bodyLength: body.length });
    return { id: postId, slug };
  }
  if (action === "set_blog_status") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["draft", "published", "archived"], "draft");
    const existing = await db.prepare("SELECT status, published_at FROM blog_posts WHERE id = ? AND tenant_id = ?")
      .bind(id, user.tenantId).first<{ status: string; published_at: number | null }>();
    if (!existing) throw new Error("博客文章不存在或不属于当前组织。");
    const publishedAt = status === "published" ? (existing.status === "published" && existing.published_at ? existing.published_at : now) : existing.published_at;
    await db.prepare("UPDATE blog_posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(status, publishedAt, now, id, user.tenantId).run();
    await recordAudit(db, user, "blog.post.status", "blog_post", id, { status });
    return { id, status };
  }
  if (action === "moderate_forum_topic") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["open", "locked", "hidden"], "open");
    const pinned = input.pinned === true;
    const result = await db.prepare("UPDATE forum_topics SET status = ?, pinned = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(status, pinned, now, id, user.tenantId).run();
    if (!result.meta.changes) throw new Error("论坛主题不存在或不属于当前组织。");
    await recordAudit(db, user, "forum.topic.moderate", "forum_topic", id, { status, pinned });
    return { id, status, pinned };
  }
  if (action === "moderate_forum_reply") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["visible", "hidden"], "visible");
    const result = await db.prepare("UPDATE forum_replies SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(status, now, id, user.tenantId).run();
    if (!result.meta.changes) throw new Error("论坛回复不存在或不属于当前组织。");
    await recordAudit(db, user, "forum.reply.moderate", "forum_reply", id, { status });
    return { id, status };
  }
  if (action === "create_release") {
    const artifactId = text(input.artifactId);
    const version = text(input.version), notes = text(input.notes);
    const channel = allowed(text(input.channel), ["stable", "beta", "internal"], "stable");
    const status = allowed(text(input.status), ["draft", "published"], "draft");
    const normalizedVersion = normalizeSemver(version);
    if (!normalizedVersion || !artifactId) throw new Error("请选择 EXE 安装包，并填写有效的语义化版本号。");
    const artifactResult = await db.prepare(`SELECT id, format, object_key, status, signature_verified_at, signature_key_id, embedded_version
      FROM agent_artifacts WHERE tenant_id = ? AND id = ? AND format = 'NSIS'`)
      .bind(user.tenantId, artifactId)
      .all<PublishableArtifact>();
    const artifact = artifactResult.results[0];
    if (!artifact) throw new Error("EXE 安装包不存在或不属于当前组织。");
    const signingSettings = await requireTenantReleaseSigningSettings(user.tenantId);
    await ensureArtifactPublishable(artifact, signingSettings.publicKeyId);
    ensureArtifactVersionMatchesRelease(artifact, normalizedVersion.version);
    const duplicate = await db.prepare("SELECT id FROM release_versions WHERE tenant_id = ? AND version = ? AND channel = ?").bind(user.tenantId, normalizedVersion.version, channel).first();
    if (duplicate) throw new Error("当前渠道已存在相同版本号。");
    const id = `rel_${crypto.randomUUID()}`;
    await db.batch([
      ...(status === "published" ? [db.prepare("UPDATE release_versions SET status = 'draft', updated_at = ? WHERE tenant_id = ? AND channel = ? AND status = 'published'").bind(now, user.tenantId, channel)] : []),
      db.prepare("INSERT INTO release_versions (id, tenant_id, version, channel, artifact_id, notes, mandatory, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, user.tenantId, normalizedVersion.version, channel, artifactId, notes, Boolean(input.mandatory), status, status === "published" ? now : null, now, now),
      db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, 'release.create', 'release_version', ?, ?, ?)")
        .bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, id, JSON.stringify({ version: normalizedVersion.version, channel, artifactId, status, mandatory: Boolean(input.mandatory) }), now),
    ]);
    return { id };
  }
  if (action === "set_release_status") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["draft", "published"], "draft");
    if (status === "published") await ensureReleasePublishable(db, user.tenantId, id);
    const release = await db.prepare("SELECT channel FROM release_versions WHERE id = ? AND tenant_id = ?").bind(id, user.tenantId).first<{ channel: string }>();
    if (!release) throw new Error("版本不存在。");
    if (status === "published") {
      await db.batch([
        db.prepare("UPDATE release_versions SET status = 'draft', updated_at = ? WHERE tenant_id = ? AND channel = ? AND status = 'published'").bind(now, user.tenantId, release.channel),
        db.prepare("UPDATE release_versions SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, now, id, user.tenantId),
      ]);
    } else {
      await db.prepare("UPDATE release_versions SET status = 'draft', updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, id, user.tenantId).run();
    }
    await recordAudit(db, user, status === "published" ? "release.publish" : "release.rollback", "release_version", id, { status });
    return { id, status };
  }
  if (action === "save_plan") {
    const id = text(input.id) || `plan_${crypto.randomUUID()}`;
    const name = text(input.name), currency = allowed(text(input.currency), ["CNY", "USD"], "CNY");
    const monthlyPriceCents = Math.max(0, number(input.monthlyPriceCents, 0)), seatLimit = Math.max(1, number(input.seatLimit, 1));
    const features = Array.isArray(input.features) ? input.features.map(text).filter(Boolean).slice(0, 12) : text(input.features).split("\n").map(item => item.trim()).filter(Boolean).slice(0, 12);
    if (!name) throw new Error("请输入套餐名称。");
    await db.prepare("INSERT INTO billing_plans (id, tenant_id, name, monthly_price_cents, currency, seat_limit, features, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, monthly_price_cents=excluded.monthly_price_cents, currency=excluded.currency, seat_limit=excluded.seat_limit, features=excluded.features, updated_at=excluded.updated_at WHERE tenant_id=excluded.tenant_id").bind(id, user.tenantId, name, monthlyPriceCents, currency, seatLimit, JSON.stringify(features), now, now).run();
    await recordAudit(db, user, "billing_plan.save", "billing_plan", id, { currency, monthlyPriceCents, seatLimit });
    return { id };
  }
  if (action === "set_plan_status") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["active", "archived"], "archived");
    const result = await db.prepare("UPDATE billing_plans SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(status, now, id, user.tenantId).run();
    if (!result.meta.changes) throw new Error("套餐不存在。");
    await recordAudit(db, user, "billing_plan.status", "billing_plan", id, { status });
    return { id, status };
  }
  throw new Error("不支持的管理员操作。");
}

type PublishableArtifact = {
  id: string;
  format: string;
  object_key: string;
  status: string;
  signature_verified_at: number | null;
  signature_key_id: string | null;
  embedded_version: string | null;
};

async function ensureArtifactPublishable(artifact: PublishableArtifact, publicKeyId: string) {
  if (artifact.status !== "ready") throw new Error("已归档的安装包不能绑定到发布版本。");
  if (!artifact.signature_verified_at || !artifact.signature_key_id) {
    throw new Error("安装包尚未通过当前 Tauri 更新公钥验签，不能发布。");
  }
  if (artifact.signature_key_id !== publicKeyId) {
    throw new Error("安装包由旧的 Tauri 更新公钥验签，请使用当前密钥重新构建并上传。");
  }
  if (!artifact.embedded_version) {
    throw new Error("安装包缺少可信的内部版本信息，请重新上传后再发布。");
  }
  if (!await artifactExists(artifact.object_key)) throw new Error("安装包源文件不存在，不能发布。");
}

function ensureArtifactVersionMatchesRelease(artifact: PublishableArtifact, releaseVersion: string) {
  const embeddedVersion = normalizeSemver(artifact.embedded_version ?? "");
  if (!embeddedVersion || embeddedVersion.version !== releaseVersion) {
    throw new Error(`${artifact.format} 安装包内部版本 ${artifact.embedded_version ?? "未识别"} 与发布版本 ${releaseVersion} 不一致。`);
  }
}

async function ensureReleasePublishable(db: PostgresDatabase, tenantId: string, releaseId: string) {
  const signingSettings = await requireTenantReleaseSigningSettings(tenantId);
  const artifact = await db.prepare(`SELECT a.id, a.format, a.object_key, a.status, a.signature_verified_at, a.signature_key_id,
      a.embedded_version, r.version AS releaseVersion
    FROM release_versions r
    JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id AND a.format = 'NSIS'
    WHERE r.id = ? AND r.tenant_id = ?`)
    .bind(releaseId, tenantId)
    .first<PublishableArtifact & { releaseVersion: string }>();
  if (!artifact) throw new Error("版本不存在或没有绑定 EXE 安装包。");
  await ensureArtifactPublishable(artifact, signingSettings.publicKeyId);
  ensureArtifactVersionMatchesRelease(artifact, artifact.releaseVersion);
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed) : fallback; }
function allowed<T extends string>(value: string, values: readonly T[], fallback: T): T { return values.includes(value as T) ? value as T : fallback; }

async function recordAudit(db: PostgresDatabase, user: AuthenticatedUser, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>) {
  await db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, action, resourceType, resourceId, JSON.stringify(metadata), Math.floor(Date.now() / 1000)).run();
}

async function tenantSlug(tenantId: string) {
  const row = await authDatabase().prepare("SELECT slug FROM tenants WHERE id = ?").bind(tenantId).first<{ slug: string }>();
  return row?.slug ?? "";
}
