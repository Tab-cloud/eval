import { cookieToken, getSessionUser } from "../../../../auth/core";
import { revokeApiKey } from "../../../../console/store";
import { rejectCrossSiteWrite } from "../../../../security/request";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  try {
    const { id } = await context.params;
    await revokeApiKey(user, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "撤销密钥失败。" }, { status: 400 });
  }
}
