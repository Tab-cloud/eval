import { env } from "cloudflare:workers";

export const SESSION_COOKIE = "eval_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 210_000;

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  tenantId: string;
  tenantName: string;
  role: "platform_admin" | "tenant_admin" | "developer" | "auditor" | "viewer";
};

const seededAccounts = [
  {
    id: "usr_eval_user",
    email: "user@eval.local",
    displayName: "演示用户",
    role: "developer",
    salt: "HP5L6ky7eu1zEFaVSx5agw==",
    passwordHash: "GYL+wH0VL8Jyg5BvGj4DPp1aXQSwJv0oFzy31F6mQak=",
  },
  {
    id: "usr_eval_admin",
    email: "admin@eval.local",
    displayName: "系统管理员",
    role: "tenant_admin",
    salt: "SOXeiOtQQPP3gzRkt4eZlg==",
    passwordHash: "pz1cMU0k3cFNTyag50o3bNznxpygeE4J3LX6WckbLvk=",
  },
] as const;

let schemaInitialization: Promise<void> | null = null;

function database(): D1Database {
  if (!env.DB) throw new Error("D1 database binding DB is unavailable.");
  return env.DB;
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
    "CREATE TABLE IF NOT EXISTS tenants (id text PRIMARY KEY NOT NULL, name text NOT NULL, slug text NOT NULL, plan text DEFAULT 'team' NOT NULL, status text DEFAULT 'active' NOT NULL, created_at integer NOT NULL, updated_at integer NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_uq ON tenants (slug)",
    "CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY NOT NULL, email text NOT NULL, display_name text NOT NULL, avatar_url text, status text NOT NULL, last_login_at integer, created_at integer NOT NULL, updated_at integer NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email)",
    "CREATE TABLE IF NOT EXISTS memberships (id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id), user_id text NOT NULL REFERENCES users(id), role text NOT NULL, created_at integer NOT NULL, updated_at integer NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS membership_tenant_user_uq ON memberships (tenant_id, user_id)",
    "CREATE INDEX IF NOT EXISTS membership_tenant_idx ON memberships (tenant_id)",
    "CREATE TABLE IF NOT EXISTS password_credentials (user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, password_hash text NOT NULL, password_salt text NOT NULL, iterations integer NOT NULL, updated_at integer NOT NULL)",
    "CREATE TABLE IF NOT EXISTS auth_sessions (id text PRIMARY KEY NOT NULL, token_hash text NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, expires_at integer NOT NULL, created_at integer NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_uq ON auth_sessions (token_hash)",
    "CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)",
  ];
  await db.batch(statements.map(sql => db.prepare(sql)));

  const seedDevelopmentAccounts = process.env.NODE_ENV !== "production" || process.env.EVAL_ENABLE_SEEDED_ACCOUNTS === "true";
  if (!seedDevelopmentAccounts) return;

  const now = Math.floor(Date.now() / 1000);
  const tenantId = "tenant_eval_default";
  const seedStatements = [
    db.prepare("INSERT OR IGNORE INTO tenants (id, name, slug, plan, status, created_at, updated_at) VALUES (?, ?, ?, 'team', 'active', ?, ?)").bind(tenantId, "正在连接（杭州）科技有限公司", "connecting-hangzhou", now, now),
  ];
  for (const account of seededAccounts) {
    seedStatements.push(
      db.prepare("INSERT OR IGNORE INTO users (id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").bind(account.id, account.email, account.displayName, now, now),
      db.prepare("INSERT OR IGNORE INTO memberships (id, tenant_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`mem_${account.id}`, tenantId, account.id, account.role, now, now),
      db.prepare("INSERT OR IGNORE INTO password_credentials (user_id, password_hash, password_salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?)").bind(account.id, account.passwordHash, account.salt, PASSWORD_ITERATIONS, now),
    );
  }
  await db.batch(seedStatements);
}

export async function authenticateEmail(email: string, password: string): Promise<AuthenticatedUser | null> {
  await ensureAuthSchema();
  const row = await database().prepare(`
    SELECT u.id, u.email, u.display_name, u.status, c.password_hash, c.password_salt, c.iterations,
           m.tenant_id, m.role, t.name AS tenant_name, t.status AS tenant_status
    FROM users u
    JOIN password_credentials c ON c.user_id = u.id
    JOIN memberships m ON m.user_id = u.id
    JOIN tenants t ON t.id = m.tenant_id
    WHERE lower(u.email) = lower(?)
    LIMIT 1
  `).bind(email).first<Record<string, string | number>>();
  if (!row || row.status !== "active" || row.tenant_status !== "active") return null;
  const valid = await verifyPassword(password, String(row.password_salt), Number(row.iterations), String(row.password_hash));
  if (!valid) return null;
  return mapUser(row);
}

export async function createSession(user: AuthenticatedUser): Promise<string> {
  await ensureAuthSchema();
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  await database().batch([
    database().prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
    database().prepare("INSERT INTO auth_sessions (id, token_hash, user_id, tenant_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), tokenHash, user.id, user.tenantId, now + SESSION_TTL_SECONDS, now),
    database().prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, user.id),
  ]);
  return token;
}

export async function getSessionUser(token: string | undefined): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  await ensureAuthSchema();
  const now = Math.floor(Date.now() / 1000);
  const row = await database().prepare(`
    SELECT u.id, u.email, u.display_name, u.status, s.tenant_id, m.role,
           t.name AS tenant_name, t.status AS tenant_status
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.user_id = u.id AND m.tenant_id = s.tenant_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.token_hash = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(await sha256(token), now).first<Record<string, string | number>>();
  if (!row || row.status !== "active" || row.tenant_status !== "active") return null;
  return mapUser(row);
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await ensureAuthSchema();
  await database().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
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

function mapUser(row: Record<string, string | number>): AuthenticatedUser {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name),
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
