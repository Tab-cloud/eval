import { cookieToken, getSessionUser } from "../../../auth/core";
import { createApiKey } from "../../../console/store";
import { rejectCrossSiteWrite } from "../../../security/request";

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "请求格式无效。" }, { status: 400 }); }
  try {
    return Response.json({ key: await createApiKey(user, input) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "创建密钥失败。" }, { status: 400 });
  }
}
