import type { Metadata } from "next";
import { requireUserSession } from "../auth/server";
import { Dashboard } from "../ui/Dashboard";
import "./style.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "用户控制台",
  description: "Eval Agent 下载、论坛、博客与账号控制台。",
};

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ view?: string; linked?: string; merged?: string; error?: string }> }) {
  const currentUser = await requireUserSession();
  const query = await searchParams;
  const initialView = query.view && ["overview", "downloads", "activity", "community", "profile"].includes(query.view) ? query.view : "overview";
  const linked = query.linked === "google" || query.linked === "github" ? query.linked : null;
  const merged = query.merged === "github" ? query.merged : null;
  const errorNotice = query.error === "account_merge_conflict"
    ? currentUser.accountLocale === "zh" ? "两个账号存在登录身份冲突，无法自动合并，请联系管理员处理" : "These accounts contain conflicting sign-in identities and cannot be merged automatically"
    : query.error === "link_session_required"
      ? currentUser.accountLocale === "zh" ? "登录会话已失效，请重新登录后再绑定" : "Your session expired. Sign in again before linking"
      : currentUser.accountLocale === "zh" ? "账号绑定失败，请重试" : "Account linking failed. Please try again.";
  const initialNotice = merged
    ? currentUser.accountLocale === "zh" ? "GitHub 原账号已安全合并到当前账号" : "The previous GitHub account was securely merged into this account"
    : linked
    ? currentUser.accountLocale === "zh" ? `${linked === "github" ? "GitHub" : "Google"} 账号已绑定` : `${linked === "github" ? "GitHub" : "Google"} account linked`
    : query.error
      ? errorNotice
      : "";
  return <Dashboard currentUser={currentUser} initialView={initialView} initialNotice={initialNotice}/>;
}
