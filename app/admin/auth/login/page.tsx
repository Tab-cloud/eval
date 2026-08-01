import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, SESSION_COOKIE } from "../../../auth/core";
import { AdminLogin } from "./AdminLogin";
import "./style.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "管理员登录",
  description: "Eval Agent 管理控制室安全登录入口。",
};

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const user = await getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  if (user?.role === "tenant_admin" || user?.role === "platform_admin") redirect("/admin");
  return <AdminLogin/>;
}
