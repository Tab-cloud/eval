import type { Metadata } from "next";
import { requireUserSession } from "../auth/server";
import { Dashboard } from "../ui/Dashboard";
import "./style.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "用户控制台",
  description: "Eval Agent 下载、论坛、博客与账号控制台。",
};

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ view?: string; linked?: string; error?: string }> }) {
  const currentUser = await requireUserSession();
  const query = await searchParams;
  const initialView = query.view && ["overview", "downloads", "activity", "community", "profile"].includes(query.view) ? query.view : "overview";
  const linked = query.linked === "google" || query.linked === "github" ? query.linked : null;
  const initialNotice = linked
    ? currentUser.accountLocale === "zh" ? `${linked === "github" ? "GitHub" : "Google"} 账号已绑定` : `${linked === "github" ? "GitHub" : "Google"} account linked`
    : query.error
      ? currentUser.accountLocale === "zh" ? "账号绑定失败，请重试" : "Account linking failed. Please try again."
      : "";
  return <Dashboard currentUser={currentUser} initialView={initialView} initialNotice={initialNotice}/>;
}
