import { cookieToken, getSessionUser } from "../../../auth/core";
import { createForumTopic } from "../../../content/store";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "请先登录后再发布主题。" }, { status: 401 });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  try {
    const result = await createForumTopic(user, input);
    return Response.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "发布主题失败。";
    return Response.json({ error: message }, { status: message.includes("每小时") ? 429 : 400 });
  }
}
