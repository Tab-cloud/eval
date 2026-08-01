import {
  authenticateEmail,
  clearFailedLogins,
  createSession,
  isLoginBlocked,
  loginAttemptKey,
  recordFailedLogin,
  sessionCookie,
} from "../../../../auth/core";
import { rejectCrossSiteWrite } from "../../../../security/request";

const ADMIN_ROLES = new Set(["tenant_admin", "platform_admin"]);

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;

  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。" }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6 || password.length > 128) {
    return invalidCredentials();
  }

  const attemptKey = await loginAttemptKey(`admin:${email}`, request);
  if (await isLoginBlocked(attemptKey)) {
    return Response.json(
      { error: "登录尝试过多，请在 15 分钟后重试。" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const user = await authenticateEmail(email, password);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    await recordFailedLogin(attemptKey);
    return invalidCredentials();
  }

  await clearFailedLogins(attemptKey);
  const token = await createSession(user);
  return Response.json(
    { user: { email: user.email, displayName: user.displayName, role: user.role } },
    { headers: { "Set-Cookie": sessionCookie(token, isSecureRequest(request)) } },
  );
}

function invalidCredentials() {
  return Response.json({ error: "管理员账号或密码错误。" }, { status: 401 });
}

function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProtocol ? forwardedProtocol === "https" : new URL(request.url).protocol === "https:";
}
