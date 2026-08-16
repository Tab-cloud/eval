import { cookieToken, getSessionUser } from "../../../../auth/core";
import { revokeAgentCommunityDevice, updateAgentCommunityDevice } from "../../../../community/policy-store";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  const { id } = await context.params;
  const result = await updateAgentCommunityDevice(user, id, input);
  return result ? Response.json(result, { headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "设备会话不存在。" }, { status: 404 });
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  const { id } = await context.params;
  return await revokeAgentCommunityDevice(user, id)
    ? new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } })
    : Response.json({ error: "设备会话不存在。" }, { status: 404 });
}
