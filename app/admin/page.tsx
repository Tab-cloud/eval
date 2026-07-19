import type { Metadata } from "next";
import { requireAdminSession } from "../auth/server";
import { AdminConsole } from "./AdminConsole";
import "./style.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "管理员控制室", description: "Eval Agent 用户、模型、发布与商业配置中心。" };

export default async function AdminPage() {
  const currentUser = await requireAdminSession();
  return <AdminConsole currentUser={currentUser}/>;
}
