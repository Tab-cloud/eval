import {
  authDatabase,
  cookieToken,
  createSession,
  ensureAuthSchema,
  ExternalIdentityConflictError,
  getSessionUser,
  linkExternalIdentity,
  loginOrCreateExternalUser,
  sessionCookie,
  type AuthenticatedUser,
} from "./core";
import { environmentValue, identityProviderSettings } from "./provider-settings";
import { safeReturnPath } from "./return-path";

const GITHUB_STATE_COOKIE = "eval_github_state";
const GITHUB_STATE_TTL_SECONDS = 10 * 60;
const GITHUB_API_VERSION = "2026-03-10";

type LoginLocale = "zh" | "en";

type StoredAuthorization = {
  code_verifier?: string;
  redirect_uri?: string;
  return_path?: string;
  locale?: string;
  intent?: string;
  link_user_id?: string;
};

type GitHubTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
};

type GitHubProfile = {
  id?: number | string;
  login?: string;
};

type GitHubEmail = {
  email?: string;
  verified?: boolean;
  primary?: boolean;
};

export class GitHubConfigurationError extends Error {}

export class GitHubAuthenticationError extends Error {
  readonly reason: string;
  readonly returnPath: string;
  readonly locale: LoginLocale;

  constructor(reason: string, context?: { returnPath?: string; locale?: string }) {
    super(reason);
    this.reason = reason;
    this.returnPath = safeReturnPath(context?.returnPath);
    this.locale = context?.locale === "zh" ? "zh" : "en";
  }
}

export async function beginGitHubAuthorization(request: Request) {
  await ensureAuthSchema();
  const { clientId } = await githubConfiguration();
  const redirectUri = `${applicationOrigin(request)}/api/auth/github/callback`;
  const requestUrl = new URL(request.url);
  const intent = requestUrl.searchParams.get("intent") === "link" ? "link" : "login";
  let returnPath = safeReturnPath(requestUrl.searchParams.get("returnTo"));
  let locale: LoginLocale = requestUrl.searchParams.get("lang") === "zh" ? "zh" : "en";
  let linkUserId: string | null = null;
  if (intent === "link") {
    const current = await getSessionUser(cookieToken(request));
    if (!current) throw new GitHubAuthenticationError("link_session_required", { returnPath, locale });
    linkUserId = current.id;
    locale = current.accountLocale;
    returnPath = "/console?view=profile";
  }
  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const now = epochSeconds();
  const db = authDatabase();
  await db.batch([
    db.prepare("DELETE FROM auth_oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(now - 60 * 60),
    db.prepare(`
      INSERT INTO auth_oauth_states (
        state_hash, provider, locale, code_verifier, nonce, redirect_uri,
        return_path, intent, link_user_id, expires_at, consumed_at, created_at
      ) VALUES (?, 'github', ?, ?, '', ?, ?, ?, ?, ?, NULL, ?)
    `).bind(await sha256Hex(state), locale, codeVerifier, redirectUri, returnPath, intent, linkUserId, now + GITHUB_STATE_TTL_SECONDS, now),
  ]);

  const authorization = new URL("https://github.com/login/oauth/authorize");
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "user:email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    allow_signup: "false",
  }).toString();
  return {
    authorizationUrl: authorization.toString(),
    stateCookie: `${GITHUB_STATE_COOKIE}=${state}; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=${GITHUB_STATE_TTL_SECONDS}${isSecureOrigin(request) ? "; Secure" : ""}`,
  };
}

export async function finishGitHubAuthorization(request: Request): Promise<{
  user: AuthenticatedUser;
  session?: string;
  returnPath: string;
  linked?: "github";
}> {
  await ensureAuthSchema();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = cookieValue(request, GITHUB_STATE_COOKIE);
  if (!state || !cookieState || !timingSafeStringEqual(state, cookieState)) {
    throw new GitHubAuthenticationError("invalid_state");
  }

  const now = epochSeconds();
  const stateResult = await authDatabase().prepare(`
    UPDATE auth_oauth_states
    SET consumed_at = ?
    WHERE state_hash = ? AND provider = 'github' AND consumed_at IS NULL AND expires_at > ?
    RETURNING code_verifier, redirect_uri, return_path, locale, intent, link_user_id
  `).bind(now, await sha256Hex(state), now).run();
  const stored = stateResult.results[0] as StoredAuthorization | undefined;
  if (!stored?.code_verifier || !stored.redirect_uri) {
    throw new GitHubAuthenticationError("expired_state");
  }
  const context = { returnPath: stored.return_path, locale: stored.locale };
  const providerError = url.searchParams.get("error");
  if (providerError) {
    throw new GitHubAuthenticationError(providerError === "access_denied" ? "github_cancelled" : "github_failed", context);
  }
  if (!code) throw new GitHubAuthenticationError("github_failed", context);

  let configuration: Awaited<ReturnType<typeof githubConfiguration>>;
  try {
    configuration = await githubConfiguration();
  } catch {
    throw new GitHubAuthenticationError("github_not_configured", context);
  }
  const { clientId, clientSecret } = configuration;
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: stored.redirect_uri,
        code_verifier: stored.code_verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GitHubAuthenticationError("github_unavailable", context);
  }
  const tokenPayload = await tokenResponse.json().catch(() => ({})) as GitHubTokenResponse;
  if (!tokenResponse.ok || tokenPayload.error || !tokenPayload.access_token) {
    throw new GitHubAuthenticationError("token_exchange_failed", context);
  }

  let profile: GitHubProfile;
  let emails: GitHubEmail[];
  try {
    [profile, emails] = await Promise.all([
      githubApi<GitHubProfile>("https://api.github.com/user", tokenPayload.access_token),
      githubApi<GitHubEmail[]>("https://api.github.com/user/emails?per_page=100", tokenPayload.access_token),
    ]);
  } catch {
    throw new GitHubAuthenticationError("github_identity_unavailable", context);
  }
  if ((typeof profile.id !== "number" && typeof profile.id !== "string") || !Array.isArray(emails)) {
    throw new GitHubAuthenticationError("invalid_identity", context);
  }
  const verifiedEmails = emails
    .filter(item => item.verified === true && typeof item.email === "string")
    .sort((left, right) => Number(right.primary === true) - Number(left.primary === true))
    .map(item => item.email!.trim().toLowerCase())
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (!verifiedEmails.length) {
    throw new GitHubAuthenticationError("verified_email_required", context);
  }
  if (stored.intent === "link") {
    const current = await getSessionUser(cookieToken(request));
    if (!current || current.id !== stored.link_user_id) throw new GitHubAuthenticationError("link_session_required", context);
    try { await linkExternalIdentity(current, "github", String(profile.id), verifiedEmails[0]); }
    catch (error) {
      if (error instanceof ExternalIdentityConflictError) throw new GitHubAuthenticationError("identity_already_linked", context);
      throw error;
    }
    return { user: current, returnPath: safeReturnPath(stored.return_path), linked: "github" };
  }
  const user = await loginOrCreateExternalUser("github", String(profile.id), verifiedEmails, stored.locale === "zh" ? "zh" : "en");
  if (!user) throw new GitHubAuthenticationError("invalid_identity", context);
  return {
    user,
    session: await createSession(user),
    returnPath: safeReturnPath(stored.return_path),
  };
}

export function githubSessionCookie(token: string, request: Request) {
  return sessionCookie(token, isSecureOrigin(request));
}

export function clearGitHubStateCookie(request: Request) {
  return `${GITHUB_STATE_COOKIE}=; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=0${isSecureOrigin(request) ? "; Secure" : ""}`;
}

async function githubConfiguration() {
  const settings = await identityProviderSettings();
  if (!settings.githubEnabled) throw new GitHubConfigurationError("GitHub 登录已停用。");
  try {
    return {
      clientId: environmentValue(settings.githubClientIdRef),
      clientSecret: environmentValue(settings.githubClientSecretRef),
    };
  } catch (error) {
    throw new GitHubConfigurationError(error instanceof Error ? error.message : "GitHub OAuth 尚未配置。");
  }
}

async function githubApi<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "eval-agent-web",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("GitHub identity request failed.");
  return response.json() as Promise<T>;
}

function applicationOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN?.trim();
  const origin = configured ? new URL(configured).origin : new URL(request.url).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new GitHubConfigurationError("生产环境 APP_ORIGIN 必须使用 HTTPS。");
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
  return Buffer.from(crypto.getRandomValues(new Uint8Array(length))).toString("base64url");
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
  return Buffer.from(new Uint8Array(digest)).toString("base64url");
}

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}
