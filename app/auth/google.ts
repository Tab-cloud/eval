import { OAuth2Client } from "google-auth-library";
import {
  authDatabase,
  cookieToken,
  createSession,
  ensureAuthSchema,
  ExternalIdentityConflictError,
  ExternalIdentityPolicyError,
  getSessionUser,
  linkExternalIdentity,
  loginOrCreateExternalUser,
  sessionCookie,
  type AuthenticatedUser,
} from "./core";
import { environmentValue, identityProviderSettings } from "./provider-settings";
import { safeReturnPath } from "./return-path";

const GOOGLE_STATE_COOKIE = "eval_google_state";
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

export class GoogleConfigurationError extends Error {}
export class GoogleAuthenticationError extends Error {
  readonly reason: string;
  readonly returnPath: string;
  readonly locale: "zh" | "en";

  constructor(reason: string, context?: { returnPath?: string; locale?: string }) {
    super(reason);
    this.reason = reason;
    this.returnPath = safeReturnPath(context?.returnPath);
    this.locale = context?.locale === "zh" ? "zh" : "en";
  }
}

export async function beginGoogleAuthorization(request: Request) {
  await ensureAuthSchema();
  const { clientId } = await googleConfiguration();
  const redirectUri = `${applicationOrigin(request)}/api/auth/google/callback`;
  const requestUrl = new URL(request.url);
  const intent = requestUrl.searchParams.get("intent") === "link" ? "link" : "login";
  let returnPath = safeReturnPath(requestUrl.searchParams.get("returnTo"));
  let locale: "zh" | "en" = requestUrl.searchParams.get("lang") === "zh" ? "zh" : "en";
  let linkUserId: string | null = null;
  if (intent === "login" && locale !== "en") {
    throw new GoogleAuthenticationError("provider_not_allowed", { returnPath, locale });
  }
  if (intent === "link") {
    const current = await getSessionUser(cookieToken(request));
    if (!current) throw new GoogleAuthenticationError("link_session_required", { returnPath, locale });
    if (current.accountLocale !== "en") throw new GoogleAuthenticationError("provider_not_allowed", { returnPath, locale });
    linkUserId = current.id;
    locale = current.accountLocale;
    returnPath = "/console?view=profile";
  }
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const now = epochSeconds();
  const db = authDatabase();
  await db.batch([
    db.prepare("DELETE FROM auth_oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(now - 60 * 60),
    db.prepare(
      "INSERT INTO auth_oauth_states (state_hash, provider, locale, code_verifier, nonce, redirect_uri, return_path, intent, link_user_id, expires_at, consumed_at, created_at) VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
    ).bind(await sha256Hex(state), locale, codeVerifier, nonce, redirectUri, returnPath, intent, linkUserId, now + GOOGLE_STATE_TTL_SECONDS, now),
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
    returnPath,
    stateCookie: `${GOOGLE_STATE_COOKIE}=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${GOOGLE_STATE_TTL_SECONDS}${isSecureOrigin(request) ? "; Secure" : ""}`,
  };
}

export async function finishGoogleAuthorization(request: Request): Promise<{ user: AuthenticatedUser; session?: string; returnPath: string; linked?: "google" }> {
  await ensureAuthSchema();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = cookieValue(request, GOOGLE_STATE_COOKIE);
  if (!state || !cookieState || !timingSafeStringEqual(state, cookieState)) {
    throw new GoogleAuthenticationError("invalid_state");
  }

  const now = epochSeconds();
  const stateResult = await authDatabase().prepare(`
    UPDATE auth_oauth_states
    SET consumed_at = ?
    WHERE state_hash = ? AND provider = 'google' AND consumed_at IS NULL AND expires_at > ?
    RETURNING code_verifier, nonce, redirect_uri, return_path, locale, intent, link_user_id
  `).bind(now, await sha256Hex(state), now).run();
  const stored = stateResult.results[0] as { code_verifier?: string; nonce?: string; redirect_uri?: string; return_path?: string; locale?: string; intent?: string; link_user_id?: string } | undefined;
  if (!stored?.code_verifier || !stored.nonce || !stored.redirect_uri) {
    throw new GoogleAuthenticationError("expired_state");
  }
  const context = { returnPath: stored.return_path, locale: stored.locale };
  const providerError = url.searchParams.get("error");
  if (providerError) {
    throw new GoogleAuthenticationError(providerError === "access_denied" ? "google_cancelled" : "google_failed", context);
  }
  if (!code) throw new GoogleAuthenticationError("google_failed", context);

  const { clientId, clientSecret, allowedHostedDomain } = await googleConfiguration();
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
  const verifiedEmail = payload.email.toLowerCase();
  if (stored.intent === "link") {
    const current = await getSessionUser(cookieToken(request));
    if (!current || current.id !== stored.link_user_id) throw new GoogleAuthenticationError("link_session_required", context);
    if (current.accountLocale !== "en") throw new GoogleAuthenticationError("provider_not_allowed", context);
    try { await linkExternalIdentity(current, "google", payload.sub, verifiedEmail); }
    catch (error) {
      if (error instanceof ExternalIdentityConflictError) throw new GoogleAuthenticationError("identity_already_linked", context);
      throw error;
    }
    return { user: current, returnPath: safeReturnPath(stored.return_path), linked: "google" };
  }
  let user: AuthenticatedUser | null;
  try {
    user = await loginOrCreateExternalUser("google", payload.sub, [verifiedEmail], stored.locale === "zh" ? "zh" : "en");
  } catch (error) {
    if (error instanceof ExternalIdentityPolicyError) throw new GoogleAuthenticationError("provider_not_allowed", context);
    if (error instanceof ExternalIdentityConflictError) throw new GoogleAuthenticationError("identity_already_linked", context);
    throw error;
  }
  if (!user) throw new GoogleAuthenticationError("invalid_identity", context);
  return { user, session: await createSession(user), returnPath: safeReturnPath(stored.return_path) };
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
