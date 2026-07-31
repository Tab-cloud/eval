import type { PostgresDatabase } from "../../db/postgres";
import { authDatabase, ensureAuthSchema, type AuthenticatedUser } from "../auth/core";
import { normalizeChinesePhone } from "../auth/phone";
import { providerSettingsSnapshot, saveTenantProviderSettings, tenantProviderSettings } from "../auth/provider-settings";
import { normalizeSemver } from "../releases/public";

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
  const db = authDatabase();
  await db.batch([
    "CREATE TABLE IF NOT EXISTS llm_configs (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, display_name text NOT NULL, provider text NOT NULL, model_id text NOT NULL, base_url text NOT NULL, secret_ref text NOT NULL, status text NOT NULL, requests_per_minute integer NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS llm_configs_tenant_idx ON llm_configs (tenant_id)",
    "CREATE TABLE IF NOT EXISTS agent_artifacts (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, file_name text NOT NULL, label text NOT NULL, format text NOT NULL, object_key text NOT NULL, size_bytes bigint NOT NULL, sha256 text NOT NULL, status text NOT NULL, created_at bigint NOT NULL)",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS updater_signature text",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'windows'",
    "ALTER TABLE agent_artifacts ADD COLUMN IF NOT EXISTS architecture text NOT NULL DEFAULT 'x86_64'",
    "CREATE INDEX IF NOT EXISTS agent_artifacts_tenant_idx ON agent_artifacts (tenant_id)",
    "CREATE TABLE IF NOT EXISTS release_versions (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, version text NOT NULL, channel text NOT NULL, artifact_id text NOT NULL REFERENCES agent_artifacts(id), notes text NOT NULL, mandatory boolean NOT NULL, status text NOT NULL, published_at bigint, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS release_versions_tenant_idx ON release_versions (tenant_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS release_versions_tenant_version_uq ON release_versions (tenant_id, version, channel)",
    "CREATE TABLE IF NOT EXISTS billing_plans (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name text NOT NULL, monthly_price_cents integer NOT NULL, currency text NOT NULL, request_limit bigint NOT NULL, seat_limit integer NOT NULL, features jsonb NOT NULL, status text NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS billing_plans_tenant_idx ON billing_plans (tenant_id)",
    "CREATE TABLE IF NOT EXISTS audit_logs (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, actor_id text, action text NOT NULL, resource_type text NOT NULL, resource_id text, ip_hash text, metadata jsonb, created_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS audit_tenant_time_idx ON audit_logs (tenant_id, created_at)",
  ].map(sql => db.prepare(sql)));
}

export async function adminSnapshot(user: AuthenticatedUser) {
  await ensureAdminSchema();
  const db = authDatabase();
  const tenantId = user.tenantId;
  const [users, llms, artifacts, releases, plans, audits] = await Promise.all([
    db.prepare("SELECT u.id, u.email, u.phone_e164 AS phoneE164, u.display_name AS displayName, u.status, m.role, u.last_login_at AS lastLoginAt FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.tenant_id = ? ORDER BY u.created_at DESC").bind(tenantId).all(),
    db.prepare("SELECT id, display_name AS displayName, provider, model_id AS modelId, base_url AS baseUrl, secret_ref AS secretRef, status, requests_per_minute AS requestsPerMinute, updated_at AS updatedAt FROM llm_configs WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all(),
    db.prepare("SELECT id, file_name AS fileName, label, format, size_bytes AS sizeBytes, sha256, updater_signature IS NOT NULL AS signed, platform, architecture, status, created_at AS createdAt FROM agent_artifacts WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all(),
    db.prepare("SELECT r.id, r.version, r.channel, r.artifact_id AS artifactId, a.file_name AS fileName, r.notes, r.mandatory, r.status, r.published_at AS publishedAt FROM release_versions r LEFT JOIN agent_artifacts a ON a.id = r.artifact_id WHERE r.tenant_id = ? ORDER BY r.created_at DESC").bind(tenantId).all(),
    db.prepare("SELECT id, name, monthly_price_cents AS monthlyPriceCents, currency, request_limit AS requestLimit, seat_limit AS seatLimit, features, status FROM billing_plans WHERE tenant_id = ? ORDER BY monthly_price_cents ASC").bind(tenantId).all(),
    db.prepare("SELECT a.id, a.action, a.resource_type AS resourceType, a.resource_id AS resourceId, a.metadata, a.created_at AS createdAt, COALESCE(u.display_name, '系统') AS actorName FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 100").bind(tenantId).all(),
  ]);
  const userRows = users.results as Array<Record<string, unknown>>;
  const authSettings = providerSettingsSnapshot(await tenantProviderSettings(tenantId));
  return {
    currentUser: user,
    metrics: {
      users: userRows.length,
      activeUsers: userRows.filter(item => item.status === "active").length,
      llms: llms.results.length,
      artifacts: artifacts.results.length,
      publishedReleases: (releases.results as Array<Record<string, unknown>>).filter(item => item.status === "published").length,
      activePlans: (plans.results as Array<Record<string, unknown>>).filter(item => item.status === "active").length,
      auditEvents: audits.results.length,
    },
    users: userRows,
    llms: llms.results,
    artifacts: artifacts.results,
    releases: releases.results,
    plans: plans.results,
    audits: audits.results,
    authSettings,
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2) throw new Error("请填写有效邮箱和姓名。");
    const id = `usr_${crypto.randomUUID()}`;
    await db.batch([
      db.prepare("INSERT INTO users (id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").bind(id, email, displayName, now, now),
      db.prepare("INSERT INTO memberships (id, tenant_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`mem_${crypto.randomUUID()}`, user.tenantId, id, role, now, now),
    ]);
    await recordAudit(db, user, "user.create", "user", id, { email, role });
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
    });
    return providerSettingsSnapshot(settings);
  }
  if (action === "save_llm") {
    const id = text(input.id) || `llm_${crypto.randomUUID()}`;
    const displayName = text(input.displayName), provider = text(input.provider), modelId = text(input.modelId), baseUrl = text(input.baseUrl), secretRef = text(input.secretRef);
    const rpm = Math.max(1, number(input.requestsPerMinute, 60));
    if (!displayName || !provider || !modelId || !/^https:\/\//.test(baseUrl) || !/^[A-Z][A-Z0-9_]{2,63}$/.test(secretRef)) throw new Error("模型名称、HTTPS 地址和密钥引用格式不正确。");
    await db.prepare("INSERT INTO llm_configs (id, tenant_id, display_name, provider, model_id, base_url, secret_ref, status, requests_per_minute, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, provider=excluded.provider, model_id=excluded.model_id, base_url=excluded.base_url, secret_ref=excluded.secret_ref, requests_per_minute=excluded.requests_per_minute, updated_at=excluded.updated_at WHERE tenant_id=excluded.tenant_id").bind(id, user.tenantId, displayName, provider, modelId, baseUrl, secretRef, rpm, now, now).run();
    await recordAudit(db, user, "llm.save", "llm_config", id, { provider, modelId, rpm });
    return { id };
  }
  if (action === "set_llm_status") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["active", "maintenance", "disabled"], "maintenance");
    const result = await db.prepare("UPDATE llm_configs SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(status, now, id, user.tenantId).run();
    if (!result.meta.changes) throw new Error("模型配置不存在。");
    await recordAudit(db, user, "llm.status", "llm_config", id, { status });
    return { id, status };
  }
  if (action === "test_llm") {
    const id = text(input.id);
    const config = await db.prepare("SELECT base_url, secret_ref FROM llm_configs WHERE id = ? AND tenant_id = ?").bind(id, user.tenantId).first<{ base_url: string; secret_ref: string }>();
    if (!config) throw new Error("模型配置不存在。");
    const secret = process.env[config.secret_ref];
    if (typeof secret !== "string" || !secret) throw new Error(`部署环境尚未配置 ${config.secret_ref}。`);
    let target: URL;
    try { target = new URL("models", config.base_url.endsWith("/") ? config.base_url : `${config.base_url}/`); } catch { throw new Error("模型地址无效。"); }
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(target, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
    } catch { throw new Error("无法连接模型上游。"); }
    const healthy = response.ok;
    await db.prepare("UPDATE llm_configs SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(healthy ? "active" : "maintenance", now, id, user.tenantId).run();
    await recordAudit(db, user, "llm.test", "llm_config", id, { healthy, statusCode: response.status, latencyMs: Date.now() - started });
    if (!healthy) throw new Error(`上游健康检查失败（HTTP ${response.status}）。`);
    return { id, healthy, latencyMs: Date.now() - started };
  }
  if (action === "create_release") {
    const artifactId = text(input.artifactId), version = text(input.version), notes = text(input.notes);
    const channel = allowed(text(input.channel), ["stable", "beta", "internal"], "stable");
    const status = allowed(text(input.status), ["draft", "published"], "draft");
    const normalizedVersion = normalizeSemver(version);
    if (!normalizedVersion || !artifactId) throw new Error("请选择安装包并填写有效的语义化版本号。");
    const artifact = await db.prepare("SELECT id, updater_signature FROM agent_artifacts WHERE id = ? AND tenant_id = ?").bind(artifactId, user.tenantId).first<{ id: string; updater_signature: string | null }>();
    if (!artifact) throw new Error("安装包不存在或不属于当前组织。");
    if (!artifact.updater_signature) throw new Error("该安装包缺少 Tauri .sig 签名，不能发布为自动更新版本。");
    const duplicate = await db.prepare("SELECT id FROM release_versions WHERE tenant_id = ? AND version = ? AND channel = ?").bind(user.tenantId, normalizedVersion.version, channel).first();
    if (duplicate) throw new Error("当前渠道已存在相同版本号。");
    const id = `rel_${crypto.randomUUID()}`;
    await db.prepare("INSERT INTO release_versions (id, tenant_id, version, channel, artifact_id, notes, mandatory, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, user.tenantId, normalizedVersion.version, channel, artifactId, notes, Boolean(input.mandatory), status, status === "published" ? now : null, now, now).run();
    await recordAudit(db, user, "release.create", "release_version", id, { version: normalizedVersion.version, channel, artifactId, status, mandatory: Boolean(input.mandatory) });
    return { id };
  }
  if (action === "set_release_status") {
    const id = text(input.id);
    const status = allowed(text(input.status), ["draft", "published"], "draft");
    if (status === "published") {
      const release = await db.prepare("SELECT a.updater_signature FROM release_versions r JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id WHERE r.id = ? AND r.tenant_id = ?").bind(id, user.tenantId).first<{ updater_signature: string | null }>();
      if (!release?.updater_signature) throw new Error("该版本的安装包缺少 Tauri .sig 签名，无法发布。");
    }
    const result = await db.prepare("UPDATE release_versions SET status = ?, published_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(status, status === "published" ? now : null, now, id, user.tenantId).run();
    if (!result.meta.changes) throw new Error("版本不存在。");
    await recordAudit(db, user, status === "published" ? "release.publish" : "release.rollback", "release_version", id, { status });
    return { id, status };
  }
  if (action === "save_plan") {
    const id = text(input.id) || `plan_${crypto.randomUUID()}`;
    const name = text(input.name), currency = allowed(text(input.currency), ["CNY", "USD"], "CNY");
    const monthlyPriceCents = Math.max(0, number(input.monthlyPriceCents, 0)), requestLimit = Math.max(0, number(input.requestLimit, 0)), seatLimit = Math.max(1, number(input.seatLimit, 1));
    const features = Array.isArray(input.features) ? input.features.map(text).filter(Boolean).slice(0, 12) : text(input.features).split("\n").map(item => item.trim()).filter(Boolean).slice(0, 12);
    if (!name) throw new Error("请输入套餐名称。");
    await db.prepare("INSERT INTO billing_plans (id, tenant_id, name, monthly_price_cents, currency, request_limit, seat_limit, features, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, monthly_price_cents=excluded.monthly_price_cents, currency=excluded.currency, request_limit=excluded.request_limit, seat_limit=excluded.seat_limit, features=excluded.features, updated_at=excluded.updated_at WHERE tenant_id=excluded.tenant_id").bind(id, user.tenantId, name, monthlyPriceCents, currency, requestLimit, seatLimit, JSON.stringify(features), now, now).run();
    await recordAudit(db, user, "billing_plan.save", "billing_plan", id, { currency, monthlyPriceCents, requestLimit, seatLimit });
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

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed) : fallback; }
function allowed<T extends string>(value: string, values: readonly T[], fallback: T): T { return values.includes(value as T) ? value as T : fallback; }

async function recordAudit(db: PostgresDatabase, user: AuthenticatedUser, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>) {
  await db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, action, resourceType, resourceId, JSON.stringify(metadata), Math.floor(Date.now() / 1000)).run();
}
