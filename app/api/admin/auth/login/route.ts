import {
  authenticateUsername,
  clearFailedLogins,
  createSession,
  isLoginBlocked,
  loginAttemptKey,
  recordFailedLogin,
  sessionCookie,
} from "../../../../auth/core";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;

  let payload: { username?: unknown; password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。" }, { status: 400 });
  }

  const username = typeof payload.username === "string" ? payload.username.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || password.length < 6 || password.length > 128) {
    return invalidCredentials();
  }

  const attemptKey = await loginAttemptKey(`admin:${username}`, request);
  if (await isLoginBlocked(attemptKey)) {
    return Response.json(
      { error: "登录尝试过多，请在 15 分钟后重试。" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const user = await authenticateUsername(username, password);
  if (!user || user.role !== "admin") {
    await recordFailedLogin(attemptKey);
    return invalidCredentials();
  }

  await clearFailedLogins(attemptKey);
  const token = await createSession(user);
  return Response.json(
    { user: { username: user.username, displayName: user.displayName, role: user.role } },
    { headers: { "Set-Cookie": sessionCookie(token, isSecureRequest(request)) } },
  );
}

function invalidCredentials() {
  return Response.json({ error: "管理员用户名或密码错误。" }, { status: 401 });
}

function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProtocol ? forwardedProtocol === "https" : new URL(request.url).protocol === "https:";
}
