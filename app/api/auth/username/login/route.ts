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
  try { payload = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!validUsername(username) || password.length < 10 || password.length > 128) {
    return Response.json({ error: "账号或密码错误。" }, { status: 401 });
  }
  const attemptKey = await loginAttemptKey(`username:${username}`, request);
  if (await isLoginBlocked(attemptKey)) {
    return Response.json({ error: "登录尝试过多，请在 15 分钟后重试。" }, { status: 429, headers: { "Retry-After": "900" } });
  }
  const user = await authenticateUsername(username, password);
  if (!user || user.accountLocale !== "zh") {
    await recordFailedLogin(attemptKey);
    return Response.json({ error: "账号或密码错误。" }, { status: 401 });
  }
  await clearFailedLogins(attemptKey);
  const token = await createSession(user);
  return Response.json(
    { user: { username: user.username, displayName: user.displayName, role: user.role } },
    { headers: { "Set-Cookie": sessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store" } },
  );
}

function validUsername(value: string) {
  return /^[\p{L}\p{N}][\p{L}\p{N}_.-]{2,31}$/u.test(value);
}

function isSecureRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwarded ? forwarded === "https" : new URL(request.url).protocol === "https:";
}
