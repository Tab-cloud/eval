import { authDatabase, type AuthenticatedUser } from "../auth/core";
import { ensureAdminSchema } from "../admin/store";

const KEY_SCOPES = ["models:read", "models:invoke", "usage:read"] as const;
type KeyScope = typeof KEY_SCOPES[number];

export async function ensureGatewaySchema() {
  await ensureAdminSchema();
  const db = authDatabase();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS api_keys (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL, owner_id text NOT NULL, name text NOT NULL, prefix text NOT NULL, secret_hash text NOT NULL, scopes text NOT NULL, expires_at integer, last_used_at integer, revoked_at integer, created_at integer NOT NULL, updated_at integer NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON api_keys (tenant_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_uq ON api_keys (secret_hash)"),
    db.prepare("CREATE TABLE IF NOT EXISTS gateway_requests (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL, api_key_id text NOT NULL, model_config_id text, endpoint text NOT NULL, status_code integer NOT NULL, latency_ms integer NOT NULL, input_tokens integer DEFAULT 0 NOT NULL, output_tokens integer DEFAULT 0 NOT NULL, error_code text, created_at integer NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS gateway_requests_tenant_time_idx ON gateway_requests (tenant_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS gateway_requests_key_time_idx ON gateway_requests (api_key_id, created_at)"),
  ]);
}

export async function consoleSnapshot(user: AuthenticatedUser) {
  await ensureGatewaySchema();
  const db = authDatabase();
  const now = Math.floor(Date.now() / 1000);
  const dayStart = now - 24 * 60 * 60;
  const monthStart = now - 30 * 24 * 60 * 60;
  const admin = user.role === "tenant_admin" || user.role === "platform_admin";
  const [metrics, models, keys, recent, members, releases, audits, dailyUsage] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) AS requests,
             COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS today_requests,
             COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
             COALESCE(ROUND(AVG(latency_ms)), 0) AS average_latency,
             COALESCE(SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END), 0) AS successful
      FROM gateway_requests WHERE tenant_id = ? AND created_at >= ?
    `).bind(dayStart, user.tenantId, monthStart).first<Record<string, number>>(),
    db.prepare("SELECT id, display_name AS displayName, provider, model_id AS modelId, base_url AS baseUrl, status, requests_per_minute AS requestsPerMinute, updated_at AS updatedAt FROM llm_configs WHERE tenant_id = ? ORDER BY created_at DESC").bind(user.tenantId).all(),
    db.prepare(`SELECT k.id, k.name, k.prefix, k.scopes, k.expires_at AS expiresAt, k.last_used_at AS lastUsedAt, k.revoked_at AS revokedAt, k.created_at AS createdAt, u.display_name AS ownerName
      FROM api_keys k JOIN users u ON u.id = k.owner_id
      WHERE k.tenant_id = ? ${admin ? "" : "AND k.owner_id = ?"} ORDER BY k.created_at DESC`)
      .bind(...(admin ? [user.tenantId] : [user.tenantId, user.id])).all(),
    db.prepare(`SELECT r.id, r.endpoint, r.status_code AS statusCode, r.latency_ms AS latencyMs, r.input_tokens AS inputTokens, r.output_tokens AS outputTokens, r.created_at AS createdAt,
      COALESCE(l.display_name, '未识别模型') AS modelName, k.prefix AS keyPrefix
      FROM gateway_requests r LEFT JOIN llm_configs l ON l.id = r.model_config_id LEFT JOIN api_keys k ON k.id = r.api_key_id
      WHERE r.tenant_id = ? ORDER BY r.created_at DESC LIMIT 20`).bind(user.tenantId).all(),
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN u.status = 'active' THEN 1 ELSE 0 END), 0) AS active FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ?").bind(user.tenantId).first<Record<string, number>>(),
    db.prepare("SELECT r.id, r.version, r.channel, r.status, r.published_at AS publishedAt, a.file_name AS fileName, a.format FROM release_versions r JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id WHERE r.tenant_id = ? ORDER BY r.created_at DESC LIMIT 12").bind(user.tenantId).all(),
    db.prepare("SELECT id, action, resource_type AS resourceType, resource_id AS resourceId, metadata, created_at AS createdAt FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20").bind(user.tenantId).all(),
    db.prepare("SELECT CAST(created_at / 86400 AS INTEGER) AS day, COUNT(*) AS requests FROM gateway_requests WHERE tenant_id = ? AND created_at >= ? GROUP BY day ORDER BY day").bind(user.tenantId, now - 7 * 86400).all(),
  ]);
  const requests = Number(metrics?.requests ?? 0);
  const successful = Number(metrics?.successful ?? 0);
  return {
    generatedAt: now,
    metrics: {
      requests,
      todayRequests: Number(metrics?.today_requests ?? 0),
      tokens: Number(metrics?.tokens ?? 0),
      averageLatency: Number(metrics?.average_latency ?? 0),
      successRate: requests ? Math.round(successful / requests * 10000) / 100 : null,
      activeMembers: Number(members?.active ?? 0),
      totalMembers: Number(members?.total ?? 0),
      activeModels: models.results.filter(item => item.status === "active").length,
      activeKeys: keys.results.filter(item => !item.revokedAt && (!item.expiresAt || Number(item.expiresAt) > now)).length,
    },
    models: models.results,
    keys: keys.results.map(item => ({ ...item, scopes: parseScopes(item.scopes) })),
    recentRequests: recent.results,
    releases: releases.results,
    audits: audits.results.map(item => ({ ...item, metadata: parseJson(item.metadata) })),
    dailyUsage: dailyUsage.results,
  };
}

export async function createApiKey(user: AuthenticatedUser, input: Record<string, unknown>) {
  await ensureGatewaySchema();
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 64) throw new Error("密钥名称需要 2–64 个字符。");
  const requested = Array.isArray(input.scopes) ? input.scopes.filter((value): value is string => typeof value === "string") : [];
  const scopes = requested.filter((scope): scope is KeyScope => KEY_SCOPES.includes(scope as KeyScope));
  if (!scopes.length) throw new Error("请至少选择一个权限范围。");
  const expiresInDays = Number(input.expiresInDays);
  const allowedDays = [30, 90, 365];
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = allowedDays.includes(expiresInDays) ? now + expiresInDays * 86400 : null;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = `eval_live_${toBase64Url(bytes)}`;
  const id = `key_${crypto.randomUUID()}`;
  const prefix = secret.slice(0, 18);
  const db = authDatabase();
  await db.batch([
    db.prepare("INSERT INTO api_keys (id, tenant_id, owner_id, name, prefix, secret_hash, scopes, expires_at, last_used_at, revoked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)")
      .bind(id, user.tenantId, user.id, name, prefix, await sha256(secret), JSON.stringify(scopes), expiresAt, now, now),
    db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, 'api_key.create', 'api_key', ?, ?, ?)")
      .bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, id, JSON.stringify({ name, prefix, scopes, expiresAt }), now),
  ]);
  return { id, name, prefix, secret, scopes, expiresAt };
}

export async function revokeApiKey(user: AuthenticatedUser, id: string) {
  await ensureGatewaySchema();
  const db = authDatabase();
  const admin = user.role === "tenant_admin" || user.role === "platform_admin";
  const key = await db.prepare(`SELECT id FROM api_keys WHERE id = ? AND tenant_id = ? ${admin ? "" : "AND owner_id = ?"}`)
    .bind(...(admin ? [id, user.tenantId] : [id, user.tenantId, user.id])).first();
  if (!key) throw new Error("密钥不存在或无权操作。");
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare("UPDATE api_keys SET revoked_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, now, id, user.tenantId),
    db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, 'api_key.revoke', 'api_key', ?, '{}', ?)")
      .bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, id, now),
  ]);
}

function parseScopes(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function toBase64Url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
