import { bearerToken, getDesktopSessionUser } from "../../../../auth/desktop";

export async function GET(request: Request) {
  const user = await getDesktopSessionUser(bearerToken(request));
  if (!user) return Response.json({ error: "桌面账号登录已失效。" }, { status: 401 });
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
