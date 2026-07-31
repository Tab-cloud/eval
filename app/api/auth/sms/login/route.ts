import {
  clearFailedLogins,
  createSession,
  isLoginBlocked,
  loginAttemptKey,
  recordFailedLogin,
  sessionCookie,
} from "../../../../auth/core";
import { normalizeChinesePhone } from "../../../../auth/phone";
import { authenticateSmsCode, SmsConfigurationError } from "../../../../auth/sms";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  let payload: { phone?: unknown; code?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。" }, { status: 400 });
  }
  const phone = normalizeChinesePhone(payload.phone);
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!phone || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "手机号或验证码错误。" }, { status: 401 });
  }
  const attemptKey = await loginAttemptKey(`sms:${phone}`, request);
  if (await isLoginBlocked(attemptKey)) {
    return Response.json(
      { error: "验证尝试过多，请在 15 分钟后重试。" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }
  try {
    const user = await authenticateSmsCode(phone, code);
    if (!user) {
      await recordFailedLogin(attemptKey);
      return Response.json({ error: "手机号或验证码错误。" }, { status: 401 });
    }
    await clearFailedLogins(attemptKey);
    const token = await createSession(user);
    return Response.json(
      { user: { email: user.email, displayName: user.displayName, role: user.role } },
      { headers: { "Set-Cookie": sessionCookie(token, isSecureRequest(request)) } },
    );
  } catch (error) {
    if (error instanceof SmsConfigurationError) {
      return Response.json({ error: "短信登录服务尚未完成配置。" }, { status: 503 });
    }
    throw error;
  }
}

function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProtocol ? forwardedProtocol === "https" : new URL(request.url).protocol === "https:";
}
