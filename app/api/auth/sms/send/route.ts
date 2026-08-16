import { normalizeChinesePhone } from "../../../../auth/phone";
import {
  requestSmsCode,
  SmsConfigurationError,
  SmsDeliveryError,
  type SmsPurpose,
  SmsRateLimitError,
} from "../../../../auth/sms";
import { cookieToken, getSessionUser } from "../../../../auth/core";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  let payload: { phone?: unknown; purpose?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。" }, { status: 400 });
  }
  const purpose: SmsPurpose = payload.purpose === "register" || payload.purpose === "phone_bind" || payload.purpose === "password_change"
    ? payload.purpose
    : "login";
  const sessionUser = purpose === "phone_bind" || purpose === "password_change"
    ? await getSessionUser(cookieToken(request))
    : null;
  if ((purpose === "phone_bind" || purpose === "password_change") && !sessionUser) {
    return Response.json({ error: "未登录。" }, { status: 401 });
  }
  if (sessionUser && sessionUser.accountLocale !== "zh") {
    return Response.json({ error: "英文账号不支持短信认证。" }, { status: 403 });
  }
  const phone = purpose === "password_change"
    ? sessionUser?.phoneE164 ?? null
    : normalizeChinesePhone(payload.phone);
  if (!phone) {
    return Response.json({ error: purpose === "password_change" ? "当前账号尚未绑定手机号。" : "请输入有效的中国大陆手机号。" }, { status: 400 });
  }
  try {
    const context = sessionUser
      ? { userId: sessionUser.id }
      : undefined;
    const result = await requestSmsCode(purpose, phone, request, context);
    const messages: Record<SmsPurpose, string> = {
      login: "如果该手机号已绑定账号，验证码将发送至手机。",
      register: "如果该手机号可以注册，验证码将发送至手机。",
      phone_bind: "如果该手机号可以绑定，验证码将发送至手机。",
      password_change: "验证码已发送至当前账号绑定的手机号。",
    };
    return Response.json({
      ...result,
      message: messages[purpose],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SmsRateLimitError) {
      return Response.json(
        { error: "验证码请求过于频繁，请稍后再试。", retryAfter: error.retryAfter },
        { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof SmsConfigurationError) {
      return Response.json({ error: "短信登录服务尚未完成配置。" }, { status: 503 });
    }
    if (error instanceof SmsDeliveryError) {
      return Response.json({ error: "短信暂时发送失败，请稍后再试。" }, { status: 502 });
    }
    return Response.json({ error: "短信服务暂时不可用。" }, { status: 503 });
  }
}
