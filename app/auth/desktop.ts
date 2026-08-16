import {
  authDatabase,
  ensureAuthSchema,
  type AuthenticatedUser,
} from "./core";

const REQUEST_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_REQUESTS_PER_HOUR = 20;
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class DesktopAuthorizationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "DesktopAuthorizationError";
    this.code = code;
    this.status = status;
  }
}

export type DesktopAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

type AuthorizationRow = {
  id: string;
  status: string;
  device_name: string;
  client_version: string;
  user_id: string | null;
  expires_at: number;
};

export async function createDesktopAuthorization(
  request: Request,
  input: { deviceName?: unknown; clientVersion?: unknown },
): Promise<DesktopAuthorization> {
  await ensureAuthSchema();
  const deviceName = boundedText(input.deviceName, 80, "Windows 设备");
  const clientVersion = boundedText(input.clientVersion, 32, "unknown");
  const sourceHash = await sha256(requestSource(request));
  const now = epochSeconds();
  const db = authDatabase();
  await db.batch([
    db.prepare("DELETE FROM desktop_auth_requests WHERE expires_at <= ?").bind(now - 24 * 60 * 60),
    db.prepare("DELETE FROM desktop_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").bind(now - 24 * 60 * 60),
  ]);
  const recent = await db.prepare(
    "SELECT COUNT(*) AS count FROM desktop_auth_requests WHERE source_hash = ? AND created_at >= ?",
  ).bind(sourceHash, now - 60 * 60).first<{ count: number | string }>();
  if (Number(recent?.count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    throw new DesktopAuthorizationError("rate_limited", "设备绑定请求过于频繁，请稍后再试。", 429);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const deviceCode = randomBase64Url(32);
    const userCode = randomUserCode();
    const id = `dar_${crypto.randomUUID()}`;
    try {
      await db.prepare(`
        INSERT INTO desktop_auth_requests (
          id, device_code_hash, user_code_hash, source_hash, device_name, client_version,
          status, user_id, expires_at, approved_at, consumed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL, NULL, ?, ?)
      `).bind(
        id,
        await sha256(deviceCode),
        await sha256(normalizeUserCode(userCode)),
        sourceHash,
        deviceName,
        clientVersion,
        now + REQUEST_TTL_SECONDS,
        now,
        now,
      ).run();
      const verificationUri = `${publicOrigin(request)}/device`;
      return {
        deviceCode,
        userCode,
        verificationUri,
        verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
        expiresIn: REQUEST_TTL_SECONDS,
        interval: 2,
      };
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new DesktopAuthorizationError("unavailable", "暂时无法创建设备绑定请求。", 503);
}

export async function desktopAuthorizationSummary(userCode: string) {
  await ensureAuthSchema();
  const normalized = normalizeUserCode(userCode);
  if (!normalized) return null;
  const now = epochSeconds();
  const row = await authDatabase().prepare(`
    SELECT device_name, client_version, status, expires_at
    FROM desktop_auth_requests
    WHERE user_code_hash = ? AND expires_at > ?
    LIMIT 1
  `).bind(await sha256(normalized), now).first<Record<string, string | number>>();
  if (!row) return null;
  return {
    deviceName: String(row.device_name),
    clientVersion: String(row.client_version),
    status: String(row.status),
    expiresAt: Number(row.expires_at),
  };
}

export async function approveDesktopAuthorization(userCode: string, user: AuthenticatedUser) {
  await ensureAuthSchema();
  const normalized = normalizeUserCode(userCode);
  if (!normalized) throw new DesktopAuthorizationError("invalid_code", "设备验证码无效。", 400);
  const now = epochSeconds();
  const db = authDatabase();
  const row = await db.prepare(`
    SELECT id, status, user_id, expires_at
    FROM desktop_auth_requests
    WHERE user_code_hash = ?
    LIMIT 1
  `).bind(await sha256(normalized)).first<AuthorizationRow>();
  if (!row || row.expires_at <= now) {
    throw new DesktopAuthorizationError("expired_token", "设备绑定请求不存在或已经过期。", 410);
  }
  if (row.status === "approved" && row.user_id === user.id) {
    return { approved: true };
  }
  if (row.status !== "pending") {
    throw new DesktopAuthorizationError("invalid_request", "设备绑定请求已经处理。", 409);
  }
  const approved = await db.prepare(`
    UPDATE desktop_auth_requests
    SET status = 'approved', user_id = ?, approved_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).bind(user.id, now, now, row.id).run();
  if (!approved.meta.changes) {
    const current = await db.prepare(`
      SELECT status, user_id
      FROM desktop_auth_requests
      WHERE id = ?
      LIMIT 1
    `).bind(row.id).first<Pick<AuthorizationRow, "status" | "user_id">>();
    if (current?.status === "approved" && current.user_id === user.id) {
      return { approved: true };
    }
    throw new DesktopAuthorizationError("invalid_request", "设备绑定请求已经由其他账号处理。", 409);
  }
  await db.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
    VALUES (?, ?, 'auth.desktop.approve', 'desktop_device', ?, '{}', ?)
  `).bind(`audit_${crypto.randomUUID()}`, user.id, row.id, now).run();
  return { approved: true };
}

export async function exchangeDesktopAuthorization(deviceCode: string) {
  await ensureAuthSchema();
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(deviceCode)) {
    throw new DesktopAuthorizationError("invalid_request", "设备授权凭据无效。", 400);
  }
  const now = epochSeconds();
  const db = authDatabase();
  const row = await db.prepare(`
    SELECT id, status, device_name, client_version, user_id, expires_at
    FROM desktop_auth_requests
    WHERE device_code_hash = ?
    LIMIT 1
  `).bind(await sha256(deviceCode)).first<AuthorizationRow>();
  if (!row || row.expires_at <= now) {
    throw new DesktopAuthorizationError("expired_token", "设备绑定请求已经过期。", 410);
  }
  if (row.status === "pending") {
    throw new DesktopAuthorizationError("authorization_pending", "等待用户在浏览器中确认。", 428);
  }
  if (row.status !== "approved" || !row.user_id) {
    throw new DesktopAuthorizationError("access_denied", "设备绑定未获批准。", 403);
  }

  const accessToken = `eval_dt_${deviceCode}`;
  const tokenHash = await sha256(accessToken);
  const expiresAt = now + SESSION_TTL_SECONDS;
  await db.batch([
    db.prepare(`
      INSERT INTO desktop_sessions (
        id, token_hash, user_id, device_name, client_version,
        expires_at, revoked_at, last_used_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT (token_hash) DO UPDATE SET expires_at = excluded.expires_at, revoked_at = NULL, last_used_at = excluded.last_used_at, updated_at = excluded.updated_at
    `).bind(`dts_${row.id}`, tokenHash, row.user_id, row.device_name, row.client_version, expiresAt, now, now, now),
    db.prepare("UPDATE desktop_auth_requests SET consumed_at = COALESCE(consumed_at, ?), updated_at = ? WHERE id = ?")
      .bind(now, now, row.id),
  ]);
  const user = await getDesktopSessionUser(accessToken);
  if (!user) throw new DesktopAuthorizationError("account_unavailable", "账号已停用或不可用。", 403);
  return { accessToken, tokenType: "Bearer", expiresAt, user };
}

export async function getDesktopSessionUser(token: string | undefined): Promise<AuthenticatedUser | null> {
  if (!token?.startsWith("eval_dt_")) return null;
  await ensureAuthSchema();
  const now = epochSeconds();
  const db = authDatabase();
  const tokenHash = await sha256(token);
  const row = await db.prepare(`
    SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role
    FROM desktop_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first<Record<string, string | number>>();
  if (!row || row.status !== "active") return null;
  await db.prepare("UPDATE desktop_sessions SET last_used_at = ?, updated_at = ? WHERE token_hash = ?")
    .bind(now, now, tokenHash).run();
  return mapUser(row);
}

export async function revokeDesktopSession(token: string | undefined) {
  if (!token?.startsWith("eval_dt_")) return;
  await ensureAuthSchema();
  const now = epochSeconds();
  await authDatabase().prepare(
    "UPDATE desktop_sessions SET revoked_at = ?, updated_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
  ).bind(now, now, await sha256(token)).run();
}

export function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(eval_dt_[A-Za-z0-9_-]{40,80})$/);
  return match?.[1];
}

function mapUser(row: Record<string, string | number>): AuthenticatedUser {
  return {
    id: String(row.id),
    ...(row.username ? { username: String(row.username) } : {}),
    ...(row.email ? { email: String(row.email) } : {}),
    ...(row.phone_e164 ? { phoneE164: String(row.phone_e164) } : {}),
    accountLocale: row.account_locale === "en" ? "en" : "zh",
    displayName: String(row.display_name),
    role: String(row.role) as AuthenticatedUser["role"],
  };
}

function boundedText(value: unknown, max: number, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : fallback;
}

function normalizeUserCode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length === 8 ? normalized : "";
}

function randomUserCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const text = Array.from(bytes, byte => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]).join("");
  return `${text.slice(0, 4)}-${text.slice(4)}`;
}

function randomBase64Url(length: number) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(length))).toString("base64url");
}

function requestSource(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "local";
  return `${address}:${request.headers.get("user-agent") ?? "unknown"}`;
}

function publicOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN?.trim();
  const origin = configured ? new URL(configured).origin : new URL(request.url).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new DesktopAuthorizationError("invalid_configuration", "生产环境账号服务必须使用 HTTPS。", 503);
  }
  return origin;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}
