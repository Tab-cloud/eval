import { normalizeChinesePhone } from "../../../../auth/phone";
import { phoneAccountStatus, SmsRateLimitError } from "../../../../auth/sms";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  let payload: { phone?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  const phone = normalizeChinesePhone(payload.phone);
  if (!phone) return Response.json({ error: "请输入有效的中国大陆手机号。" }, { status: 400 });
  try {
    const status = await phoneAccountStatus(phone, request);
    return Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SmsRateLimitError) {
      return Response.json(
        { error: "账号状态查询过于频繁，请稍后再试。", retryAfter: error.retryAfter },
        { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }
}
