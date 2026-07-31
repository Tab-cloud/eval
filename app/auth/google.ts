import { OAuth2Client } from "google-auth-library";
import {
  authDatabase,
  createSession,
  ensureAuthSchema,
  findOrLinkGoogleUser,
  sessionCookie,
  type AuthenticatedUser,
} from "./core";
import { environmentValue, identityProviderSettings } from "./provider-settings";

const GOOGLE_STATE_COOKIE = "eval_google_state";
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

export class GoogleConfigurationError extends Error {}
export class GoogleAuthenticationError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export async function beginGoogleAuthorization(request: Request) {
  await ensureAuthSchema();
  const { clientId } = await googleConfiguration();
  const redirectUri = `${applicationOrigin(request)}/api/auth/google/callback`;
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const now = epochSeconds();
  const db = authDatabase();
  await db.batch([
    db.prepare("DELETE FROM auth_oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(now - 60 * 60),
    db.prepare(
      "INSERT INTO auth_oauth_states (state_hash, code_verifier, nonce, redirect_uri, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
    ).bind(await sha256Hex(state), codeVerifier, nonce, redirectUri, now + GOOGLE_STATE_TTL_SECONDS, now),
  ]);

  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return {
    authorizationUrl: authorization.toString(),
    stateCookie: `${GOOGLE_STATE_COOKIE}=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${GOOGLE_STATE_TTL_SECONDS}${isSecureOrigin(request) ? "; Secure" : ""}`,
  };
}

export async function finishGoogleAuthorization(request: Request): Promise<{ user: AuthenticatedUser; session: string }> {
  await ensureAuthSchema();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = cookieValue(request, GOOGLE_STATE_COOKIE);
  if (!state || !code || !cookieState || !timingSafeStringEqual(state, cookieState)) {
    throw new GoogleAuthenticationError("invalid_state");
  }

  const now = epochSeconds();
  const stateResult = await authDatabase().prepare(`
    UPDATE auth_oauth_states
    SET consumed_at = ?
    WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
    RETURNING code_verifier, nonce, redirect_uri
  `).bind(now, await sha256Hex(state), now).run();
  const stored = stateResult.results[0] as { code_verifier?: string; nonce?: string; redirect_uri?: string } | undefined;
  if (!stored?.code_verifier || !stored.nonce || !stored.redirect_uri) {
    throw new GoogleAuthenticationError("expired_state");
  }

  const { clientId, clientSecret, allowedHostedDomain, tenantId } = await googleConfiguration();
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri: stored.redirect_uri });
  let idToken: string | null | undefined;
  try {
    const tokenResponse = await client.getToken({
      code,
      codeVerifier: stored.code_verifier,
      redirect_uri: stored.redirect_uri,
    });
    idToken = tokenResponse.tokens.id_token;
  } catch {
    throw new GoogleAuthenticationError("token_exchange_failed");
  }
  if (!idToken) throw new GoogleAuthenticationError("missing_id_token");

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    throw new GoogleAuthenticationError("invalid_id_token");
  }
  if (
    !payload?.sub
    || !payload.email
    || payload.email_verified !== true
    || payload.nonce !== stored.nonce
  ) {
    throw new GoogleAuthenticationError("invalid_identity");
  }
  if (allowedHostedDomain && payload.hd?.toLowerCase() !== allowedHostedDomain) {
    throw new GoogleAuthenticationError("hosted_domain_denied");
  }
  const user = await findOrLinkGoogleUser(payload.sub, payload.email.toLowerCase(), tenantId);
  if (!user) throw new GoogleAuthenticationError("account_not_provisioned");
  return { user, session: await createSession(user) };
}

export function googleSessionCookie(token: string, request: Request) {
  return sessionCookie(token, isSecureOrigin(request));
}

export function clearGoogleStateCookie(request: Request) {
  return `${GOOGLE_STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${isSecureOrigin(request) ? "; Secure" : ""}`;
}

async function googleConfiguration() {
  const settings = await identityProviderSettings();
  if (!settings.googleEnabled) throw new GoogleConfigurationError("Google 登录已停用。");
  try {
    return {
      tenantId: settings.tenantId,
      clientId: environmentValue(settings.googleClientIdRef),
      clientSecret: environmentValue(settings.googleClientSecretRef),
      allowedHostedDomain: settings.googleAllowedHostedDomain || null,
    };
  } catch (error) {
    throw new GoogleConfigurationError(error instanceof Error ? error.message : "Google OAuth 尚未配置。");
  }
}

function applicationOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN?.trim();
  const origin = configured ? new URL(configured).origin : new URL(request.url).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new GoogleConfigurationError("生产环境 APP_ORIGIN 必须使用 HTTPS。");
  }
  return origin;
}

function isSecureOrigin(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProtocol) return forwardedProtocol === "https";
  return new URL(request.url).protocol === "https:";
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function randomBase64Url(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64Url(bytes);
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}
