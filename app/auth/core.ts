import { postgresDatabase, type PostgresDatabase } from "../../db/postgres";
import { isValidNewUsername, NEW_USERNAME_REQUIREMENTS } from "./username";

export const SESSION_COOKIE = "eval_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 210_000;

export type AuthenticatedUser = {
  id: string;
  username?: string;
  email?: string;
  phoneE164?: string;
  accountLocale: "zh" | "en";
  displayName: string;
  role: "admin" | "member";
};

const seededAccounts = [
  {
    id: "usr_eval_user",
    username: null,
    email: "user@eval.local",
    displayName: "演示用户",
    role: "member",
    salt: "HP5L6ky7eu1zEFaVSx5agw==",
    passwordHash: "GYL+wH0VL8Jyg5BvGj4DPp1aXQSwJv0oFzy31F6mQak=",
    previousPasswordHash: null,
  },
  {
    id: "usr_eval_admin",
    username: "vben",
    email: "admin@eval.local",
    displayName: "系统管理员",
    role: "admin",
    salt: "upPuPdNBDMhCJNpXiAODwQ==",
    passwordHash: "m5TQhCIJoXAPEh1c38JvH74fNHtiYx3QAUqqzDMmLkM=",
    previousPasswordHash: "pz1cMU0k3cFNTyag50o3bNznxpygeE4J3LX6WckbLvk=",
  },
] as const;

let schemaInitialization: Promise<void> | null = null;

function database(): PostgresDatabase {
  return postgresDatabase();
}

export function authDatabase() {
  return database();
}

export function ensureAuthSchema(): Promise<void> {
  schemaInitialization ??= initializeSchema().catch(error => {
    schemaInitialization = null;
    throw error;
  });
  return schemaInitialization;
}

async function initializeSchema() {
  const db = database();
  const statements = [
    "CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY NOT NULL, email text, display_name text NOT NULL, avatar_url text, status text NOT NULL, role text DEFAULT 'member' NOT NULL, last_login_at bigint, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS username text",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 text",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locale text DEFAULT 'zh' NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'member' NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_into_user_id text REFERENCES users(id) ON DELETE SET NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_at bigint",
    "ALTER TABLE users ALTER COLUMN email DROP NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (username)",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci_uq ON users (lower(username)) WHERE username IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email)",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uq ON users (phone_e164)",
    "CREATE INDEX IF NOT EXISTS users_merged_into_idx ON users (merged_into_user_id)",
    "CREATE TABLE IF NOT EXISTS password_credentials (user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, password_hash text NOT NULL, password_salt text NOT NULL, iterations integer NOT NULL, updated_at bigint NOT NULL)",
    "CREATE TABLE IF NOT EXISTS auth_sessions (id text PRIMARY KEY NOT NULL, token_hash text NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at bigint NOT NULL, created_at bigint NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_uq ON auth_sessions (token_hash)",
    "CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)",
    "CREATE TABLE IF NOT EXISTS auth_login_attempts (key_hash text PRIMARY KEY NOT NULL, failed_count integer DEFAULT 0 NOT NULL, first_failed_at bigint NOT NULL, blocked_until bigint, updated_at bigint NOT NULL)",
    "CREATE TABLE IF NOT EXISTS auth_sms_challenges (key_hash text PRIMARY KEY NOT NULL, code_hash text NOT NULL, attempts integer DEFAULT 0 NOT NULL, expires_at bigint NOT NULL, consumed_at bigint, aliyun_biz_id text, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE TABLE IF NOT EXISTS auth_sms_rate_limits (key_hash text PRIMARY KEY NOT NULL, window_started_at bigint NOT NULL, send_count integer DEFAULT 0 NOT NULL, blocked_until bigint, updated_at bigint NOT NULL)",
    "CREATE TABLE IF NOT EXISTS auth_oauth_states (state_hash text PRIMARY KEY NOT NULL, code_verifier text NOT NULL, nonce text NOT NULL, redirect_uri text NOT NULL, expires_at bigint NOT NULL, consumed_at bigint, created_at bigint NOT NULL)",
    "ALTER TABLE auth_oauth_states ADD COLUMN IF NOT EXISTS provider text DEFAULT 'google' NOT NULL",
    "ALTER TABLE auth_oauth_states ADD COLUMN IF NOT EXISTS locale text DEFAULT 'en' NOT NULL",
    "ALTER TABLE auth_oauth_states ADD COLUMN IF NOT EXISTS return_path text DEFAULT '/console' NOT NULL",
    "ALTER TABLE auth_oauth_states ADD COLUMN IF NOT EXISTS intent text DEFAULT 'login' NOT NULL",
    "ALTER TABLE auth_oauth_states ADD COLUMN IF NOT EXISTS link_user_id text REFERENCES users(id) ON DELETE CASCADE",
    "CREATE TABLE IF NOT EXISTS auth_oidc_identities (id text PRIMARY KEY NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider text NOT NULL, subject text NOT NULL, email_at_link text NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS auth_oidc_provider_subject_uq ON auth_oidc_identities (provider, subject)",
    "CREATE UNIQUE INDEX IF NOT EXISTS auth_oidc_provider_user_uq ON auth_oidc_identities (provider, user_id)",
    "CREATE INDEX IF NOT EXISTS auth_oidc_user_idx ON auth_oidc_identities (user_id)",
    "CREATE TABLE IF NOT EXISTS auth_provider_settings (id text PRIMARY KEY DEFAULT 'global' NOT NULL, encryption_context text DEFAULT 'global' NOT NULL, sms_enabled boolean DEFAULT false NOT NULL, aliyun_sign_name text, aliyun_template_code text, aliyun_template_code_key text DEFAULT 'code' NOT NULL, aliyun_access_key_id text, aliyun_access_key_secret_encrypted text, sms_code_pepper_encrypted text, google_enabled boolean DEFAULT false NOT NULL, google_client_id text, google_client_secret_encrypted text, google_allowed_hosted_domain text, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS aliyun_access_key_id text",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS aliyun_access_key_secret_encrypted text",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS sms_code_pepper_encrypted text",
    "ALTER TABLE auth_provider_settings DROP COLUMN IF EXISTS aliyun_access_key_id_ref",
    "ALTER TABLE auth_provider_settings DROP COLUMN IF EXISTS aliyun_access_key_secret_ref",
    "ALTER TABLE auth_provider_settings DROP COLUMN IF EXISTS sms_code_pepper_ref",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS google_client_id text",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS google_client_secret_encrypted text",
    "ALTER TABLE auth_provider_settings DROP COLUMN IF EXISTS google_client_id_ref",
    "ALTER TABLE auth_provider_settings DROP COLUMN IF EXISTS google_client_secret_ref",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS github_enabled boolean DEFAULT false NOT NULL",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS github_client_id text",
    "ALTER TABLE auth_provider_settings ADD COLUMN IF NOT EXISTS github_client_secret_encrypted text",
    "ALTER TABLE auth_provider_settings DROP COLUMN IF EXISTS github_client_id_ref",
    "ALTER TABLE auth_provider_settings DROP COLUMN IF EXISTS github_client_secret_ref",
    "CREATE TABLE IF NOT EXISTS audit_logs (id text PRIMARY KEY NOT NULL, actor_id text, action text NOT NULL, resource_type text NOT NULL, resource_id text, ip_hash text, metadata jsonb, created_at bigint NOT NULL)",
    "CREATE INDEX IF NOT EXISTS audit_time_idx ON audit_logs (created_at)",
    "CREATE TABLE IF NOT EXISTS desktop_auth_requests (id text PRIMARY KEY NOT NULL, device_code_hash text NOT NULL, user_code_hash text NOT NULL, source_hash text NOT NULL, device_name text NOT NULL, client_version text NOT NULL, status text NOT NULL, user_id text REFERENCES users(id) ON DELETE CASCADE, expires_at bigint NOT NULL, approved_at bigint, consumed_at bigint, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS desktop_auth_device_code_uq ON desktop_auth_requests (device_code_hash)",
    "CREATE UNIQUE INDEX IF NOT EXISTS desktop_auth_user_code_uq ON desktop_auth_requests (user_code_hash)",
    "CREATE INDEX IF NOT EXISTS desktop_auth_source_time_idx ON desktop_auth_requests (source_hash, created_at)",
    "CREATE TABLE IF NOT EXISTS desktop_sessions (id text PRIMARY KEY NOT NULL, token_hash text NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_name text NOT NULL, client_version text NOT NULL, expires_at bigint NOT NULL, revoked_at bigint, last_used_at bigint, created_at bigint NOT NULL, updated_at bigint NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS desktop_sessions_token_uq ON desktop_sessions (token_hash)",
    "CREATE INDEX IF NOT EXISTS desktop_sessions_user_idx ON desktop_sessions (user_id)",
  ];
  await db.batch(statements.map(sql => db.prepare(sql)));

  const seedDevelopmentAccounts = process.env.NODE_ENV !== "production" || process.env.EVAL_ENABLE_SEEDED_ACCOUNTS === "true";
  if (!seedDevelopmentAccounts) return;

  const now = Math.floor(Date.now() / 1000);
  const seedStatements: Array<ReturnType<typeof db.prepare>> = [];
  for (const account of seededAccounts) {
    seedStatements.push(
      db.prepare("INSERT INTO users (id, username, email, display_name, status, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?) ON CONFLICT DO NOTHING").bind(account.id, account.username, account.email, account.displayName, account.role, now, now),
      db.prepare("INSERT INTO password_credentials (user_id, password_hash, password_salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(account.id, account.passwordHash, account.salt, PASSWORD_ITERATIONS, now),
    );
    if (account.username) {
      seedStatements.push(
        db.prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ? AND username IS NULL").bind(account.username, now, account.id),
      );
    }
    if (account.previousPasswordHash) {
      seedStatements.push(
        db.prepare("UPDATE password_credentials SET password_hash = ?, password_salt = ?, iterations = ?, updated_at = ? WHERE user_id = ? AND password_hash = ?")
          .bind(account.passwordHash, account.salt, PASSWORD_ITERATIONS, now, account.id, account.previousPasswordHash),
      );
    }
  }
  await db.batch(seedStatements);
}

export async function authenticateEmail(email: string, password: string): Promise<AuthenticatedUser | null> {
  await ensureAuthSchema();
  const row = await database().prepare(`
    SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role,
           c.password_hash, c.password_salt, c.iterations
    FROM users u
    JOIN password_credentials c ON c.user_id = u.id
    WHERE lower(u.email) = lower(?)
    LIMIT 1
  `).bind(email).first<Record<string, string | number>>();
  if (!row || row.status !== "active") return null;
  const valid = await verifyPassword(password, String(row.password_salt), Number(row.iterations), String(row.password_hash));
  if (!valid) return null;
  return mapUser(row);
}

export async function authenticateUsername(username: string, password: string): Promise<AuthenticatedUser | null> {
  await ensureAuthSchema();
  const row = await database().prepare(`
    SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role,
           c.password_hash, c.password_salt, c.iterations
    FROM users u
    JOIN password_credentials c ON c.user_id = u.id
    WHERE lower(u.username) = lower(?)
    LIMIT 1
  `).bind(username).first<Record<string, string | number>>();
  if (!row || row.status !== "active") return null;
  const valid = await verifyPassword(password, String(row.password_salt), Number(row.iterations), String(row.password_hash));
  if (!valid) return null;
  return mapUser(row);
}

export async function findActiveUserByPhone(phoneE164: string): Promise<AuthenticatedUser | null> {
  await ensureAuthSchema();
  const row = await database().prepare(`
    SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role
    FROM users u
    WHERE u.phone_e164 = ?
    LIMIT 1
  `).bind(phoneE164).first<Record<string, string | number>>();
  if (!row || row.status !== "active") return null;
  return mapUser(row);
}

export async function hasCompleteChineseLocalIdentity(userId: string) {
  await ensureAuthSchema();
  const row = await database().prepare(`
    SELECT u.username, c.user_id AS credential_user_id
    FROM users u
    LEFT JOIN password_credentials c ON c.user_id = u.id
    WHERE u.id = ? AND u.account_locale = 'zh'
    LIMIT 1
  `).bind(userId).first<{ username: string | null; credential_user_id: string | null }>();
  return Boolean(row?.username && row.credential_user_id);
}

export type ExternalProvider = "google" | "github";

export class ExternalIdentityConflictError extends Error {}
export class ExternalIdentityPolicyError extends Error {}

export async function loginOrCreateExternalUser(
  provider: ExternalProvider,
  subject: string,
  verifiedEmails: string[],
  accountLocale: "zh" | "en",
): Promise<AuthenticatedUser | null> {
  await ensureAuthSchema();
  const db = database();
  const existing = await externalUserBySubject(provider, subject);
  if (existing) {
    if (provider === "google" && existing.accountLocale !== "en") {
      throw new ExternalIdentityPolicyError("Google 仅用于英文账号。");
    }
    return existing;
  }

  let candidate: Record<string, string | number> | null = null;
  let emailAtLink = "";
  const uniqueEmails = Array.from(new Set(verifiedEmails.map(email => email.trim().toLowerCase()).filter(Boolean)));
  for (const verifiedEmail of uniqueEmails) {
    candidate = await db.prepare(`
      SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role
      FROM users u
      WHERE lower(u.email) = lower(?)
      LIMIT 1
    `).bind(verifiedEmail).first<Record<string, string | number>>();
    if (candidate) {
      emailAtLink = verifiedEmail;
      break;
    }
  }
  const now = Math.floor(Date.now() / 1000);
  if (!candidate) {
    const primaryEmail = uniqueEmails[0];
    if (!primaryEmail) return null;
    const userId = `usr_${crypto.randomUUID()}`;
    const displayName = primaryEmail.split("@")[0].slice(0, 64) || (accountLocale === "zh" ? "Eval 用户" : "Eval User");
    try {
      await db.batch([
        db.prepare("INSERT INTO users (id, username, email, phone_e164, account_locale, display_name, status, role, created_at, updated_at) VALUES (?, NULL, ?, NULL, ?, ?, 'active', 'member', ?, ?)")
          .bind(userId, primaryEmail, accountLocale, displayName, now, now),
        db.prepare("INSERT INTO auth_oidc_identities (id, user_id, provider, subject, email_at_link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(`oidc_${crypto.randomUUID()}`, userId, provider, subject, primaryEmail, now, now),
        auditStatement(userId, "auth.account.register", "user", userId, { locale: accountLocale, provider }, now),
      ]);
    } catch {
      const raced = await externalUserBySubject(provider, subject);
      if (raced) return raced;
      candidate = await userByVerifiedEmails(uniqueEmails);
      if (!candidate) throw new ExternalIdentityConflictError("该第三方邮箱已绑定其他账号。");
    }
    return externalUserBySubject(provider, subject);
  }
  if (candidate.status !== "active") return null;

  if (!candidate.username && !candidate.phone_e164 && candidate.account_locale !== accountLocale) {
    const existingIdentity = await db.prepare("SELECT id FROM auth_oidc_identities WHERE user_id = ? LIMIT 1")
      .bind(String(candidate.id)).first<{ id: string }>();
    if (!existingIdentity) {
      await db.prepare("UPDATE users SET account_locale = ?, updated_at = ? WHERE id = ?")
        .bind(accountLocale, now, String(candidate.id)).run();
      candidate.account_locale = accountLocale;
    }
  }
  if (provider === "google" && candidate.account_locale !== "en") {
    throw new ExternalIdentityPolicyError("Google 仅用于英文账号。");
  }

  await linkExternalIdentity(mapUser(candidate), provider, subject, emailAtLink);
  return externalUserBySubject(provider, subject);
}

export async function linkExternalIdentity(user: AuthenticatedUser, provider: ExternalProvider, subject: string, verifiedEmail: string) {
  return linkOrMergeExternalIdentity(user, provider, subject, verifiedEmail, false);
}

export async function linkOrMergeExternalIdentity(
  user: AuthenticatedUser,
  provider: ExternalProvider,
  subject: string,
  verifiedEmail: string,
  allowAccountMerge = false,
): Promise<{ merged: boolean }> {
  await ensureAuthSchema();
  const db = database();
  try {
    return await db.transaction(async transaction => {
      const now = Math.floor(Date.now() / 1000);
      const owned = await transaction.prepare("SELECT user_id FROM auth_oidc_identities WHERE provider = ? AND subject = ? FOR UPDATE")
        .bind(provider, subject).first<{ user_id: string }>();
      const current = await transaction.prepare("SELECT subject FROM auth_oidc_identities WHERE provider = ? AND user_id = ? FOR UPDATE")
        .bind(provider, user.id).first<{ subject: string }>();
      if (current && current.subject !== subject) {
        throw new ExternalIdentityConflictError("当前账号已经绑定另一个第三方账号，无法自动合并。");
      }
      if (owned?.user_id === user.id || current) return { merged: false };
      if (!owned) {
        const activeTarget = await transaction.prepare("SELECT id FROM users WHERE id = ? AND status = 'active' FOR UPDATE")
          .bind(user.id).first<{ id: string }>();
        if (!activeTarget) throw new ExternalIdentityConflictError("当前账号状态不允许绑定。");
        await transaction.prepare("INSERT INTO auth_oidc_identities (id, user_id, provider, subject, email_at_link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(`oidc_${crypto.randomUUID()}`, user.id, provider, subject, verifiedEmail, now, now).run();
        await transaction.prepare("INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, 'auth.identity.link', 'user', ?, ?, ?)")
          .bind(`audit_${crypto.randomUUID()}`, user.id, user.id, JSON.stringify({ provider }), now).run();
        return { merged: false };
      }
      if (!allowAccountMerge) throw new ExternalIdentityConflictError("该第三方账号已绑定其他用户。");
      await mergeAccountIntoCurrent(transaction, user, owned.user_id, provider, now);
      return { merged: true };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ExternalIdentityConflictError("该第三方账号已经绑定其他用户。");
    throw error;
  }
}

type TransactionDatabase = Pick<PostgresDatabase, "prepare">;

type MergeUserRow = {
  id: string;
  username: string | null;
  email: string | null;
  phone_e164: string | null;
  account_locale: "zh" | "en";
  display_name: string;
  avatar_url: string | null;
  status: string;
  role: string;
};

async function mergeAccountIntoCurrent(
  transaction: TransactionDatabase,
  targetUser: AuthenticatedUser,
  sourceUserId: string,
  verifiedProvider: ExternalProvider,
  now: number,
) {
  const users = await transaction.prepare(`
    SELECT id, username, email, phone_e164, account_locale, display_name, avatar_url, status, role
    FROM users
    WHERE id IN (?, ?)
    ORDER BY id
    FOR UPDATE
  `).bind(targetUser.id, sourceUserId).all<MergeUserRow>();
  const target = users.results.find(item => item.id === targetUser.id);
  const source = users.results.find(item => item.id === sourceUserId);
  if (!target || target.status !== "active") throw new ExternalIdentityConflictError("当前账号状态不允许合并。");
  if (!source || source.status !== "active") throw new ExternalIdentityConflictError("GitHub 原账号状态不允许合并。");
  if (source.role === "admin") throw new ExternalIdentityConflictError("管理员账号不能通过个人中心自动合并，请联系系统管理员处理。");

  const [targetIdentities, sourceIdentities, targetCredential, sourceCredential] = await Promise.all([
    transaction.prepare("SELECT provider, subject FROM auth_oidc_identities WHERE user_id = ? FOR UPDATE").bind(target.id).all<{ provider: string; subject: string }>(),
    transaction.prepare("SELECT provider, subject FROM auth_oidc_identities WHERE user_id = ? FOR UPDATE").bind(source.id).all<{ provider: string; subject: string }>(),
    transaction.prepare("SELECT user_id FROM password_credentials WHERE user_id = ? FOR UPDATE").bind(target.id).first<{ user_id: string }>(),
    transaction.prepare("SELECT user_id FROM password_credentials WHERE user_id = ? FOR UPDATE").bind(source.id).first<{ user_id: string }>(),
  ]);
  const targetByProvider = new Map(targetIdentities.results.map(identity => [identity.provider, identity.subject]));
  for (const identity of sourceIdentities.results) {
    const existingSubject = targetByProvider.get(identity.provider);
    if (existingSubject && existingSubject !== identity.subject) {
      throw new ExternalIdentityConflictError(`两个账号分别绑定了不同的 ${identity.provider} 身份，无法自动合并。`);
    }
    if (identity.provider === "google" && target.account_locale !== "en") {
      throw new ExternalIdentityConflictError("包含 Google 身份的账号不能合并到中文账号。");
    }
  }
  if (target.username && source.username) throw new ExternalIdentityConflictError("两个账号都已设置用户名，无法自动合并。");
  if (target.phone_e164 && source.phone_e164) throw new ExternalIdentityConflictError("两个账号都已绑定手机号，无法自动合并。");
  if (targetCredential && sourceCredential) throw new ExternalIdentityConflictError("两个账号都已设置密码，无法自动合并。");
  if (sourceCredential && target.account_locale !== "zh") {
    throw new ExternalIdentityConflictError("包含本地密码身份的账号不能合并到英文账号。");
  }

  await transaction.prepare(`
    UPDATE users
    SET username = NULL, email = NULL, phone_e164 = NULL, status = 'disabled',
        merged_into_user_id = ?, merged_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(target.id, now, now, source.id).run();
  await transaction.prepare(`
    UPDATE users
    SET username = COALESCE(username, ?), email = COALESCE(email, ?), phone_e164 = COALESCE(phone_e164, ?),
        avatar_url = COALESCE(avatar_url, ?), updated_at = ?
    WHERE id = ?
  `).bind(source.username, source.email, source.phone_e164, source.avatar_url, now, target.id).run();
  if (sourceCredential) {
    await transaction.prepare("UPDATE password_credentials SET user_id = ?, updated_at = ? WHERE user_id = ?")
      .bind(target.id, now, source.id).run();
  }
  await transaction.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(source.id).run();
  await transaction.prepare("DELETE FROM auth_oauth_states WHERE link_user_id = ?").bind(source.id).run();
  await transaction.prepare("UPDATE auth_oidc_identities SET user_id = ?, updated_at = ? WHERE user_id = ?")
    .bind(target.id, now, source.id).run();
  await transaction.prepare("UPDATE desktop_auth_requests SET user_id = ?, status = CASE WHEN status = 'pending' THEN 'denied' ELSE status END, updated_at = ? WHERE user_id = ?")
    .bind(target.id, now, source.id).run();
  await transaction.prepare("UPDATE desktop_sessions SET user_id = ?, revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE user_id = ?")
    .bind(target.id, now, now, source.id).run();
  await transaction.prepare("UPDATE agent_community_actions SET user_id = ? WHERE user_id = ?").bind(target.id, source.id).run();
  await transaction.prepare("DELETE FROM user_agent_community_settings WHERE user_id = ?").bind(source.id).run();
  await transaction.prepare("UPDATE forum_topics SET author_id = ? WHERE author_id = ?").bind(target.id, source.id).run();
  await transaction.prepare("UPDATE forum_replies SET author_id = ? WHERE author_id = ?").bind(target.id, source.id).run();
  await transaction.prepare("UPDATE blog_posts SET author_id = ? WHERE author_id = ?").bind(target.id, source.id).run();
  await transaction.prepare("UPDATE release_settings SET updated_by = ? WHERE updated_by = ?").bind(target.id, source.id).run();
  await transaction.prepare("UPDATE agent_community_policy SET updated_by = ? WHERE updated_by = ?").bind(target.id, source.id).run();
  await transaction.prepare("INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, 'auth.account.merge', 'user', ?, ?, ?)")
    .bind(
      `audit_${crypto.randomUUID()}`,
      target.id,
      target.id,
      JSON.stringify({ sourceUserId: source.id, verifiedProvider, revokedSourceSessions: true, resetSourceCommunityConsent: true }),
      now,
    ).run();
}

async function userByVerifiedEmails(verifiedEmails: string[]) {
  for (const email of verifiedEmails) {
    const row = await database().prepare(`
      SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role
      FROM users u
      WHERE lower(u.email) = lower(?)
      LIMIT 1
    `).bind(email).first<Record<string, string | number>>();
    if (row) return row;
  }
  return null;
}

async function externalUserBySubject(provider: "google" | "github", subject: string): Promise<AuthenticatedUser | null> {
  const row = await database().prepare(`
    SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role
    FROM auth_oidc_identities i
    JOIN users u ON u.id = i.user_id
    WHERE i.provider = ? AND i.subject = ?
    LIMIT 1
  `).bind(provider, subject).first<Record<string, string | number>>();
  if (!row || row.status !== "active") return null;
  return mapUser(row);
}

export async function loginAttemptKey(email: string, request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "local";
  return sha256(`${email.toLowerCase()}:${address}`);
}

export async function isLoginBlocked(keyHash: string) {
  await ensureAuthSchema();
  const now = Math.floor(Date.now() / 1000);
  const row = await database().prepare("SELECT blocked_until FROM auth_login_attempts WHERE key_hash = ?").bind(keyHash).first<{ blocked_until: number | null }>();
  return Boolean(row?.blocked_until && row.blocked_until > now);
}

export async function recordFailedLogin(keyHash: string) {
  await ensureAuthSchema();
  const db = database();
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare("SELECT failed_count, first_failed_at FROM auth_login_attempts WHERE key_hash = ?").bind(keyHash).first<{ failed_count: number; first_failed_at: number }>();
  const expiredWindow = !row || now - row.first_failed_at > 15 * 60;
  const failedCount = expiredWindow ? 1 : row.failed_count + 1;
  const firstFailedAt = expiredWindow ? now : row.first_failed_at;
  const blockedUntil = failedCount >= 5 ? now + 15 * 60 : null;
  await db.prepare(
    "INSERT INTO auth_login_attempts (key_hash, failed_count, first_failed_at, blocked_until, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key_hash) DO UPDATE SET failed_count=excluded.failed_count, first_failed_at=excluded.first_failed_at, blocked_until=excluded.blocked_until, updated_at=excluded.updated_at",
  ).bind(keyHash, failedCount, firstFailedAt, blockedUntil, now).run();
}

export async function clearFailedLogins(keyHash: string) {
  await ensureAuthSchema();
  await database().prepare("DELETE FROM auth_login_attempts WHERE key_hash = ?").bind(keyHash).run();
}

export async function createSession(user: AuthenticatedUser): Promise<string> {
  await ensureAuthSchema();
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  await database().batch([
    database().prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
    database().prepare("INSERT INTO auth_sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), tokenHash, user.id, now + SESSION_TTL_SECONDS, now),
    database().prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, user.id),
  ]);
  return token;
}

export async function getSessionUser(token: string | undefined): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  await ensureAuthSchema();
  const now = Math.floor(Date.now() / 1000);
  const row = await database().prepare(`
    SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(await sha256(token), now).first<Record<string, string | number>>();
  if (!row || row.status !== "active") return null;
  return mapUser(row);
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await ensureAuthSchema();
  await database().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export class AccountConflictError extends Error {}
export class AccountValidationError extends Error {}

export async function registerChineseAccount(input: { username: string; phoneE164: string; password: string }) {
  if (!isValidNewUsername(input.username)) throw new AccountValidationError(NEW_USERNAME_REQUIREMENTS);
  await ensureAuthSchema();
  const db = database();
  const phoneOwner = await db.prepare(`
    SELECT u.id, u.username, u.account_locale, c.user_id AS credential_user_id
    FROM users u
    LEFT JOIN password_credentials c ON c.user_id = u.id
    WHERE u.phone_e164 = ?
    LIMIT 1
  `).bind(input.phoneE164).first<{
    id: string;
    username: string | null;
    account_locale: string;
    credential_user_id: string | null;
  }>();
  if (phoneOwner && phoneOwner.account_locale !== "zh") {
    throw new AccountConflictError("该手机号无法用于中文账号注册。");
  }
  if (phoneOwner && phoneOwner.username && phoneOwner.credential_user_id) {
    throw new AccountConflictError("该手机号已完成注册，请直接登录。");
  }
  const usernameOwner = await db.prepare("SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ? LIMIT 1")
    .bind(input.username, phoneOwner?.id ?? "").first<{ id: string }>();
  if (usernameOwner) throw new AccountConflictError("该用户名已被使用。");
  const credential = await createPasswordHash(input.password);
  const now = Math.floor(Date.now() / 1000);
  if (phoneOwner) {
    try {
      await db.batch([
        db.prepare("UPDATE users SET username = ?, display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END, updated_at = ? WHERE id = ?")
          .bind(input.username, input.username, now, phoneOwner.id),
        db.prepare(`INSERT INTO password_credentials (user_id, password_hash, password_salt, iterations, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash, password_salt=excluded.password_salt, iterations=excluded.iterations, updated_at=excluded.updated_at`)
          .bind(phoneOwner.id, credential.passwordHash, credential.salt, credential.iterations, now),
        auditStatement(phoneOwner.id, "auth.account.complete", "user", phoneOwner.id, { locale: "zh", provider: "phone" }, now),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AccountConflictError("用户名或手机号已被使用。");
      throw error;
    }
    return userById(phoneOwner.id);
  }
  const userId = `usr_${crypto.randomUUID()}`;
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id, username, email, phone_e164, account_locale, display_name, status, role, created_at, updated_at) VALUES (?, ?, NULL, ?, 'zh', ?, 'active', 'member', ?, ?)")
        .bind(userId, input.username, input.phoneE164, input.username, now, now),
      db.prepare("INSERT INTO password_credentials (user_id, password_hash, password_salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(userId, credential.passwordHash, credential.salt, credential.iterations, now),
      auditStatement(userId, "auth.account.register", "user", userId, { locale: "zh", provider: "phone" }, now),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountConflictError("用户名或手机号已被使用。");
    throw error;
  }
  return userById(userId);
}

export async function bindChineseLocalIdentity(user: AuthenticatedUser, input: { username: string; phoneE164: string; password: string }) {
  if (user.accountLocale !== "zh") throw new AccountConflictError("英文账号不支持绑定手机号或密码。");
  if (!isValidNewUsername(input.username)) throw new AccountValidationError(NEW_USERNAME_REQUIREMENTS);
  await ensureAuthSchema();
  const db = database();
  const owner = await db.prepare("SELECT id FROM users WHERE id <> ? AND (lower(username) = lower(?) OR phone_e164 = ?) LIMIT 1")
    .bind(user.id, input.username, input.phoneE164).first<{ id: string }>();
  if (owner) throw new AccountConflictError("用户名或手机号已被使用。");
  const credential = await createPasswordHash(input.password);
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.batch([
      db.prepare("UPDATE users SET username = ?, phone_e164 = ?, display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END, updated_at = ? WHERE id = ?")
        .bind(input.username, input.phoneE164, input.username, now, user.id),
      db.prepare(`INSERT INTO password_credentials (user_id, password_hash, password_salt, iterations, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash, password_salt=excluded.password_salt, iterations=excluded.iterations, updated_at=excluded.updated_at`)
        .bind(user.id, credential.passwordHash, credential.salt, credential.iterations, now),
      auditStatement(user.id, "auth.local_identity.bind", "user", user.id, { phone: maskPhoneForAudit(input.phoneE164) }, now),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountConflictError("用户名或手机号已被使用。");
    throw error;
  }
  return userById(user.id);
}

export async function replacePassword(user: AuthenticatedUser, nextPassword: string) {
  if (user.accountLocale !== "zh" || !user.phoneE164) throw new AccountConflictError("当前账号尚未绑定中国大陆手机号。");
  await ensureAuthSchema();
  const db = database();
  const next = await createPasswordHash(nextPassword);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`INSERT INTO password_credentials (user_id, password_hash, password_salt, iterations, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash, password_salt=excluded.password_salt, iterations=excluded.iterations, updated_at=excluded.updated_at`)
      .bind(user.id, next.passwordHash, next.salt, next.iterations, now),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(user.id),
    auditStatement(user.id, "auth.password.change", "user", user.id, { verifiedBy: "sms" }, now),
  ]);
}

export async function accountIdentitySnapshot(user: AuthenticatedUser) {
  await ensureAuthSchema();
  const db = database();
  const [identities, credential] = await Promise.all([
    db.prepare("SELECT provider, email_at_link AS \"emailAtLink\" FROM auth_oidc_identities WHERE user_id = ? ORDER BY provider").bind(user.id).all<{ provider: string; emailAtLink: string }>(),
    db.prepare("SELECT user_id FROM password_credentials WHERE user_id = ?").bind(user.id).first<{ user_id: string }>(),
  ]);
  return {
    user: { id: user.id, username: user.username ?? null, email: user.email ?? null, phoneE164: user.phoneE164 ?? null, displayName: user.displayName, accountLocale: user.accountLocale },
    providers: {
      google: identities.results.find(item => item.provider === "google") ?? null,
      github: identities.results.find(item => item.provider === "github") ?? null,
    },
    passwordConfigured: Boolean(credential),
  };
}

export function sessionCookie(token: string, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function cookieToken(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return { salt: btoa(String.fromCharCode(...salt)), passwordHash: btoa(String.fromCharCode(...new Uint8Array(bits))), iterations: PASSWORD_ITERATIONS };
}

async function verifyPassword(password: string, saltBase64: string, iterations: number, expectedBase64: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltBase64), iterations }, key, 256);
  const actual = new Uint8Array(bits);
  const expected = fromBase64(expectedBase64);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function userById(userId: string): Promise<AuthenticatedUser | null> {
  const row = await database().prepare(`
    SELECT u.id, u.username, u.email, u.phone_e164, u.account_locale, u.display_name, u.status, u.role
    FROM users u
    WHERE u.id = ?
    LIMIT 1
  `).bind(userId).first<Record<string, string | number>>();
  if (!row || row.status !== "active") return null;
  return mapUser(row);
}

function auditStatement(actorId: string, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>, now: number) {
  return database().prepare("INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(`audit_${crypto.randomUUID()}`, actorId, action, resourceType, resourceId, JSON.stringify(metadata), now);
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

function maskPhoneForAudit(phoneE164: string) {
  return phoneE164.replace(/^(\+86\d{3})\d{4}(\d{4})$/, "$1****$2");
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

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

function toBase64Url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
