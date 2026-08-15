"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useTheme } from "./useTheme";

type DashboardUser = {
  email: string;
  displayName: string;
  tenantName: string;
  role: "platform_admin" | "tenant_admin" | "developer" | "auditor" | "viewer";
};

type ConsoleSnapshot = {
  generatedAt: number;
  metrics: {
    activeMembers: number;
    totalMembers: number;
    publishedReleases: number;
    forumTopics: number;
    forumReplies: number;
    publishedPosts: number;
    activeDesktopSessions: number;
  };
  releases: Array<{ id: string; version: string; channel: string; status: string; publishedAt: number | null; fileName: string; format: string; sizeBytes: number }>;
  forumTopics: Array<{ id: string; title: string; slug: string; category: string; status: string; pinned: boolean; lastActivityAt: number; authorName: string; replyCount: number }>;
  blogPosts: Array<{ id: string; title: string; slug: string; excerpt: string; publishedAt: number | null; authorName: string }>;
  audits: Array<{ id: string; action: string; resourceType: string; resourceId: string | null; createdAt: number }>;
};

const nav: Array<{ id: string; label: string; icon: IconName }> = [
  { id: "overview", label: "总览", icon: "grid" },
  { id: "downloads", label: "下载", icon: "download" },
  { id: "community", label: "社区", icon: "users" },
  { id: "organization", label: "组织", icon: "shield" },
  { id: "activity", label: "活动", icon: "clock" },
];

export function Dashboard({ currentUser }: { currentUser: DashboardUser }) {
  const [active, setActive] = useState("overview");
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/console/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setSnapshot(await response.json());
    } catch {
      setToast("控制台数据同步失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const logout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      location.href = "/login";
    } catch {
      setToast("退出失败，请稍后重试");
      setLogoutLoading(false);
    }
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordSaving) return;
    setPasswordSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("currentPassword"), nextPassword: form.get("nextPassword") }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "密码修改失败。");
      location.href = "/login";
    } catch (error) {
      setToast(error instanceof Error ? error.message : "密码修改失败。");
      setPasswordSaving(false);
    }
  };

  const roleLabel = currentUser.role === "platform_admin" ? "平台管理员" : currentUser.role === "tenant_admin" ? "租户管理员" : currentUser.role === "developer" ? "开发者" : currentUser.role === "auditor" ? "审计员" : "查看者";
  const isAdmin = currentUser.role === "tenant_admin" || currentUser.role === "platform_admin";

  return <div className="workspace-shell">
    <header className="workspace-header">
      <button className="workspace-brand" onClick={() => setActive("overview")} aria-label="返回总览">
        <Image src="/favicon.svg" width={28} height={28} alt=""/><span><b>Eval Agent</b><small>Workspace</small></span>
      </button>
      <nav aria-label="主要导航">{nav.map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><Icon name={item.icon}/>{item.label}</button>)}</nav>
      <div className="workspace-actions">
        <Link href="/docs">使用指南</Link>
        <button className="workspace-icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}><Icon name={theme === "dark" ? "sun" : "moon"}/></button>
        <button className="workspace-avatar" onClick={() => setAccountOpen(value => !value)} aria-expanded={accountOpen}>{currentUser.displayName.slice(0, 2).toUpperCase()}</button>
        {accountOpen && <div className="workspace-account">
          <strong>{currentUser.displayName}</strong><span>{currentUser.email}</span><small>{currentUser.tenantName} · {roleLabel}</small>
          {isAdmin && <Link href="/admin"><Icon name="shield"/>管理员平台</Link>}
          <button onClick={() => { setAccountOpen(false); setPasswordOpen(true); }}><Icon name="key"/>修改密码</button>
          <button onClick={() => void logout()} disabled={logoutLoading}><Icon name="logout"/>{logoutLoading ? "正在退出…" : "退出登录"}</button>
        </div>}
      </div>
    </header>

    <main className="workspace-main">
      <div className="workspace-title"><div><small>EVAL / PRODUCT WORKSPACE</small><h1>{active === "overview" ? `欢迎回来，${currentUser.displayName}` : nav.find(item => item.id === active)?.label}</h1></div><span><i/>{loading ? "正在同步" : snapshot ? `更新于 ${formatTime(snapshot.generatedAt)}` : "等待数据"}</span></div>
      {active === "overview" && <Overview snapshot={snapshot}/>}
      {active === "downloads" && <Downloads snapshot={snapshot}/>}
      {active === "community" && <Community snapshot={snapshot}/>}
      {active === "organization" && <Organization snapshot={snapshot} user={currentUser} roleLabel={roleLabel}/>}
      {active === "activity" && <Activity snapshot={snapshot}/>}
    </main>

    <nav className="workspace-mobile-nav" aria-label="移动端导航">{nav.map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>

    {passwordOpen && <div className="workspace-overlay" onMouseDown={event => event.currentTarget === event.target && setPasswordOpen(false)}><div className="workspace-modal"><button className="workspace-modal-close" onClick={() => setPasswordOpen(false)} aria-label="关闭">×</button><small>ACCOUNT SECURITY</small><h2>修改登录密码</h2><p>修改成功后会撤销已登录会话，需要使用新密码重新登录。</p><form onSubmit={event => void updatePassword(event)}><label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label>新密码<input name="nextPassword" type="password" autoComplete="new-password" minLength={10} required placeholder="至少 10 位，包含字母与数字"/></label><button disabled={passwordSaving}>{passwordSaving ? "正在更新…" : "更新密码并退出"}<Icon name="arrow"/></button></form></div></div>}
    {toast && <div className="workspace-toast"><Icon name="check"/>{toast}</div>}
  </div>;
}

function Overview({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  const metrics = snapshot?.metrics;
  const latest = snapshot?.releases.find(item => item.status === "published");
  return <>
    <section className="workspace-hero">
      <div><small>AGENT PRODUCT HOME</small><h2>工具、版本与工程社区，<br/>都在这里。</h2><p>获取 Eval Agent 桌面端，关注发布动态，并与团队成员沉淀工程经验。</p><div><button onClick={() => location.href = latest ? `/api/v1/downloads/${latest.id}` : "/docs"}><Icon name="download"/>{latest ? `下载 v${latest.version}` : "查看安装指南"}</button><Link href="/forum">进入论坛<Icon name="arrow"/></Link><Link href="/blog">阅读博客<Icon name="arrow"/></Link></div></div>
      <aside><span>PRODUCT STATUS</span><strong>{latest ? `v${latest.version}` : "—"}</strong><small>{latest ? `${latest.channel.toUpperCase()} · 已发布` : "等待首个公开版本"}</small><i/></aside>
    </section>
    <section className="workspace-metrics">
      <Metric icon="download" value={metrics?.publishedReleases ?? 0} label="已发布版本"/>
      <Metric icon="users" value={(metrics?.forumTopics ?? 0) + (metrics?.forumReplies ?? 0)} label="社区讨论"/>
      <Metric icon="spark" value={metrics?.publishedPosts ?? 0} label="博客文章"/>
      <Metric icon="terminal" value={metrics?.activeDesktopSessions ?? 0} label="我的活动设备"/>
    </section>
    <section className="workspace-columns">
      <article className="workspace-panel"><PanelHead eyebrow="LATEST RELEASES" title="最新版本" href="/docs" link="安装指南"/><ReleaseList releases={snapshot?.releases.slice(0, 4) ?? []}/></article>
      <article className="workspace-panel"><PanelHead eyebrow="COMMUNITY" title="最近讨论" href="/forum" link="查看论坛"/><TopicList topics={snapshot?.forumTopics.slice(0, 5) ?? []}/></article>
    </section>
  </>;
}

function Downloads({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  return <section className="workspace-page"><div className="workspace-page-hero"><small>RELEASE CENTER</small><h2>获取已验证的桌面端版本。</h2><p>这里只展示管理员上传并正式发布的 Eval Agent 安装包。安装前可以核对版本、渠道和文件格式。</p></div><div className="workspace-panel"><PanelHead eyebrow="AVAILABLE BUILDS" title="版本目录" href="/docs" link="查看安装说明"/><ReleaseList releases={snapshot?.releases ?? []} detailed/></div></section>;
}

function Community({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  return <section className="workspace-page"><div className="workspace-page-hero"><small>KNOWLEDGE & DISCUSSION</small><h2>讨论工程问题，沉淀团队经验。</h2><p>论坛用于交流与协作，博客用于发布经过整理的产品和技术内容。</p><div className="workspace-page-actions"><Link href="/forum">进入论坛<Icon name="arrow"/></Link><Link href="/blog">阅读博客<Icon name="arrow"/></Link></div></div><div className="workspace-columns"><article className="workspace-panel"><PanelHead eyebrow="FORUM" title="活跃主题" href="/forum" link="全部主题"/><TopicList topics={snapshot?.forumTopics ?? []}/></article><article className="workspace-panel"><PanelHead eyebrow="BLOG" title="最新文章" href="/blog" link="全部文章"/><BlogList posts={snapshot?.blogPosts ?? []}/></article></div></section>;
}

function Organization({ snapshot, user, roleLabel }: { snapshot: ConsoleSnapshot | null; user: DashboardUser; roleLabel: string }) {
  return <section className="workspace-page"><div className="workspace-page-hero"><small>ORGANIZATION</small><h2>账号归属与协作边界。</h2><p>组织身份由服务端会话确认，成员和内容始终限定在当前组织内。</p></div><div className="workspace-profile-grid"><article><span className="workspace-profile-avatar">{user.displayName.slice(0,2).toUpperCase()}</span><small>CURRENT ACCOUNT</small><h3>{user.displayName}</h3><p>{user.email}</p><b>{roleLabel}</b></article><article><Icon name="users"/><small>CURRENT ORGANIZATION</small><h3>{user.tenantName}</h3><p>{snapshot?.metrics.activeMembers ?? 0} 名活动成员 / {snapshot?.metrics.totalMembers ?? 0} 名成员</p><b>服务端租户隔离</b></article><article><Icon name="terminal"/><small>DESKTOP SESSIONS</small><h3>{snapshot?.metrics.activeDesktopSessions ?? 0}</h3><p>当前账号仍有效的桌面端设备会话</p><b>可撤销授权</b></article></div></section>;
}

function Activity({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  return <section className="workspace-page"><div className="workspace-page-hero"><small>ACCOUNT ACTIVITY</small><h2>最近操作，清晰可追踪。</h2><p>普通成员只看到自己的操作；管理员可查看当前组织的审计活动。</p></div><div className="workspace-ledger"><header><span>操作</span><span>资源</span><span>时间</span><span>标识</span></header>{snapshot?.audits.length ? snapshot.audits.map(item => <article key={item.id}><b>{auditLabel(item.action)}<small>{item.action}</small></b><span>{item.resourceType}</span><time>{formatRelative(item.createdAt)}</time><code>{item.resourceId?.slice(0, 14) || "—"}</code></article>) : <Empty text="暂无可显示的操作记录。"/>}</div></section>;
}

function Metric({ icon, value, label }: { icon: IconName; value: number; label: string }) { return <article><Icon name={icon}/><strong>{value.toLocaleString("zh-CN")}</strong><span>{label}</span></article>; }
function PanelHead({ eyebrow, title, href, link }: { eyebrow: string; title: string; href: string; link: string }) { return <header><div><small>{eyebrow}</small><h3>{title}</h3></div><Link href={href}>{link}<Icon name="arrow"/></Link></header>; }
function ReleaseList({ releases, detailed = false }: { releases: ConsoleSnapshot["releases"]; detailed?: boolean }) { return <div className="workspace-release-list">{releases.length ? releases.map(item => <article key={item.id}><span><Icon name="download"/></span><div><b>Eval Agent v{item.version}</b><small>{item.channel.toUpperCase()} · {item.format} · {item.fileName}{detailed ? ` · ${formatBytes(item.sizeBytes)}` : ""}</small></div><em className={item.status}>{item.status === "published" ? "已发布" : "草稿"}</em>{item.status === "published" ? <a href={`/api/v1/downloads/${item.id}`} aria-label={`下载 v${item.version}`}><Icon name="download"/></a> : <i/>}</article>) : <Empty text="还没有可用版本。"/>}</div>; }
function TopicList({ topics }: { topics: ConsoleSnapshot["forumTopics"] }) { return <div className="workspace-topic-list">{topics.length ? topics.map(item => <Link href={`/forum/${item.slug}`} key={item.id}><span>{item.pinned ? "置顶" : item.category}</span><div><b>{item.title}</b><small>{item.authorName} · {item.replyCount} 条回复 · {formatRelative(item.lastActivityAt)}</small></div><Icon name="chevron"/></Link>) : <Empty text="还没有论坛主题。"/>}</div>; }
function BlogList({ posts }: { posts: ConsoleSnapshot["blogPosts"] }) { return <div className="workspace-blog-list">{posts.length ? posts.map(item => <Link href={`/blog/${item.slug}`} key={item.id}><small>{item.publishedAt ? new Date(item.publishedAt * 1000).toLocaleDateString("zh-CN") : "草稿"}</small><b>{item.title}</b><p>{item.excerpt}</p><span>{item.authorName}<Icon name="arrow"/></span></Link>) : <Empty text="还没有已发布文章。"/>}</div>; }
function Empty({ text }: { text: string }) { return <div className="workspace-empty"><i/><p>{text}</p></div>; }
function formatTime(value: number) { return new Date(value * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }
function formatRelative(value: number) { const seconds = Math.max(0, Math.floor(Date.now() / 1000 - value)); if (seconds < 60) return "刚刚"; if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`; if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`; return new Date(value * 1000).toLocaleDateString("zh-CN"); }
function formatBytes(value: number) { return value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`; }
function auditLabel(value: string) { return ({ "auth.password.change": "修改密码", "desktop.auth.approve": "授权桌面端", "desktop.session.revoke": "撤销桌面端", "forum.topic.create": "发布论坛主题", "forum.reply.create": "发布论坛回复", "blog.post.create": "创建博客", "blog.post.update": "更新博客", "release.publish": "发布版本" } as Record<string, string>)[value] || "系统操作"; }
