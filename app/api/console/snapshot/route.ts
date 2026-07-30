import { cookieToken, getSessionUser } from "../../../auth/core";
import { consoleSnapshot } from "../../../console/store";

export async function GET(request: Request) {
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  return Response.json(await consoleSnapshot(user), { headers: { "Cache-Control": "private, no-store" } });
}
