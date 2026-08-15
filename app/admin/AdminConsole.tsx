"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "../ui/icons";
import { useTheme } from "../ui/useTheme";
import { AuthSettingsView, type AuthSettingsSnapshot } from "./AuthSettingsView";
import { ContentSettingsView, type ContentAdminSnapshot } from "./ContentSettingsView";

type AdminUser = { id: string; email: string; phoneE164?: string | null; displayName: string; tenantId: string; tenantName: string; role: string };
type Snapshot = {
  metrics: { users: number; activeUsers: number; artifacts: number; publishedReleases: number; activePlans: number; auditEvents: number; blogPosts: number; forumTopics: number; forumReplies: number };
  readiness: { users: boolean; identity: boolean; content: boolean; artifacts: boolean; releases: boolean; billing: boolean };
  users: Array<{ id: string; username?: string | null; email: string; phoneE164?: string | null; displayName: string; status: string; role: string; lastLoginAt?: number }>;
  artifacts: Array<{ id: string; fileName: string; label: string; format: string; sizeBytes: number; sha256: string; signed: boolean; platform: string; architecture: string; status: string; createdAt: number }>;
  releases: Array<{ id: string; version: string; channel: string; artifactId: string; fileName: string; notes: string; mandatory: number; status: string; publishedAt?: number }>;
  plans: Array<{ id: string; name: string; monthlyPriceCents: number; currency: string; seatLimit: number; features: string | string[]; status: string }>;
  audits: Array<{ id: string; action: string; resourceType: string; resourceId?: string; metadata?: unknown; createdAt: number; actorName: string }>;
  authSettings: AuthSettingsSnapshot;
  content: ContentAdminSnapshot;
};

const modules: Array<{ id: string; label: string; eyebrow: string; icon: IconName }> = [
  { id: "dashboard", label: "运营看板", eyebrow: "SIGNAL", icon: "grid" },
  { id: "users", label: "用户管理", eyebrow: "IDENTITY", icon: "users" },
  { id: "identity", label: "登录与身份", eyebrow: "AUTHENTICATION", icon: "key" },
  { id: "content", label: "内容中心", eyebrow: "EDITORIAL", icon: "spark" },
  { id: "artifacts", label: "工具源文件", eyebrow: "ARTIFACTS", icon: "download" },
  { id: "releases", label: "版本升级", eyebrow: "RELEASES", icon: "route" },
  { id: "billing", label: "收费配置", eyebrow: "COMMERCE", icon: "chart" },
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
      await load(); setNotice(success);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); }
    finally { setBusy(false); }
  };

  const uploadArtifact = async (form: HTMLFormElement) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/artifacts", { method: "POST", body: new FormData(form) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "上传失败。");
      form.reset(); await load(); setNotice("安装包源文件已安全上传。");
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
        {active === "artifacts" && <ArtifactsView data={data} busy={busy} upload={uploadArtifact}/>} 
        {active === "releases" && <ReleasesView data={data} busy={busy} action={action}/>} 
        {active === "billing" && <BillingView data={data} busy={busy} action={action}/>} 
        {active === "audits" && <AuditsView data={data}/>}
      </>}
      <footer><span>EVAL ADMIN / GOVERNED OPERATIONS</span><span>所有管理员写操作均绑定当前组织与操作身份</span><span>{currentUser.tenantName}</span></footer>
    </div>
  </main>;
}

function DashboardView({ data, onNavigate }: { data: Snapshot; onNavigate: (module: string) => void }) {
  const readiness = [
    { key: "users", module: "users", label: "组织与管理员", detail: `${data.metrics.activeUsers} 位活跃成员`, ready: data.readiness.users },
    { key: "identity", module: "identity", label: "登录身份服务", detail: "短信、Google 或 GitHub 登录", ready: data.readiness.identity },
    { key: "content", module: "content", label: "社区与内容", detail: `${data.metrics.blogPosts + data.metrics.forumTopics} 项内容`, ready: data.readiness.content },
    { key: "artifacts", module: "artifacts", label: "已签名工具产物", detail: `${data.metrics.artifacts} 个安装包`, ready: data.readiness.artifacts },
    { key: "releases", module: "releases", label: "公开升级版本", detail: `${data.metrics.publishedReleases} 个公开版本`, ready: data.readiness.releases },
    { key: "billing", module: "billing", label: "生效收费套餐", detail: `${data.metrics.activePlans} 个生效套餐`, ready: data.readiness.billing },
  ];
  const completed = readiness.filter(item => item.ready).length;
  const score = Math.round(completed / readiness.length * 100);
  const stats: Array<[string, string]> = [
    [compactNumber(data.metrics.activeUsers), "活动用户"],
    [compactNumber(data.metrics.artifacts), "工具产物"],
    [compactNumber(data.metrics.publishedReleases), "公开版本"],
    [compactNumber(data.metrics.blogPosts + data.metrics.forumTopics + data.metrics.forumReplies), "社区内容"],
    [compactNumber(data.metrics.activePlans), "产品套餐"],
  ];
  return <div className="admin-dashboard">
    <section className="admin-hero"><div><p><i/>PRODUCT OPERATIONS ONLINE</p><h2>{completed === readiness.length ? <>产品运营。<br/><em>已经就绪。</em></> : <>从账号开始。<br/><em>走向真实交付。</em></>}</h2><span>管理员平台围绕账号、登录、内容、桌面端发布和产品套餐运行，所有指标都来自当前组织的真实数据。</span></div><aside><small>READINESS / 06</small><strong>{String(score).padStart(2,"0")}<sup>%</sup></strong><p>{completed} / {readiness.length} 条运营链路已完成</p><i style={{width:`${score}%`}}/></aside></section>
    <section className="admin-stat-strip">{stats.map(([value,label],index)=><article key={label}><span>0{index+1}</span><strong>{value}</strong><small>{label}</small></article>)}</section>
    <section className="admin-dashboard-grid">
      <article className="admin-usage-panel">
        <header><div><p>CONTENT & COMMUNITY</p><h3>公开内容运营</h3></div><span>{data.metrics.blogPosts} 篇博客 · {data.metrics.forumTopics} 个主题</span></header>
        <div className="admin-zero-state"><Icon name="spark"/><h4>{data.readiness.content ? "内容中心已经开始运行" : "从第一篇文章或主题开始"}</h4><p>博客用于正式发布产品与技术内容，论坛用于团队讨论和经验沉淀。</p><button onClick={()=>onNavigate("content")}>管理内容 <Icon name="arrow"/></button></div>
      </article>
      <article className="admin-readiness-panel">
        <header><div><p>LAUNCH SEQUENCE</p><h3>上线清单</h3></div><strong>{completed}/{readiness.length}</strong></header>
        <div>{readiness.map((item,index)=><button key={item.key} className={item.ready ? "complete" : ""} onClick={()=>onNavigate(item.module)}><span>{String(index+1).padStart(2,"0")}</span><i>{item.ready ? <Icon name="check"/> : <Icon name="arrow"/>}</i><b>{item.label}</b><small>{item.ready ? "已完成" : item.detail}</small></button>)}</div>
      </article>
    </section>
  </div>;
}

function UsersView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建用户账号" note="普通用户使用邮箱/手机号身份；租户管理员还必须设置唯一用户名和至少 12 位初始密码。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void action("create_user",Object.fromEntries(f),"用户账号已创建。");event.currentTarget.reset();}}><input name="displayName" placeholder="姓名" required/><input name="email" type="email" placeholder="name@company.com" required/><input name="username" placeholder="管理员用户名（仅租户管理员必填）" pattern="[a-z0-9][a-z0-9._-]{2,31}"/><input name="password" type="password" placeholder="管理员初始密码（至少 12 位）" minLength={12} maxLength={128}/><select name="role" defaultValue="developer"><option value="developer">开发者</option><option value="viewer">查看者</option><option value="auditor">审计员</option><option value="tenant_admin">租户管理员</option></select><button disabled={busy}>创建账号 <Icon name="arrow"/></button></form></AdminForm><AdminLedger headings={["用户","状态","角色","最近登录","操作"]}>{data.users.map(user=><article key={user.id}><div><b>{user.displayName}</b><small>{user.username ? `@${user.username} · ` : ""}{user.email}</small></div><span className={`admin-status ${user.status}`}><i/>{user.status === "active" ? "正常" : "已停用"}</span><select defaultValue={user.role} onChange={event=>void action("update_user",{id:user.id,status:user.status,role:event.target.value},"用户角色已更新。")}>{["tenant_admin","developer","auditor","viewer"].map(role=><option value={role} key={role}>{role}</option>)}</select><code>{user.lastLoginAt ? new Date(user.lastLoginAt*1000).toLocaleDateString("zh-CN") : "尚未登录"}</code><button onClick={()=>void action("update_user",{id:user.id,role:user.role,status:user.status === "active" ? "disabled" : "active"},user.status === "active" ? "用户已停用。" : "用户已启用。")} disabled={busy}>{user.status === "active" ? "停用" : "启用"}</button></article>)}</AdminLedger></div>;
}

function PhoneBindingPanel({ data, busy, action }: ViewProps) {
  return <AdminForm title="绑定中文登录手机号" note="手机号只用于中文界面的验证码登录；用户仍需由管理员预先创建，系统不会通过短信自动创建组织或账号。">
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void action("update_user_phone", Object.fromEntries(form), "用户登录手机号已更新。");
    }}>
      <select name="id" required defaultValue="">
        <option value="" disabled>选择组织用户</option>
        {data.users.map(user => <option value={user.id} key={user.id}>{user.displayName} · {user.email}{user.phoneE164 ? ` · ${maskPhone(user.phoneE164)}` : ""}</option>)}
      </select>
      <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="中国大陆手机号；留空可解除绑定"/>
      <button disabled={busy}>保存手机号 <Icon name="arrow"/></button>
    </form>
  </AdminForm>;
}

function ArtifactsView({ data, busy, upload }: {data:Snapshot;busy:boolean;upload:(form:HTMLFormElement)=>Promise<void>}) {
  return <div className="admin-module"><AdminForm title="上传 Agent 更新产物" note="同时上传 Tauri 构建生成的 Windows x64 NSIS（.exe）或 MSI（.msi）及对应 .sig；缺少签名的文件不能发布为自动更新。"><form className="artifact-form" encType="multipart/form-data" onSubmit={event=>{event.preventDefault();void upload(event.currentTarget);}}><input name="label" placeholder="显示名称，如 Windows x64 安装程序" required/><label className="admin-file"><Icon name="download"/><span>选择 .exe 或 .msi 安装包</span><input name="file" type="file" accept=".exe,.msi" required/></label><label className="admin-file"><Icon name="shield"/><span>选择对应的 .sig 签名文件</span><input name="signature" type="file" accept=".sig" required/></label><button disabled={busy}>{busy ? "正在上传…" : "上传更新产物"} <Icon name="arrow"/></button></form></AdminForm><AdminLedger headings={["源文件","平台","大小","SHA256","签名"]}>{data.artifacts.map(item=><article key={item.id}><div><b>{item.label}</b><small>{item.fileName}</small></div><span>{item.platform}-{item.architecture}</span><code>{formatBytes(item.sizeBytes)}</code><code title={item.sha256}>{item.sha256.slice(0,12)}…</code><a href={`/api/admin/artifacts/${item.id}`}>{item.signed ? "已签名 · 下载" : "签名缺失"}</a></article>)}</AdminLedger></div>;
}

function ReleasesView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建升级版本" note="版本必须绑定已上传的真实安装包；发布后才会进入公开下载链路。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);const input={...Object.fromEntries(f),mandatory:f.get("mandatory")==="on"};void action("create_release",input,"版本配置已创建。");event.currentTarget.reset();}}><input name="version" placeholder="版本号，如 0.1.1" pattern="\d+\.\d+\.\d+.*" required/><select name="artifactId" required defaultValue=""><option value="" disabled>选择已上传安装包</option>{data.artifacts.map(item=><option key={item.id} value={item.id}>{item.label} · {item.fileName}</option>)}</select><select name="channel" defaultValue="stable"><option value="stable">Stable</option><option value="beta">Beta</option><option value="internal">Internal</option></select><select name="status" defaultValue="draft"><option value="draft">草稿</option><option value="published">立即发布</option></select><textarea name="notes" placeholder="更新说明"/><label className="admin-check"><input name="mandatory" type="checkbox"/>强制升级</label><button disabled={busy || !data.artifacts.length}>创建版本 <Icon name="arrow"/></button></form></AdminForm><AdminLedger headings={["版本","渠道","安装包","升级策略","状态"]}>{data.releases.map(item=><article key={item.id}><div><b>v{item.version}</b><small>{item.notes || "无更新说明"}</small></div><span>{item.channel.toUpperCase()}</span><span>{item.fileName}</span><span>{item.mandatory ? "强制升级" : "用户可选"}</span><button disabled={busy} onClick={()=>void action("set_release_status",{id:item.id,status:item.status==="published"?"draft":"published"},item.status==="published"?"版本已回滚为草稿。":"版本已正式发布。")}>{item.status === "published" ? "回滚" : "发布"}</button></article>)}</AdminLedger></div>;
}

function BillingView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建产品套餐" note="套餐只描述 Eval Agent 产品席位和功能权益；金额使用最小货币单位保存，功能权益每行一项。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void action("save_plan",Object.fromEntries(f),"产品套餐已保存。");event.currentTarget.reset();}}><input name="name" placeholder="套餐名称" required/><div className="admin-money"><select name="currency"><option value="CNY">CNY</option><option value="USD">USD</option></select><input name="monthlyPriceCents" type="number" min="0" placeholder="月费（分）" required/></div><input name="seatLimit" type="number" min="1" placeholder="席位数" required/><textarea name="features" placeholder={'功能权益，每行一项\n桌面端更新\n工程论坛\n团队知识库'}/><button disabled={busy}>保存套餐 <Icon name="arrow"/></button></form></AdminForm><div className="pricing-grid">{data.plans.length ? data.plans.map(plan=><article key={plan.id}><span>{plan.status.toUpperCase()}</span><h3>{plan.name}</h3><strong>{plan.currency === "CNY" ? "¥" : "$"}{(plan.monthlyPriceCents/100).toLocaleString()}<small>/ 月</small></strong><p>{plan.seatLimit} 个产品席位</p><ul>{safeFeatures(plan.features).map(item=><li key={item}>{item}</li>)}</ul><button className="plan-status" disabled={busy} onClick={()=>void action("set_plan_status",{id:plan.id,status:plan.status==="active"?"archived":"active"},plan.status==="active"?"套餐已归档。":"套餐已重新启用。")}>{plan.status==="active"?"归档套餐":"重新启用"}</button></article>) : <EmptyState title="尚未配置产品套餐" text="创建套餐后，可以独立管理席位价格和产品功能权益。"/>}</div></div>;
}

function AuditsView({ data }: { data: Snapshot }) {
  return <div className="admin-module"><div className="admin-module-head"><div><p>IMMUTABLE ACTIVITY</p><h2>管理员与安全操作记录</h2></div><p>当前组织最近 100 条写操作。日志不记录密码、短信验证码或登录凭据明文。</p></div><AdminLedger headings={["操作","执行者","资源","时间","标识"]}>{data.audits.map(item=><article key={item.id}><div><b>{auditLabel(item.action)}</b><small>{item.action}</small></div><span>{item.actorName}</span><span>{item.resourceType}</span><code>{new Date(item.createdAt*1000).toLocaleString("zh-CN")}</code><code>{item.resourceId?.slice(0,12) || "—"}</code></article>)}</AdminLedger>{!data.audits.length && <EmptyState title="尚无审计事件" text="创建用户、配置登录、管理内容、发布版本或调整套餐后，操作会显示在这里。"/>}</div>;
}

type ViewProps = { data: Snapshot; busy: boolean; action: (name:string,input:Record<string,unknown>,success:string)=>Promise<void> };
function AdminForm({title,note,children}:{title:string;note:string;children:React.ReactNode}){return <section className="admin-form"><div><p>CONFIGURATION</p><h2>{title}</h2><span>{note}</span></div>{children}</section>}
function AdminLedger({headings,children}:{headings:string[];children:React.ReactNode}){return <section className="admin-ledger"><header>{headings.map(item=><span key={item}>{item}</span>)}</header>{children}</section>}
function EmptyState({title,text}:{title:string;text:string}){return <div className="admin-empty"><i/><h3>{title}</h3><p>{text}</p></div>}
function adminDescription(id:string){return ({dashboard:"跨用户、登录、内容、发布与产品套餐的独立管理视角。",users:"创建账号、控制角色与成员生命周期。",identity:"配置短信、Google 与 GitHub 登录，并检查部署凭据完整度。",content:"发布团队博客，并治理当前组织的论坛主题与回复。",artifacts:"管理管理员上传的真实 Agent 安装包源文件。",releases:"把真实安装包组织成可审计的版本与升级策略。",billing:"定义 Eval Agent 套餐价格、产品席位与功能权益。",audits:"查看当前组织中可追溯的管理员与安全操作。"} as Record<string,string>)[id]}
function formatBytes(value:number){return value>1024*1024?`${(value/1024/1024).toFixed(1)} MB`:`${Math.round(value/1024)} KB`}
function compactNumber(value:number){return Intl.NumberFormat("zh-CN",{notation:"compact",maximumFractionDigits:1}).format(value)}
function maskPhone(value:string){return value.replace(/(\+86\d{3})\d{4}(\d{4})/,"$1****$2")}
function safeFeatures(value:string|string[]){if(Array.isArray(value))return value.filter(item=>typeof item==="string");try{const result=JSON.parse(value);return Array.isArray(result)?result:[]}catch{return []}}
function auditLabel(value:string){return ({"user.create":"创建用户","user.update":"更新用户","user.phone.update":"更新手机号","auth.providers.save":"保存登录配置","blog.post.create":"创建博客","blog.post.update":"更新博客","blog.post.status":"博客状态","forum.topic.create":"发布论坛主题","forum.reply.create":"发布论坛回复","forum.topic.moderate":"治理论坛主题","forum.reply.moderate":"治理论坛回复","artifact.upload":"上传安装包","release.create":"创建版本","release.publish":"发布版本","release.rollback":"回滚版本","billing_plan.save":"保存套餐","billing_plan.status":"套餐状态","auth.password.change":"修改密码"} as Record<string,string>)[value] || "系统操作"}
