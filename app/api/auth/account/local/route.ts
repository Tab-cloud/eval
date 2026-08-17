import {
  AccountConflictError,
  AccountValidationError,
  bindChineseLocalIdentity,
  cookieToken,
  getSessionUser,
} from "../../../../auth/core";
import { normalizeChinesePhone } from "../../../../auth/phone";
import { verifySmsCode } from "../../../../auth/sms";
import { isValidNewUsername, NEW_USERNAME_REQUIREMENTS } from "../../../../auth/username";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  if (user.accountLocale !== "zh") return Response.json({ error: "英文账号不支持绑定手机号或密码。" }, { status: 403 });
  let payload: { username?: unknown; phone?: unknown; code?: unknown; password?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const phone = normalizeChinesePhone(payload.phone);
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!isValidNewUsername(username)) return Response.json({ error: NEW_USERNAME_REQUIREMENTS }, { status: 400 });
  if (!phone || !/^\d{6}$/.test(code)) return Response.json({ error: "手机号或验证码无效。" }, { status: 400 });
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return Response.json({ error: "密码至少 10 位，并同时包含字母与数字。" }, { status: 400 });
  }
  if (!await verifySmsCode("phone_bind", phone, code, user.id)) {
    return Response.json({ error: "验证码错误或已过期。" }, { status: 401 });
  }
  try {
    const updated = await bindChineseLocalIdentity(user, { username, phoneE164: phone, password });
    return Response.json({ ok: true, user: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccountValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AccountConflictError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
