import { authenticateEmail, createSession, sessionCookie } from "../../../auth/core";

export async function POST(request: Request) {
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
  const user = await authenticateEmail(email, password);
  if (!user) return Response.json({ error: "邮箱或密码错误。" }, { status: 401 });
  const token = await createSession(user);
  return Response.json(
    { user: { email: user.email, displayName: user.displayName, role: user.role } },
    { headers: { "Set-Cookie": sessionCookie(token, new URL(request.url).protocol === "https:") } },
  );
}
