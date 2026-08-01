import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, SESSION_COOKIE } from "./core";

export async function requireEmailSession() {
  const cookieStore = await cookies();
  const user = await getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminSession() {
  const cookieStore = await cookies();
  const user = await getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/admin/auth/login");
  if (user.role !== "tenant_admin" && user.role !== "platform_admin") redirect("/console");
  return user;
}
