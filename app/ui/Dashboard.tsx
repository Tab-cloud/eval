"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";
import { isDashboardSection, WorkspaceHeader, type DashboardSection, type WorkspaceHeaderUser, workspaceSectionLabel } from "./WorkspaceHeader";
import { CommunitySettings } from "./CommunitySettings";

type DashboardUser = WorkspaceHeaderUser;

type AccountSnapshot = {
  user: { id: string; username: string | null; email: string | null; phoneE164: string | null; displayName: string; accountLocale: "zh" | "en" };
  providers: { google: { provider: string; emailAtLink: string } | null; github: { provider: string; emailAtLink: string } | null };
  passwordConfigured: boolean;
  unlink: { github: { allowed: boolean; reason: "github_not_linked" | "last_sign_in_method" | null } };
};

type ConsoleSnapshot = {
  generatedAt: number;
  metrics: {
    publishedReleases: number;
    forumTopics: number;
    forumReplies: number;
    publishedPosts: number;
    activeDesktopSessions: number;
  };
  releases: Array<{ id: string; releaseId: string; version: string; channel: string; status: string; publishedAt: number | null; fileName: string; format: string; platform: string; architecture: string; sizeBytes: number }>;
  forumTopics: Array<{ id: string; title: string; slug: string; category: string; status: string; pinned: boolean; lastActivityAt: number; authorName: string; replyCount: number }>;
  audits: Array<{ id: string; action: string; resourceType: string; resourceId: string | null; createdAt: number }>;
};

export function Dashboard({ currentUser, initialView = "overview", initialNotice = "" }: { currentUser: DashboardUser; initialView?: string; initialNotice?: string }) {
  const [active, setActive] = useState<DashboardSection>(isDashboardSection(initialView) ? initialView : "overview");
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(initialNotice);

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

  const navigate = (section: DashboardSection) => {
    setActive(section);
    history.replaceState(null, "", section === "overview" ? "/console" : `/console?view=${section}`);
  };

  return <div className="workspace-shell">
    <WorkspaceHeader active={active} currentUser={currentUser} onNavigate={navigate} onError={setToast}/>

    <main className="workspace-main">
      <div className="workspace-title"><div><small>EVAL / PRODUCT WORKSPACE</small><h1>{active === "overview" ? `欢迎回来，${currentUser.displayName}` : active === "profile" && currentUser.accountLocale === "en" ? "Profile" : workspaceSectionLabel(active)}</h1></div><span><i/>{loading ? "正在同步" : snapshot ? `更新于 ${formatTime(snapshot.generatedAt)}` : "等待数据"}</span></div>
      {active === "overview" && <Overview snapshot={snapshot}/>}
      {active === "downloads" && <Downloads snapshot={snapshot}/>}
      {active === "activity" && <Activity snapshot={snapshot}/>}
      {active === "community" && <CommunitySettings notify={setToast}/>}
      {active === "profile" && <Profile currentUser={currentUser} notify={setToast}/>}
    </main>

    {toast && <div className="workspace-toast"><Icon name="check"/>{toast}</div>}
  </div>;
}

function Overview({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  const metrics = snapshot?.metrics;
  const latest = snapshot?.releases.find(item => item.status === "published");
  return <>
    <section className="workspace-hero">
      <div><small>AGENT PRODUCT HOME</small><h2>工具、版本与工程论坛，<br/>都在这里。</h2><p>获取 Eval Agent 桌面端，关注发布动态，并与其他用户沉淀工程经验。</p><div><button onClick={() => location.href = latest ? "/#downloads" : "/docs"}><Icon name="download"/>{latest ? `选择 v${latest.version} 安装包` : "查看安装指南"}</button><Link href="/forum">进入论坛<Icon name="arrow"/></Link><Link href="/blog">阅读博客<Icon name="arrow"/></Link></div></div>
      <aside><span>PRODUCT STATUS</span><strong>{latest ? `v${latest.version}` : "—"}</strong><small>{latest ? `${latest.channel.toUpperCase()} · 已发布` : "等待首个公开版本"}</small><i/></aside>
    </section>
    <section className="workspace-metrics">
      <Metric icon="download" value={metrics?.publishedReleases ?? 0} label="已发布版本"/>
      <Metric icon="users" value={(metrics?.forumTopics ?? 0) + (metrics?.forumReplies ?? 0)} label="论坛讨论"/>
      <Metric icon="spark" value={metrics?.publishedPosts ?? 0} label="博客文章"/>
      <Metric icon="terminal" value={metrics?.activeDesktopSessions ?? 0} label="我的活动设备"/>
    </section>
    <section className="workspace-columns">
      <article className="workspace-panel"><PanelHead eyebrow="LATEST RELEASES" title="最新版本" href="/docs" link="安装指南"/><ReleaseList releases={snapshot?.releases.slice(0, 4) ?? []}/></article>
      <article className="workspace-panel"><PanelHead eyebrow="FORUM" title="最近讨论" href="/forum" link="查看论坛"/><TopicList topics={snapshot?.forumTopics.slice(0, 5) ?? []}/></article>
    </section>
  </>;
}

function Downloads({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  return <section className="workspace-page"><div className="workspace-page-hero"><small>RELEASE CENTER</small><h2>获取已验证的桌面端版本。</h2><p>这里只展示管理员上传并正式发布的 Eval Agent 安装包。安装前可以核对版本、渠道和文件格式。</p></div><div className="workspace-panel"><PanelHead eyebrow="AVAILABLE BUILDS" title="版本目录" href="/docs" link="查看安装说明"/><ReleaseList releases={snapshot?.releases ?? []} detailed/></div></section>;
}

function Activity({ snapshot }: { snapshot: ConsoleSnapshot | null }) {
  return <section className="workspace-page"><div className="workspace-page-hero"><small>ACCOUNT ACTIVITY</small><h2>最近操作，清晰可追踪。</h2><p>普通用户只看到自己的操作；管理员可以查看全站安全与运营活动。</p></div><div className="workspace-ledger"><header><span>操作</span><span>资源</span><span>时间</span><span>标识</span></header>{snapshot?.audits.length ? snapshot.audits.map(item => <article key={item.id}><b>{auditLabel(item.action)}<small>{item.action}</small></b><span>{item.resourceType}</span><time>{formatRelative(item.createdAt)}</time><code>{item.resourceId?.slice(0, 14) || "—"}</code></article>) : <Empty text="暂无可显示的操作记录。"/>}</div></section>;
}

function Profile({ currentUser, notify }: { currentUser: DashboardUser; notify: (message: string) => void }) {
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [unlinkingGithub, setUnlinkingGithub] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const isZh = currentUser.accountLocale === "zh";

  const refreshAccount = useCallback(async () => {
    const response = await fetch("/api/auth/account", { cache: "no-store" });
    if (!response.ok) throw new Error(isZh ? "个人中心加载失败。" : "Could not load your profile.");
    setAccount(await response.json());
  }, [isZh]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/account", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<AccountSnapshot> : Promise.reject(new Error(isZh ? "个人中心加载失败。" : "Could not load your profile.")))
      .then(snapshot => { if (!cancelled) setAccount(snapshot); })
      .catch(error => { if (!cancelled) notify(error instanceof Error ? error.message : "Profile unavailable"); });
    return () => { cancelled = true; };
  }, [isZh, notify]);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const sendVerification = async (purpose: "phone_bind" | "password_change", phone?: string) => {
    if (sending || countdown > 0) return;
    setSending(true);
    try {
      const response = await fetch("/api/auth/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, phone }) });
      const payload = await response.json() as { error?: string; message?: string; retryAfter?: number };
      if (!response.ok) throw new Error(payload.error || "验证码发送失败。");
      notify(payload.message || "验证码已发送。");
      setCountdown(payload.retryAfter ?? 60);
    } catch (error) { notify(error instanceof Error ? error.message : "验证码发送失败。"); }
    finally { setSending(false); }
  };

  const bindLocal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/account/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), phone: form.get("phone"), code: form.get("code"), password: form.get("password") }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "本地账号绑定失败。");
      notify("账号、手机号和密码已绑定。");
      await refreshAccount();
    } catch (error) { notify(error instanceof Error ? error.message : "本地账号绑定失败。"); }
    finally { setSaving(false); }
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: form.get("code"), nextPassword: form.get("nextPassword") }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "密码修改失败。");
      notify("密码已更新，其他登录会话已撤销。");
      event.currentTarget.reset();
    } catch (error) { notify(error instanceof Error ? error.message : "密码修改失败。"); }
    finally { setSaving(false); }
  };

  const unlinkGithub = async () => {
    if (!account?.providers.github || !account.unlink.github.allowed || unlinkingGithub) return;
    const confirmed = window.confirm(isZh
      ? "确定解绑 GitHub 吗？解绑后将不能再使用该 GitHub 账号登录。"
      : "Unlink GitHub? You will no longer be able to sign in with this GitHub account.");
    if (!confirmed) return;
    setUnlinkingGithub(true);
    try {
      const response = await fetch("/api/auth/account/github", { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || (isZh ? "GitHub 解绑失败。" : "Could not unlink GitHub."));
      await refreshAccount();
      notify(isZh ? "GitHub 已解绑。" : "GitHub has been unlinked.");
    } catch (error) {
      notify(error instanceof Error ? error.message : isZh ? "GitHub 解绑失败。" : "Could not unlink GitHub.");
    } finally {
      setUnlinkingGithub(false);
    }
  };

  const providerHref = (provider: "google" | "github") => `/api/auth/${provider}/start?${new URLSearchParams({ lang: currentUser.accountLocale, intent: "link", returnTo: "/console?view=profile" }).toString()}`;
  if (!account) return <section className="workspace-page"><Empty text={isZh ? "正在读取账号身份…" : "Loading account identities…"}/></section>;
  const localComplete = Boolean(account.user.username && account.user.phoneE164 && account.passwordConfigured);

  return <section className="workspace-page workspace-profile-center">
    <div className="workspace-page-hero"><small>ACCOUNT IDENTITY</small><h2>{isZh ? "一个账号，连接每种登录方式。" : "One account. Two verified identities."}</h2><p>{isZh ? "手机号、账号密码和 GitHub 绑定到同一用户，任一方式登录都会进入相同的工作区与数据。" : "Link Google and GitHub to the same Eval account. Either identity will open the same workspace and data."}</p></div>
    <div className="identity-status-grid">
      {isZh && <IdentityStatus title="账号密码" value={account.user.username || "尚未绑定"} connected={Boolean(account.user.username && account.passwordConfigured)}/>}
      {isZh && <IdentityStatus title="手机验证码" value={account.user.phoneE164 ? maskPhone(account.user.phoneE164) : "尚未绑定"} connected={Boolean(account.user.phoneE164)}/>}
      {!isZh && <IdentityStatus title="Google" value={account.providers.google?.emailAtLink || "Not linked"} connected={Boolean(account.providers.google)} action={!account.providers.google ? providerHref("google") : undefined}/>}
      <IdentityStatus
        title="GitHub"
        value={account.providers.github?.emailAtLink || (isZh ? "尚未绑定" : "Not linked")}
        connected={Boolean(account.providers.github)}
        action={!account.providers.github ? providerHref("github") : undefined}
        actionLabel={isZh ? "登录 GitHub 并绑定/合并" : "Sign in to link or merge"}
        onAction={account.providers.github ? unlinkGithub : undefined}
        buttonLabel={unlinkingGithub ? (isZh ? "正在解绑…" : "Unlinking…") : (isZh ? "解绑 GitHub" : "Unlink GitHub")}
        buttonDisabled={!account.unlink.github.allowed || unlinkingGithub}
        buttonTone="danger"
        note={!account.providers.github
          ? isZh
            ? "必须通过 GitHub 官方登录认证。若该 GitHub 曾创建独立 Eval 账号，验证后会安全合并到当前账号并撤销旧会话。"
            : "GitHub authentication is required. If this identity owns another Eval account, its data will be merged here and old sessions revoked."
          : account.unlink.github.allowed
            ? isZh ? "解绑后将无法再使用该 GitHub 登录，账号数据不会被删除。" : "Unlinking disables GitHub sign-in but does not delete your account data."
            : isZh ? "请先完整绑定用户名、手机号和密码，才能解绑 GitHub。" : "Link Google before unlinking GitHub so you can still sign in."}
      />
    </div>
    {isZh && !localComplete && <article className="identity-form-panel"><header><small>LOCAL IDENTITY</small><h3>绑定账号、手机号与密码</h3><p>适用于首次通过 GitHub 登录的中文用户。验证码会发送到待绑定手机号。</p></header><form onSubmit={bindLocal}><label>账号<input name="username" defaultValue={account.user.username || ""} required minLength={3} maxLength={32} pattern="[A-Za-z0-9]{3,32}" title="仅支持 3–32 位英文字母和数字" placeholder="3–32 位英文字母或数字" autoComplete="username" autoCapitalize="none" spellCheck={false}/></label><label>手机号<div className="identity-code-row"><input name="phone" type="tel" defaultValue={account.user.phoneE164?.replace(/^\+86/, "") || ""} required inputMode="tel" autoComplete="tel"/><button type="button" onClick={event => { const form = event.currentTarget.form; void sendVerification("phone_bind", String(new FormData(form!).get("phone") || "")); }} disabled={sending || countdown > 0}>{sending ? "发送中" : countdown > 0 ? `${countdown}s` : "发送验证码"}</button></div></label><label>验证码<input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}/></label><label>设置密码<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="至少 10 位，包含字母与数字"/></label><button className="identity-primary" disabled={saving}>{saving ? "正在绑定…" : "完成统一绑定"}<Icon name="arrow"/></button></form></article>}
    {isZh && localComplete && <article className="identity-form-panel"><header><small>ACCOUNT SECURITY</small><h3>通过手机验证码修改密码</h3><p>验证码发送到 {maskPhone(account.user.phoneE164!)}。更新后其他网页登录会话会被撤销。</p></header><form onSubmit={updatePassword}><label>短信验证码<div className="identity-code-row"><input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}/><button type="button" onClick={() => void sendVerification("password_change")} disabled={sending || countdown > 0}>{sending ? "发送中" : countdown > 0 ? `${countdown}s` : "发送验证码"}</button></div></label><label>新密码<input name="nextPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="至少 10 位，包含字母与数字"/></label><button className="identity-primary" disabled={saving}>{saving ? "正在更新…" : "验证并更新密码"}<Icon name="arrow"/></button></form></article>}
  </section>;
}

function IdentityStatus({ title, value, connected, action, actionLabel, note, onAction, buttonLabel, buttonDisabled, buttonTone }: { title: string; value: string; connected: boolean; action?: string; actionLabel?: string; note?: string; onAction?: () => void; buttonLabel?: string; buttonDisabled?: boolean; buttonTone?: "danger" }) {
  return <article className={connected ? "connected" : "pending"}><Icon name={connected ? "check" : "key"}/><small>{title}</small><b>{value}</b><span>{connected ? "CONNECTED" : "NOT LINKED"}</span>{note && <p>{note}</p>}{action && <a href={action}>{actionLabel || "绑定 / Link"}<Icon name="arrow"/></a>}{onAction && <button type="button" className={buttonTone === "danger" ? "danger" : undefined} onClick={onAction} disabled={buttonDisabled}>{buttonLabel || "解绑 / Unlink"}</button>}</article>;
}

function maskPhone(value: string) { return value.replace(/^\+86(\d{3})\d{4}(\d{4})$/, "$1 **** $2"); }

function Metric({ icon, value, label }: { icon: IconName; value: number; label: string }) { return <article><Icon name={icon}/><strong>{value.toLocaleString("zh-CN")}</strong><span>{label}</span></article>; }
function PanelHead({ eyebrow, title, href, link }: { eyebrow: string; title: string; href: string; link: string }) { return <header><div><small>{eyebrow}</small><h3>{title}</h3></div><Link href={href}>{link}<Icon name="arrow"/></Link></header>; }
function ReleaseList({ releases, detailed = false }: { releases: ConsoleSnapshot["releases"]; detailed?: boolean }) { return <div className="workspace-release-list">{releases.length ? releases.map(item => <article key={item.id}><span><Icon name="download"/></span><div><b>Eval Agent v{item.version}</b><small>{item.channel.toUpperCase()} · {platformLabel(item.platform, item.architecture)} · {item.format} · {item.fileName}{detailed ? ` · ${formatBytes(item.sizeBytes)}` : ""}</small></div><em className={item.status}>{item.status === "published" ? "已发布" : "草稿"}</em>{item.status === "published" ? <a href={`/api/v1/downloads/${item.id}`} aria-label={`下载 v${item.version} ${platformLabel(item.platform, item.architecture)}`}><Icon name="download"/></a> : <i/>}</article>) : <Empty text="还没有可用版本。"/>}</div>; }
function TopicList({ topics }: { topics: ConsoleSnapshot["forumTopics"] }) { return <div className="workspace-topic-list">{topics.length ? topics.map(item => <Link href={`/forum/${item.slug}`} key={item.id}><span>{item.pinned ? "置顶" : item.category}</span><div><b>{item.title}</b><small>{item.authorName} · {item.replyCount} 条回复 · {formatRelative(item.lastActivityAt)}</small></div><Icon name="chevron"/></Link>) : <Empty text="还没有论坛主题。"/>}</div>; }
function Empty({ text }: { text: string }) { return <div className="workspace-empty"><i/><p>{text}</p></div>; }
function formatTime(value: number) { return new Date(value * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }
function formatRelative(value: number) { const seconds = Math.max(0, Math.floor(Date.now() / 1000 - value)); if (seconds < 60) return "刚刚"; if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`; if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`; return new Date(value * 1000).toLocaleDateString("zh-CN"); }
function formatBytes(value: number) { return value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`; }
function platformLabel(platform: string, architecture: string) { return platform === "darwin" ? `macOS ${architecture === "aarch64" ? "Apple Silicon" : architecture === "x86_64" ? "Intel" : "Universal"}` : "Windows x64"; }
function auditLabel(value: string) { return ({ "auth.password.change": "修改密码", "auth.identity.unlink": "解绑登录身份", "desktop.auth.approve": "授权桌面端", "desktop.session.revoke": "撤销桌面端", "forum.topic.create": "发布论坛主题", "forum.reply.create": "发布论坛回复", "blog.post.create": "创建博客", "blog.post.update": "更新博客", "release.publish": "发布版本" } as Record<string, string>)[value] || "系统操作"; }
