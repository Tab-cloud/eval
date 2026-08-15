import type { Metadata } from "next";
import { requireEmailSession } from "../auth/server";
import { Dashboard } from "../ui/Dashboard";
import "./style.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "用户控制台",
  description: "Eval Agent 下载、社区、组织与账号控制台。",
};

export default async function ConsolePage() {
  const currentUser = await requireEmailSession();
  return <Dashboard currentUser={currentUser}/>;
}
