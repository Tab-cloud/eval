import { changePassword, cookieToken, getSessionUser } from "../../../auth/core";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  let payload: { currentPassword?: unknown; nextPassword?: unknown };
  try { payload = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const nextPassword = typeof payload.nextPassword === "string" ? payload.nextPassword : "";
  if (nextPassword.length < 10 || nextPassword.length > 128 || !/[a-zA-Z]/.test(nextPassword) || !/\d/.test(nextPassword)) {
    return Response.json({ error: "新密码至少 10 位，并同时包含字母与数字。" }, { status: 400 });
  }
  if (!await changePassword(user, currentPassword, nextPassword)) {
    return Response.json({ error: "当前密码错误。" }, { status: 401 });
  }
  return Response.json({ ok: true, signedOut: true });
}
