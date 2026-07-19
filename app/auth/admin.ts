import { cookieToken, getSessionUser } from "./core";

export async function requireAdminRequest(request: Request) {
  const user = await getSessionUser(cookieToken(request));
  if (!user) return Response.json({ error: "未登录。" }, { status: 401 });
  if (user.role !== "tenant_admin" && user.role !== "platform_admin") return Response.json({ error: "需要管理员权限。" }, { status: 403 });
  return user;
}

export function isAdminError(value: Awaited<ReturnType<typeof requireAdminRequest>>): value is Response {
  return value instanceof Response;
}
