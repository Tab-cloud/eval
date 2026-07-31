import { normalizeChinesePhone } from "../../../../auth/phone";
import {
  requestSmsLoginCode,
  SmsConfigurationError,
  SmsDeliveryError,
  SmsRateLimitError,
} from "../../../../auth/sms";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  let payload: { phone?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式无效。" }, { status: 400 });
  }
  const phone = normalizeChinesePhone(payload.phone);
  if (!phone) {
    return Response.json({ error: "请输入有效的中国大陆手机号。" }, { status: 400 });
  }
  try {
    const result = await requestSmsLoginCode(phone, request);
    return Response.json({
      ...result,
      message: "如果该手机号已绑定账号，验证码将发送至手机。",
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
