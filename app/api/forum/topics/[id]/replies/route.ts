import { cookieToken, getSessionUser } from "../../../../../auth/core";
import { createForumReply } from "../../../../../content/store";
import { rejectCrossSiteWrite } from "../../../../../security/request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "请先登录后再参与讨论。" }, { status: 401 });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  try {
    const { id } = await context.params;
    const result = await createForumReply(user, id, input);
    return Response.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "回复失败。";
    const status = message.includes("每小时") ? 429 : message.includes("不存在") ? 404 : message.includes("锁定") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
