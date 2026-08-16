import { accountIdentitySnapshot, cookieToken, getSessionUser } from "../../../auth/core";

export async function GET(request: Request) {
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  return Response.json(await accountIdentitySnapshot(user), { headers: { "Cache-Control": "private, no-store" } });
}
