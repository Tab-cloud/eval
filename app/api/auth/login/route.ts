import { authenticateEmail, clearFailedLogins, createSession, isLoginBlocked, loginAttemptKey, recordFailedLogin, sessionCookie } from "../../../auth/core";
import { rejectCrossSiteWrite } from "../../../security/request";

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
    return Response.json({ error: "邮箱或密码错误。" }, { status: 401 });
  }
  const attemptKey = await loginAttemptKey(email, request);
  if (await isLoginBlocked(attemptKey)) {
    return Response.json({ error: "登录尝试过多，请在 15 分钟后重试。" }, { status: 429, headers: { "Retry-After": "900" } });
  }
  const user = await authenticateEmail(email, password);
  if (!user) {
    await recordFailedLogin(attemptKey);
    return Response.json({ error: "邮箱或密码错误。" }, { status: 401 });
  }
  await clearFailedLogins(attemptKey);
  const token = await createSession(user);
  return Response.json(
    { user: { email: user.email, displayName: user.displayName, role: user.role } },
    { headers: { "Set-Cookie": sessionCookie(token, new URL(request.url).protocol === "https:") } },
  );
}
