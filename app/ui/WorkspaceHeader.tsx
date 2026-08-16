"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "./icons";
import { useTheme } from "./useTheme";
import "./workspace-header.css";

export type WorkspaceHeaderUser = {
  username?: string;
  email?: string;
  phoneE164?: string;
  accountLocale: "zh" | "en";
  displayName: string;
  role: "admin" | "member";
};

export type WorkspaceSection = "overview" | "downloads" | "community" | "blog" | "activity" | "profile";
export type DashboardSection = Exclude<WorkspaceSection, "blog">;
type DashboardNavSection = Exclude<DashboardSection, "profile">;
type WorkspaceNavItem = { id: "blog"; label: string; icon: IconName; href: "/blog" } | { id: DashboardNavSection; label: string; icon: IconName };

export const workspaceNav: WorkspaceNavItem[] = [
  { id: "overview", label: "总览", icon: "grid" },
  { id: "downloads", label: "下载", icon: "download" },
  { id: "community", label: "社区", icon: "users" },
  { id: "blog", label: "博客", icon: "spark", href: "/blog" },
  { id: "activity", label: "活动", icon: "clock" },
];

export function isDashboardSection(value: string): value is DashboardSection {
  return value === "overview" || value === "downloads" || value === "community" || value === "activity" || value === "profile";
}

export function workspaceSectionLabel(section: WorkspaceSection) {
  return section === "profile" ? "个人中心" : workspaceNav.find(item => item.id === section)?.label;
}

type Props = {
  active: WorkspaceSection;
  currentUser: WorkspaceHeaderUser;
  onNavigate?: (section: DashboardSection) => void;
  onError?: (message: string) => void;
};

export function WorkspaceHeader({ active, currentUser, onNavigate, onError }: Props) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const { theme, toggleTheme } = useTheme();
  const roleLabel = currentUser.role === "admin" ? "管理员" : "普通用户";

  const navigate = (section: DashboardSection) => {
    setAccountOpen(false);
    onNavigate?.(section);
  };

  const logout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      location.href = "/login";
    } catch {
      const message = "退出失败，请稍后重试";
      if (onError) onError(message);
      else setLocalError(message);
      setLogoutLoading(false);
    }
  };

  const destination = (section: DashboardSection) => section === "overview" ? "/console" : `/console?view=${section}`;
  const renderDestination = (item: (typeof workspaceNav)[number], mobile = false) => {
    const contents = <><Icon name={item.icon}/>{mobile ? <span>{item.label}</span> : item.label}</>;
    const className = active === item.id ? "active" : undefined;
    if ("href" in item) return <Link key={item.id} className={className} aria-current={active === item.id ? "page" : undefined} href={item.href}>{contents}</Link>;
    if (onNavigate) return <button key={item.id} className={className} onClick={() => navigate(item.id)}>{contents}</button>;
    return <Link key={item.id} className={className} aria-current={active === item.id ? "page" : undefined} href={destination(item.id)}>{contents}</Link>;
  };

  return <>
    <header className="workspace-header">
      {onNavigate
        ? <button className="workspace-brand" onClick={() => navigate("overview")} aria-label="返回总览"><Image src="/favicon.svg" width={28} height={28} alt=""/><span><b>Eval Agent</b><small>Workspace</small></span></button>
        : <Link className="workspace-brand" href="/console" aria-label="返回用户控制台"><Image src="/favicon.svg" width={28} height={28} alt=""/><span><b>Eval Agent</b><small>Workspace</small></span></Link>}
      <nav aria-label="工作区导航">{workspaceNav.map(item => renderDestination(item))}</nav>
      <div className="workspace-actions">
        <Link href="/docs">使用指南</Link>
        <button className="workspace-icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}><Icon name={theme === "dark" ? "sun" : "moon"}/></button>
        <button className="workspace-avatar" onClick={() => setAccountOpen(value => !value)} aria-expanded={accountOpen} aria-label="打开账号菜单">{currentUser.displayName.slice(0, 2).toUpperCase()}</button>
        {accountOpen && <div className="workspace-account">
          <strong>{currentUser.displayName}</strong><span>{currentUser.email || currentUser.phoneE164 || currentUser.username || "Eval Account"}</span><small>{roleLabel}</small>
          {currentUser.role === "admin" && <Link href="/admin"><Icon name="shield"/>管理员平台</Link>}
          {onNavigate
            ? <button onClick={() => navigate("profile")}><Icon name="key"/>{currentUser.accountLocale === "zh" ? "个人中心" : "Profile"}</button>
            : <Link href="/console?view=profile"><Icon name="key"/>{currentUser.accountLocale === "zh" ? "个人中心" : "Profile"}</Link>}
          <button onClick={() => void logout()} disabled={logoutLoading}><Icon name="logout"/>{logoutLoading ? "正在退出…" : "退出登录"}</button>
        </div>}
      </div>
    </header>
    <nav className="workspace-mobile-nav" aria-label="移动端工作区导航">{workspaceNav.map(item => renderDestination(item, true))}</nav>
    {localError && <div className="workspace-header-error" role="alert"><Icon name="check"/>{localError}</div>}
  </>;
}
