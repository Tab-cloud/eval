"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "../ui/icons";
import { useTheme } from "../ui/useTheme";
import { AuthSettingsView, type AuthSettingsSnapshot } from "./AuthSettingsView";
import { ContentSettingsView, type ContentAdminSnapshot } from "./ContentSettingsView";
import { AgentCommunityPolicyView, type AgentCommunityAction, type AgentCommunityPolicy } from "./AgentCommunityPolicyView";

type AdminUser = { id: string; email?: string; phoneE164?: string | null; displayName: string; role: "admin" | "member" };
type Snapshot = {
  metrics: { users: number; activeUsers: number; artifacts: number; publishedReleases: number; activePlans: number; auditEvents: number; blogPosts: number; forumTopics: number; forumReplies: number; downloads: number; downloadsLast7Days: number };
  readiness: { users: boolean; identity: boolean; content: boolean; artifacts: boolean; releases: boolean; billing: boolean };
  users: Array<{ id: string; username?: string | null; email?: string | null; phoneE164?: string | null; displayName: string; status: string; role: string; lastLoginAt?: number }>;
  artifacts: Array<{ id: string; fileName: string; label: string; format: string; sizeBytes: number; sha256: string; signed: boolean; signatureVerifiedAt?: number; signatureKeyId?: string; embeddedVersion?: string | null; productName?: string | null; versionSource?: string | null; platform: string; architecture: string; status: string; createdAt: number; downloadCount: number; downloadsLast7Days: number; lastDownloadedAt?: number | null }>;
  releases: Array<{ id: string; version: string; channel: string; artifactId: string; fileName: string; notes: string; mandatory: number; status: string; publishedAt?: number }>;
  plans: Array<{ id: string; name: string; monthlyPriceCents: number; currency: string; features: string | string[]; status: string }>;
  audits: Array<{ id: string; action: string; resourceType: string; resourceId?: string; metadata?: unknown; createdAt: number; actorName: string }>;
  authSettings: AuthSettingsSnapshot;
  releaseSettings: { configured: boolean; updaterPublicKey: string; updaterPublicKeyId: string; source: "database" | "environment" | "missing"; updatedAt: number | null };
  content: ContentAdminSnapshot;
  agentCommunityPolicy: AgentCommunityPolicy;
  agentCommunityActions: AgentCommunityAction[];
};

const modules: Array<{ id: string; label: string; eyebrow: string; icon: IconName }> = [
  { id: "dashboard", label: "运营看板", eyebrow: "SIGNAL", icon: "grid" },
  { id: "users", label: "用户管理", eyebrow: "IDENTITY", icon: "users" },
  { id: "identity", label: "登录与身份", eyebrow: "AUTHENTICATION", icon: "key" },
  { id: "content", label: "内容中心", eyebrow: "EDITORIAL", icon: "spark" },
  { id: "community", label: "Agent 社区", eyebrow: "AUTOMATION", icon: "shield" },
  { id: "releases", label: "版本发布", eyebrow: "DISTRIBUTION", icon: "route" },
  { id: "billing", label: "产品方案", eyebrow: "COMMERCE", icon: "chart" },
  { id: "audits", label: "审计日志", eyebrow: "AUDIT", icon: "shield" },
];

export function AdminConsole({ currentUser }: { currentUser: AdminUser }) {
  const [active, setActive] = useState("dashboard");
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useTheme();

  const load = async () => {
    const response = await fetch("/api/admin/control", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取管理员数据。");
    setData(await response.json());
  };
  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/control", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<Snapshot> : Promise.reject(new Error("无法读取管理员数据。")))
      .then(snapshot => { if (mounted) setData(snapshot); })
      .catch(reason => { if (mounted) setError(reason instanceof Error ? reason.message : "无法读取管理员数据。"); });
    return () => { mounted = false; };
  }, []);

  const action = async (name: string, input: Record<string, unknown>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, input }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "操作失败。");
      await load(); setNotice(success); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); return false; }
    finally { setBusy(false); }
  };

  const uploadArtifact = async (form: HTMLFormElement) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/artifacts", { method: "POST", body: new FormData(form) });
      const payload = await response.json() as { error?: string; artifacts?: unknown[]; replaced?: boolean; contentChanged?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "上传失败。");
      form.reset(); await load(); setNotice(payload.replaced
        ? payload.contentChanged ? "同版本安装包已完成验签并替换原文件。" : "安装包内容未变化，已复用现有文件并刷新验签信息。"
        : `${payload.artifacts?.length ?? 0} 个安装包已完成验签并安全上传。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "上传失败。"); }
    finally { setBusy(false); }
  };

  const activeModule = modules.find(item => item.id === active) ?? modules[0];
  return <main className="admin-room">
    <header className="admin-bar"><a href="/console" className="admin-brand"><span><Image src="/favicon.svg" alt="" width={24} height={24}/></span><div><b>Eval Admin</b><small>CONTROL ROOM</small></div></a><nav aria-label="管理员导航">{modules.map(item => <button key={item.id} aria-label={item.label} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav><div className="admin-actions"><a href="/console">用户控制台</a><button onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}><Icon name={theme === "dark" ? "sun" : "moon"}/></button><span>{currentUser.displayName.slice(0,2)}</span></div></header>
    <div className="admin-frame">
      <div className="admin-rail"><span>ADMINISTRATIVE CONTROL PLANE</span><i/></div>
      <section className="admin-heading"><div><p>{activeModule.eyebrow} / 0{modules.indexOf(activeModule)+1}</p><h1>{activeModule.label}</h1></div><p>{adminDescription(active)}</p></section>
      {notice && <div className="admin-notice success"><Icon name="check"/>{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {error && <div className="admin-notice error">{error}<button onClick={() => setError("")}>×</button></div>}
      {!data ? <div className="admin-loading"><i/><span>正在读取控制面数据</span></div> : <>
        {active === "dashboard" && <DashboardView data={data} onNavigate={setActive}/>}
        {active === "users" && <UsersView data={data} busy={busy} action={action}/>} 
        {active === "users" && <PhoneBindingPanel data={data} busy={busy} action={action}/>}
        {active === "identity" && <AuthSettingsView settings={data.authSettings} busy={busy} action={action}/>}
        {active === "content" && <ContentSettingsView content={data.content} busy={busy} action={action}/>}
        {active === "community" && <AgentCommunityPolicyView policy={data.agentCommunityPolicy} actions={data.agentCommunityActions} busy={busy} action={action}/>}
        {active === "releases" && <ReleaseCenterView data={data} busy={busy} upload={uploadArtifact} action={action}/>}
        {active === "billing" && <BillingView data={data} busy={busy} action={action}/>} 
        {active === "audits" && <AuditsView data={data}/>}
      </>}
      <footer><span>EVAL ADMIN / GOVERNED OPERATIONS</span><span>所有管理员写操作均绑定操作账号并写入审计日志</span><span>单站点运营</span></footer>
    </div>
  </main>;
}

function DashboardView({ data, onNavigate }: { data: Snapshot; onNavigate: (module: string) => void }) {
  const readiness = [
    { key: "users", module: "users", label: "用户与管理员", detail: `${data.metrics.activeUsers} 位活跃用户`, ready: data.readiness.users },
    { key: "identity", module: "identity", label: "登录身份服务", detail: "短信、Google 或 GitHub 登录", ready: data.readiness.identity },
    { key: "content", module: "content", label: "社区与内容", detail: `${data.metrics.blogPosts + data.metrics.forumTopics} 项内容`, ready: data.readiness.content },
    { key: "artifacts", module: "releases", label: "已签名安装包", detail: `${data.metrics.artifacts} 个安装包`, ready: data.readiness.artifacts },
    { key: "releases", module: "releases", label: "公开升级版本", detail: `${data.metrics.publishedReleases} 个公开版本`, ready: data.readiness.releases },
    { key: "billing", module: "billing", label: "生效收费套餐", detail: `${data.metrics.activePlans} 个生效套餐`, ready: data.readiness.billing },
  ];
  const completed = readiness.filter(item => item.ready).length;
  const score = Math.round(completed / readiness.length * 100);
  const stats: Array<[string, string]> = [
    [compactNumber(data.metrics.activeUsers), "活动用户"],
    [compactNumber(data.metrics.downloads), "软件下载"],
    [compactNumber(data.metrics.artifacts), "工具产物"],
    [compactNumber(data.metrics.publishedReleases), "公开版本"],
    [compactNumber(data.metrics.blogPosts + data.metrics.forumTopics + data.metrics.forumReplies), "社区内容"],
    [compactNumber(data.metrics.activePlans), "产品套餐"],
  ];
  return <div className="admin-dashboard">
    <section className="admin-hero"><div><p><i/>PRODUCT OPERATIONS ONLINE</p><h2>{completed === readiness.length ? <>产品运营。<br/><em>已经就绪。</em></> : <>从账号开始。<br/><em>走向真实交付。</em></>}</h2><span>管理员平台围绕账号、登录、内容、桌面端发布和产品方案运行，所有指标都来自当前站点的真实数据。</span></div><aside><small>READINESS / 06</small><strong>{String(score).padStart(2,"0")}<sup>%</sup></strong><p>{completed} / {readiness.length} 条运营链路已完成</p><i style={{width:`${score}%`}}/></aside></section>
    <section className="admin-stat-strip">{stats.map(([value,label],index)=><article key={label}><span>0{index+1}</span><strong>{value}</strong><small>{label}</small></article>)}</section>
    <section className="admin-dashboard-grid">
      <article className="admin-usage-panel">
        <header><div><p>CONTENT & COMMUNITY</p><h3>公开内容运营</h3></div><span>{data.metrics.blogPosts} 篇博客 · {data.metrics.forumTopics} 个主题</span></header>
        <div className="admin-zero-state"><Icon name="spark"/><h4>{data.readiness.content ? "内容中心已经开始运行" : "从第一篇文章或主题开始"}</h4><p>博客用于正式发布产品与技术内容，论坛用于用户讨论和经验沉淀。</p><button onClick={()=>onNavigate("content")}>管理内容 <Icon name="arrow"/></button></div>
      </article>
      <article className="admin-readiness-panel">
        <header><div><p>LAUNCH SEQUENCE</p><h3>上线清单</h3></div><strong>{completed}/{readiness.length}</strong></header>
        <div>{readiness.map((item,index)=><button key={item.key} className={item.ready ? "complete" : ""} onClick={()=>onNavigate(item.module)}><span>{String(index+1).padStart(2,"0")}</span><i>{item.ready ? <Icon name="check"/> : <Icon name="arrow"/>}</i><b>{item.label}</b><small>{item.ready ? "已完成" : item.detail}</small></button>)}</div>
      </article>
    </section>
  </div>;
}

function UsersView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建用户账号" note="普通用户可自行注册；此处用于人工创建账号或增加管理员。管理员用户名仅支持 3–32 位英文字母和数字，并需设置至少 12 位初始密码。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void action("create_user",Object.fromEntries(f),"用户账号已创建。");event.currentTarget.reset();}}><input name="displayName" placeholder="姓名" required/><input name="email" type="email" placeholder="name@example.com" required/><input name="username" placeholder="管理员用户名：3–32 位英文字母或数字" pattern="[A-Za-z0-9]{3,32}" title="仅支持 3–32 位英文字母和数字" autoCapitalize="none" spellCheck={false}/><input name="password" type="password" placeholder="管理员初始密码（至少 12 位）" minLength={12} maxLength={128}/><select name="role" defaultValue="member"><option value="member">普通用户</option><option value="admin">管理员</option></select><button disabled={busy}>创建账号 <Icon name="arrow"/></button></form></AdminForm><AdminLedger headings={["用户","状态","角色","最近登录","操作"]}>{data.users.map(user=><article key={user.id}><div><b>{user.displayName}</b><small>{user.username ? `@${user.username}` : user.email ?? user.phoneE164 ?? "未绑定登录身份"}{user.username && user.email ? ` · ${user.email}` : ""}</small></div><span className={`admin-status ${user.status}`}><i/>{user.status === "active" ? "正常" : "已停用"}</span><select defaultValue={user.role} onChange={event=>void action("update_user",{id:user.id,status:user.status,role:event.target.value},"用户角色已更新。")}><option value="member">普通用户</option><option value="admin">管理员</option></select><code>{user.lastLoginAt ? new Date(user.lastLoginAt*1000).toLocaleDateString("zh-CN") : "尚未登录"}</code><button onClick={()=>void action("update_user",{id:user.id,role:user.role,status:user.status === "active" ? "disabled" : "active"},user.status === "active" ? "用户已停用。" : "用户已启用。")} disabled={busy}>{user.status === "active" ? "停用" : "启用"}</button></article>)}</AdminLedger></div>;
}

function PhoneBindingPanel({ data, busy, action }: ViewProps) {
  return <AdminForm title="绑定中文登录手机号" note="手机号用于中文界面的验证码登录。此处可为已有账号人工绑定或更换手机号。">
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void action("update_user_phone", Object.fromEntries(form), "用户登录手机号已更新。");
    }}>
      <select name="id" required defaultValue="">
        <option value="" disabled>选择用户</option>
        {data.users.map(user => <option value={user.id} key={user.id}>{user.displayName} · {user.email ?? user.username ?? "未绑定邮箱"}{user.phoneE164 ? ` · ${maskPhone(user.phoneE164)}` : ""}</option>)}
      </select>
      <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="中国大陆手机号；留空可解除绑定"/>
      <button disabled={busy}>保存手机号 <Icon name="arrow"/></button>
    </form>
  </AdminForm>;
}

function ReleaseCenterView({ data, busy, upload, action }: ViewProps & { upload: (form: HTMLFormElement) => Promise<void> }) {
  const latestArtifact = data.artifacts
    .filter(artifact => artifact.format === "NSIS" && artifact.signed && artifact.embeddedVersion && artifact.status === "ready" && artifact.signatureKeyId === data.releaseSettings.updaterPublicKeyId)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  const publishedStableRelease = data.releases
    .filter(release => release.status === "published" && release.channel === "stable")
    .sort((left, right) => Number(right.publishedAt ?? 0) - Number(left.publishedAt ?? 0))[0];
  const publishedArtifact = publishedStableRelease ? data.artifacts.find(artifact => artifact.id === publishedStableRelease.artifactId) : undefined;
  const currentArtifact = publishedArtifact?.signatureKeyId === data.releaseSettings.updaterPublicKeyId ? publishedArtifact : undefined;
  const currentRelease = currentArtifact ? publishedStableRelease : undefined;
  const candidateDrafts = latestArtifact ? data.releases.filter(release => release.artifactId === latestArtifact.id && release.status === "draft") : [];

  return <div className="admin-module release-center">
    <section className={`release-key-config ${data.releaseSettings.configured ? "is-ready" : "is-missing"}`}>
      <div className="release-key-copy"><span><i/>{data.releaseSettings.configured ? "SIGNING KEY READY" : "SIGNING KEY REQUIRED"}</span><h2>更新签名公钥</h2><p>粘贴构建目录中的 <code>updater.pub</code> 内容。该公钥用于验证 EXE 对应的签名，不要在这里填写签名私钥。</p><small>{data.releaseSettings.configured ? `${data.releaseSettings.source === "database" ? "管理员配置" : "环境变量后备"} · 指纹 ${data.releaseSettings.updaterPublicKeyId}` : "配置后才能上传、发布和分发更新包。"}</small></div>
      <form key={`${data.releaseSettings.source}-${data.releaseSettings.updatedAt ?? "default"}`} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void action("save_release_settings",{updaterPublicKey:form.get("updaterPublicKey")},"更新签名公钥已保存。");}}>
        <label><span>MINISIGN PUBLIC KEY / updater.pub</span><textarea name="updaterPublicKey" defaultValue={data.releaseSettings.updaterPublicKey} placeholder={"untrusted comment: minisign public key\nRW..."} required spellCheck={false}/></label>
        <div><small>该公钥用于全站官网下载安装包与桌面自动升级验签。</small><button disabled={busy}>{busy ? "正在验证…" : "验证并保存公钥"}<Icon name="shield"/></button></div>
      </form>
    </section>

    <section className={`release-current ${currentRelease ? "is-live" : "is-empty"}`}>
      <div className="release-current-copy"><p><i/>CURRENT DISTRIBUTION</p><span>当前稳定版本</span><h2>{currentRelease ? `v${currentRelease.version}` : "尚未发布"}</h2><small>{currentRelease ? `${currentRelease.mandatory ? "强制升级" : "用户可选升级"} · ${new Date(Number(currentRelease.publishedAt) * 1000).toLocaleString("zh-CN")}` : "上传并发布首个签名版本后，新用户下载与老用户升级会在这里汇合。"}</small></div>
      <div className="release-current-files">
        <article className={currentArtifact ? "ready primary" : "missing"}><span>WINDOWS INSTALL / EXE</span><b>{currentArtifact ? currentArtifact.fileName : "EXE 未提供"}</b><small>{currentArtifact ? `${formatBytes(currentArtifact.sizeBytes)} · SHA256 ${currentArtifact.sha256.slice(0, 12)}…` : "当前还没有可公开下载的安装包"}</small><small>{currentArtifact ? `累计公开下载 ${compactNumber(currentArtifact.downloadCount)} 次 · 近 7 天 ${compactNumber(currentArtifact.downloadsLast7Days)} 次` : "下载统计将在版本公开后开始记录"}</small>{currentArtifact ? <a href={`/api/admin/artifacts/${currentArtifact.id}`}>内部下载<Icon name="download"/></a> : <i/>}</article>
      </div>
      {currentRelease && <button className="release-rollback" disabled={busy} onClick={()=>void action("set_release_status",{id:currentRelease.id,status:"draft"},"当前版本已停止公开分发。")}>停止公开分发</button>}
    </section>

    <section className="release-download-stats" aria-label="软件下载统计">
      <article><span>TOTAL DOWNLOADS</span><strong>{compactNumber(data.metrics.downloads)}</strong><small>全部公开 EXE 累计下载请求</small></article>
      <article><span>LAST 7 DAYS</span><strong>{compactNumber(data.metrics.downloadsLast7Days)}</strong><small>最近 7 个 UTC 自然日</small></article>
      <article><span>LATEST DOWNLOAD</span><strong>{currentArtifact?.lastDownloadedAt ? new Date(currentArtifact.lastDownloadedAt * 1000).toLocaleDateString("zh-CN") : "—"}</strong><small>{currentArtifact?.lastDownloadedAt ? "当前稳定版本最近下载日期" : "尚无公开下载记录"}</small></article>
    </section>

    <section className="release-delivery-paths">
      <article><span>01 / NEW USER</span><Icon name="download"/><b>官网直接下载</b><p>公开下载页始终只展示当前最新稳定版 EXE。</p></article>
      <article><span>02 / EXISTING USER</span><Icon name="route"/><b>客户端直接升级</b><p>Eval 使用当前版本检查接口，命中后下载同一稳定版本的签名主包。</p></article>
      <article><span>03 / RETENTION</span><Icon name="shield"/><b>历史版本转为私有</b><p>旧版本不再公开下载，但保留文件与审计记录，支持紧急回滚。</p></article>
    </section>

    <AdminForm title="上传新版本文件" note="提交 EXE 与对应签名。系统会自动验签并读取安装包内部版本。">
      <form className="artifact-form" encType="multipart/form-data" onSubmit={event=>{event.preventDefault();void upload(event.currentTarget);}}>
        <input className="artifact-label" name="label" placeholder="显示名称，如 Eval Agent Windows x64" required/>
        <section className="artifact-channel">
          <header><span>WINDOWS X64</span><b>NSIS / .EXE</b></header>
          <label className="admin-file"><Icon name="download"/><span>选择 .exe 安装包</span><input name="file" type="file" accept=".exe" required/></label>
          <label className="admin-file"><Icon name="shield"/><span>选择对应的 .exe.sig</span><input name="signature" type="file" accept=".sig" required/></label>
        </section>
        <button disabled={busy || !data.releaseSettings.configured}>{busy ? "正在验签并上传…" : data.releaseSettings.configured ? "验签并上传最新产物" : "请先保存更新公钥"} <Icon name="arrow"/></button>
      </form>
    </AdminForm>

    {latestArtifact && <section className="release-candidate"><header><div><span>LATEST VERIFIED BUILD</span><h3>v{latestArtifact.embeddedVersion}</h3></div><small>{candidateDrafts.length ? `已有 ${candidateDrafts.map(release => release.channel.toUpperCase()).join(" / ")} 草稿，可在下方直接发布` : "仅最新上传的 EXE 进入发布候选"}</small></header><div><article><span>EXE</span><div><b>{latestArtifact.fileName}</b><small>{formatBytes(latestArtifact.sizeBytes)} · {latestArtifact.productName || "Eval Agent"}</small></div><a href={`/api/admin/artifacts/${latestArtifact.id}`}>内部下载</a></article></div></section>}

    <AdminForm title="发布到用户" note="选择最新验签版本并发布。已有同版本草稿会直接更新并转为正式发布，不会重复创建版本记录。">
      <form onSubmit={event=>{event.preventDefault();if(!latestArtifact?.embeddedVersion)return;const form=new FormData(event.currentTarget);void action("create_release",{version:latestArtifact.embeddedVersion,artifactId:latestArtifact.id,channel:form.get("channel"),status:form.get("status"),notes:form.get("notes"),mandatory:form.get("mandatory")==="on"},form.get("status")==="published"?"最新版本已发布。":"版本草稿已保存。");event.currentTarget.reset();}}>
        <label>待发布版本<select name="artifactVersion" value={latestArtifact?.embeddedVersion ?? ""} disabled><option value={latestArtifact?.embeddedVersion ?? ""}>{latestArtifact?.embeddedVersion ? `v${latestArtifact.embeddedVersion} · EXE` : "请先上传安装包"}</option></select></label>
        <label>发布渠道<select name="channel" defaultValue="stable"><option value="stable">Stable / 正式版</option><option value="beta">Beta / 测试版</option><option value="internal">Internal / 内部版</option></select></label>
        <label>发布方式<select name="status" defaultValue="draft"><option value="draft">先保存草稿</option><option value="published">立即公开发布</option></select></label>
        <label className="release-notes">更新说明<textarea name="notes" placeholder="说明新增能力、修复内容与升级注意事项"/></label>
        <label className="admin-check"><input name="mandatory" type="checkbox"/>将此版本标记为强制升级</label>
        <button disabled={busy || !latestArtifact || !data.releaseSettings.configured}>保存并应用发布设置 <Icon name="arrow"/></button>
      </form>
    </AdminForm>
  </div>;
}

function BillingView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建产品方案" note="方案描述 Eval Agent 的价格和功能权益；金额使用最小货币单位保存，功能权益每行一项。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void action("save_plan",Object.fromEntries(f),"产品方案已保存。");event.currentTarget.reset();}}><input name="name" placeholder="方案名称" required/><div className="admin-money"><select name="currency"><option value="CNY">CNY</option><option value="USD">USD</option></select><input name="monthlyPriceCents" type="number" min="0" placeholder="月费（分）" required/></div><textarea name="features" placeholder={'功能权益，每行一项\n桌面端更新\n工程论坛\n技术博客'}/><button disabled={busy}>保存方案 <Icon name="arrow"/></button></form></AdminForm><div className="pricing-grid">{data.plans.length ? data.plans.map(plan=><article key={plan.id}><span>{plan.status.toUpperCase()}</span><h3>{plan.name}</h3><strong>{plan.currency === "CNY" ? "¥" : "$"}{(plan.monthlyPriceCents/100).toLocaleString()}<small>/ 月</small></strong><p>面向个人用户</p><ul>{safeFeatures(plan.features).map(item=><li key={item}>{item}</li>)}</ul><button className="plan-status" disabled={busy} onClick={()=>void action("set_plan_status",{id:plan.id,status:plan.status==="active"?"archived":"active"},plan.status==="active"?"方案已归档。":"方案已重新启用。")}>{plan.status==="active"?"归档方案":"重新启用"}</button></article>) : <EmptyState title="尚未配置产品方案" text="创建方案后，可以独立管理价格和产品功能权益。"/>}</div></div>;
}

function AuditsView({ data }: { data: Snapshot }) {
  return <div className="admin-module"><div className="admin-module-head"><div><p>IMMUTABLE ACTIVITY</p><h2>管理员与安全操作记录</h2></div><p>全站最近 100 条写操作。日志不记录密码、短信验证码或登录凭据明文。</p></div><AdminLedger headings={["操作","执行者","资源","时间","标识"]}>{data.audits.map(item=><article key={item.id}><div><b>{auditLabel(item.action)}</b><small>{item.action}</small></div><span>{item.actorName}</span><span>{item.resourceType}</span><code>{new Date(item.createdAt*1000).toLocaleString("zh-CN")}</code><code>{item.resourceId?.slice(0,12) || "—"}</code></article>)}</AdminLedger>{!data.audits.length && <EmptyState title="尚无审计事件" text="创建用户、配置登录、管理内容、发布版本或调整产品方案后，操作会显示在这里。"/>}</div>;
}

type ViewProps = { data: Snapshot; busy: boolean; action: (name:string,input:Record<string,unknown>,success:string)=>Promise<boolean> };
function AdminForm({title,note,children}:{title:string;note:string;children:React.ReactNode}){return <section className="admin-form"><div><p>CONFIGURATION</p><h2>{title}</h2><span>{note}</span></div>{children}</section>}
function AdminLedger({headings,children}:{headings:string[];children:React.ReactNode}){return <section className="admin-ledger"><header>{headings.map(item=><span key={item}>{item}</span>)}</header>{children}</section>}
function EmptyState({title,text}:{title:string;text:string}){return <div className="admin-empty"><i/><h3>{title}</h3><p>{text}</p></div>}
function adminDescription(id:string){return ({dashboard:"跨用户、登录、内容、发布与产品方案的独立管理视角。",users:"创建账号、控制管理员权限与用户状态。",identity:"配置短信、Google 与 GitHub 登录，并检查部署凭据完整度。",content:"发布公开博客，并治理全站论坛主题与回复。",community:"控制 Eval Agent 访问论坛与博客的全站能力、限额和紧急停止。",releases:"上传、验签并发布当前最新的 EXE 与桌面升级版本。",billing:"定义 Eval Agent 方案价格与功能权益。",audits:"查看全站可追溯的管理员与安全操作。"} as Record<string,string>)[id]}
function formatBytes(value:number){return value>1024*1024?`${(value/1024/1024).toFixed(1)} MB`:`${Math.round(value/1024)} KB`}
function compactNumber(value:number){return Intl.NumberFormat("zh-CN",{notation:"compact",maximumFractionDigits:1}).format(value)}
function maskPhone(value:string){return value.replace(/(\+86\d{3})\d{4}(\d{4})/,"$1****$2")}
function safeFeatures(value:string|string[]){if(Array.isArray(value))return value.filter(item=>typeof item==="string");try{const result=JSON.parse(value);return Array.isArray(result)?result:[]}catch{return []}}
function auditLabel(value:string){return ({"user.create":"创建用户","user.update":"更新用户","user.phone.update":"更新手机号","auth.providers.save":"保存登录配置","auth.identity.unlink":"解绑登录身份","blog.post.create":"创建博客","blog.post.update":"更新博客","blog.post.status":"博客状态","forum.topic.create":"发布论坛主题","forum.reply.create":"发布论坛回复","forum.topic.moderate":"治理论坛主题","forum.reply.moderate":"治理论坛回复","artifact.upload":"上传安装包","release.settings.save":"更新发布公钥","release.create":"创建版本","release.update":"更新版本草稿","release.publish":"发布版本","release.rollback":"回滚版本","billing_plan.save":"保存套餐","billing_plan.status":"套餐状态","auth.password.change":"修改密码"} as Record<string,string>)[value] || "系统操作"}
