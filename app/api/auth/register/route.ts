import {
  AccountConflictError,
  AccountValidationError,
  createSession,
  registerChineseAccount,
  sessionCookie,
} from "../../../auth/core";
import { normalizeChinesePhone } from "../../../auth/phone";
import { SmsConfigurationError, verifySmsCode } from "../../../auth/sms";
import { isValidNewUsername, NEW_USERNAME_REQUIREMENTS } from "../../../auth/username";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  let payload: { username?: unknown; phone?: unknown; code?: unknown; password?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const phone = normalizeChinesePhone(payload.phone);
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!isValidNewUsername(username)) return Response.json({ error: NEW_USERNAME_REQUIREMENTS }, { status: 400 });
  if (!phone || !/^\d{6}$/.test(code)) return Response.json({ error: "手机号或验证码无效。" }, { status: 400 });
  if (!validPassword(password)) return Response.json({ error: "密码至少 10 位，并同时包含字母与数字。" }, { status: 400 });
  try {
    if (!await verifySmsCode("register", phone, code)) {
      return Response.json({ error: "验证码错误或已过期。" }, { status: 401 });
    }
    const user = await registerChineseAccount({ username, phoneE164: phone, password });
    if (!user) return Response.json({ error: "账号创建失败。" }, { status: 500 });
    const token = await createSession(user);
    return Response.json(
      { user: { username: user.username, displayName: user.displayName } },
      { status: 201, headers: { "Set-Cookie": sessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AccountValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AccountConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof SmsConfigurationError) return Response.json({ error: "短信认证服务尚未完成配置。" }, { status: 503 });
    throw error;
  }
}

function validPassword(value: string) { return value.length >= 10 && value.length <= 128 && /[A-Za-z]/.test(value) && /\d/.test(value); }
function isSecureRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwarded ? forwarded === "https" : new URL(request.url).protocol === "https:";
}
