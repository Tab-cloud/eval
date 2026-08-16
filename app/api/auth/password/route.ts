import { AccountConflictError, cookieToken, createSession, getSessionUser, replacePassword, sessionCookie } from "../../../auth/core";
import { verifySmsCode } from "../../../auth/sms";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  let payload: { code?: unknown; nextPassword?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  const nextPassword = typeof payload.nextPassword === "string" ? payload.nextPassword : "";
  if (nextPassword.length < 10 || nextPassword.length > 128 || !/[a-zA-Z]/.test(nextPassword) || !/\d/.test(nextPassword)) {
    return Response.json({ error: "新密码至少 10 位，并同时包含字母与数字。" }, { status: 400 });
  }
  if (user.accountLocale !== "zh" || !user.phoneE164) {
    return Response.json({ error: "当前账号尚未绑定中国大陆手机号。" }, { status: 403 });
  }
  if (!/^\d{6}$/.test(code) || !await verifySmsCode("password_change", user.phoneE164, code, user.tenantId, user.id)) {
    return Response.json({ error: "验证码错误或已过期。" }, { status: 401 });
  }
  try {
    await replacePassword(user, nextPassword);
    const token = await createSession(user);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AccountConflictError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

function isSecureRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwarded ? forwarded === "https" : new URL(request.url).protocol === "https:";
}
