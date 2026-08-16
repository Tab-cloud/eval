import { SmsConfigurationError, SmsDeliveryError, sendLoginVerificationCode } from "./aliyun-sms";
import { authDatabase, ensureAuthSchema, findActiveUserByPhone, type AuthenticatedUser } from "./core";
import { environmentValue, tenantProviderSettings } from "./provider-settings";

const CODE_TTL_SECONDS = 5 * 60;
const MAX_VERIFY_ATTEMPTS = 5;

export type SmsPurpose = "login" | "register" | "phone_bind" | "password_change";
type SmsContext = { tenantId: string; userId?: string };

export { SmsConfigurationError, SmsDeliveryError };

export class SmsRateLimitError extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("短信请求过于频繁。");
    this.retryAfter = Math.max(1, retryAfter);
  }
}

export async function requestSmsCode(purpose: SmsPurpose, phoneE164: string, request: Request, context?: SmsContext) {
  await ensureAuthSchema();
  const now = epochSeconds();
  const phoneHash = await sha256(phoneE164);
  const ipHash = await sha256(clientAddress(request));

  await consumeRateLimit(`sms:cooldown:${phoneHash}`, 1, 60, now);
  await consumeRateLimit(`sms:phone:${phoneHash}`, 5, 60 * 60, now);
  await consumeRateLimit(`sms:ip:${ipHash}`, 20, 60 * 60, now);

  const user = await findActiveUserByPhone(phoneE164);
  if (purpose === "login" && (!user || user.accountLocale !== "zh")) return { accepted: true, retryAfter: 60 };
  if (purpose === "register" && user) return { accepted: true, retryAfter: 60 };
  if ((purpose === "phone_bind" || purpose === "password_change") && (!context?.userId || !context.tenantId)) {
    return { accepted: true, retryAfter: 60 };
  }
  if (purpose === "phone_bind" && user && user.id !== context?.userId) return { accepted: true, retryAfter: 60 };
  if (purpose === "password_change" && (!user || user.id !== context?.userId || user.phoneE164 !== phoneE164)) {
    return { accepted: true, retryAfter: 60 };
  }
  const tenantId = user?.tenantId ?? context?.tenantId;
  if (!tenantId) throw new SmsConfigurationError("无法确定短信所属组织。");

  const code = randomSixDigitCode();
  const keyHash = await challengeKey(purpose, phoneE164, context?.userId);
  const codeHash = await challengeCodeHash(keyHash, code, tenantId);
  const outId = `${purpose}_${crypto.randomUUID()}`;
  const delivery = await sendLoginVerificationCode(tenantId, phoneE164, code, outId);
  const db = authDatabase();
  await db.batch([
    db.prepare("DELETE FROM auth_sms_challenges WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(now - 60 * 60),
    db.prepare(`
      INSERT INTO auth_sms_challenges (key_hash, code_hash, attempts, expires_at, consumed_at, aliyun_biz_id, created_at, updated_at)
      VALUES (?, ?, 0, ?, NULL, ?, ?, ?)
      ON CONFLICT(key_hash) DO UPDATE SET
        code_hash=excluded.code_hash,
        attempts=0,
        expires_at=excluded.expires_at,
        consumed_at=NULL,
        aliyun_biz_id=excluded.aliyun_biz_id,
        created_at=excluded.created_at,
        updated_at=excluded.updated_at
    `).bind(keyHash, codeHash, now + CODE_TTL_SECONDS, delivery.bizId, now, now),
  ]);
  return { accepted: true, retryAfter: 60 };
}

export async function authenticateSmsCode(phoneE164: string, code: string): Promise<AuthenticatedUser | null> {
  await ensureAuthSchema();
  const user = await findActiveUserByPhone(phoneE164);
  if (!user) return null;
  return await verifySmsCode("login", phoneE164, code, user.tenantId) ? user : null;
}

export async function verifySmsCode(purpose: SmsPurpose, phoneE164: string, code: string, tenantId: string, userId?: string) {
  await ensureAuthSchema();
  const now = epochSeconds();
  const keyHash = await challengeKey(purpose, phoneE164, userId);
  const codeHash = await challengeCodeHash(keyHash, code, tenantId);
  const db = authDatabase();
  const consumed = await db.prepare(`
    UPDATE auth_sms_challenges
    SET consumed_at = ?, updated_at = ?
    WHERE key_hash = ?
      AND code_hash = ?
      AND consumed_at IS NULL
      AND expires_at > ?
      AND attempts < ?
    RETURNING key_hash
  `).bind(now, now, keyHash, codeHash, now, MAX_VERIFY_ATTEMPTS).run();
  if (!consumed.meta.changes) {
    await db.prepare(`
      UPDATE auth_sms_challenges
      SET attempts = attempts + 1,
          consumed_at = CASE WHEN attempts + 1 >= ? THEN ? ELSE consumed_at END,
          updated_at = ?
      WHERE key_hash = ? AND consumed_at IS NULL AND expires_at > ?
    `).bind(MAX_VERIFY_ATTEMPTS, now, now, keyHash, now).run();
    return false;
  }
  return true;
}

async function consumeRateLimit(keyHash: string, maximum: number, windowSeconds: number, now: number) {
  const resetBefore = now - windowSeconds;
  const result = await authDatabase().prepare(`
    INSERT INTO auth_sms_rate_limits (key_hash, window_started_at, send_count, blocked_until, updated_at)
    VALUES (?, ?, 1, NULL, ?)
    ON CONFLICT(key_hash) DO UPDATE SET
      send_count = CASE
        WHEN auth_sms_rate_limits.window_started_at <= ? THEN 1
        ELSE auth_sms_rate_limits.send_count + 1
      END,
      window_started_at = CASE
        WHEN auth_sms_rate_limits.window_started_at <= ? THEN ?
        ELSE auth_sms_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN auth_sms_rate_limits.blocked_until IS NOT NULL AND auth_sms_rate_limits.blocked_until > ?
          THEN auth_sms_rate_limits.blocked_until
        WHEN auth_sms_rate_limits.window_started_at > ? AND auth_sms_rate_limits.send_count >= ?
          THEN ?
        ELSE NULL
      END,
      updated_at = ?
    RETURNING send_count, blocked_until
  `).bind(
    keyHash,
    now,
    now,
    resetBefore,
    resetBefore,
    now,
    now,
    resetBefore,
    maximum,
    now + windowSeconds,
    now,
  ).first<{ send_count: number; blocked_until: number | null }>();
  if (!result) throw new Error("短信限流状态写入失败。");
  if (result.send_count > maximum || (result.blocked_until && result.blocked_until > now)) {
    throw new SmsRateLimitError((result.blocked_until ?? now + windowSeconds) - now);
  }
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "local";
}

async function challengeKey(purpose: SmsPurpose, phoneE164: string, userId?: string) {
  return sha256(`${purpose}:${userId ?? "public"}:${phoneE164}`);
}

async function challengeCodeHash(keyHash: string, code: string, tenantId: string) {
  const settings = await tenantProviderSettings(tenantId);
  let pepper: string;
  try {
    pepper = environmentValue(settings.smsCodePepperRef);
  } catch (error) {
    throw new SmsConfigurationError(error instanceof Error ? error.message : "短信验证码 Pepper 尚未配置。");
  }
  if (pepper.length < 32) throw new SmsConfigurationError(`${settings.smsCodePepperRef} 必须至少包含 32 个字符。`);
  return sha256(`${keyHash}:${code}:${pepper}`);
}

function randomSixDigitCode() {
  const range = 1_000_000;
  const ceiling = Math.floor(0x1_0000_0000 / range) * range;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return String(values[0] % range).padStart(6, "0");
}

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
