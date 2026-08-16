import { cookieToken, getSessionUser } from "../../../auth/core";
import { saveUserAgentCommunitySettings, userSettingsSnapshot } from "../../../community/policy-store";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function GET(request: Request) {
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  return Response.json(await userSettingsSnapshot(user), { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  return Response.json(await saveUserAgentCommunitySettings(user, input), { headers: { "Cache-Control": "private, no-store" } });
}
