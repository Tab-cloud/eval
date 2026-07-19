"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../ui/icons";
import { useTheme } from "../ui/useTheme";

type AdminUser = { id: string; email: string; displayName: string; tenantId: string; tenantName: string; role: string };
type Snapshot = {
  metrics: { users: number; activeUsers: number; llms: number; artifacts: number; publishedReleases: number; activePlans: number };
  users: Array<{ id: string; email: string; displayName: string; status: string; role: string; lastLoginAt?: number }>;
  llms: Array<{ id: string; displayName: string; provider: string; modelId: string; baseUrl: string; secretRef: string; status: string; requestsPerMinute: number }>;
  artifacts: Array<{ id: string; fileName: string; label: string; format: string; sizeBytes: number; sha256: string; status: string; createdAt: number }>;
  releases: Array<{ id: string; version: string; channel: string; artifactId: string; fileName: string; notes: string; mandatory: number; status: string; publishedAt?: number }>;
  plans: Array<{ id: string; name: string; monthlyPriceCents: number; currency: string; requestLimit: number; seatLimit: number; features: string; status: string }>;
};

const modules: Array<{ id: string; label: string; eyebrow: string; icon: IconName }> = [
  { id: "dashboard", label: "运营看板", eyebrow: "SIGNAL", icon: "grid" },
  { id: "users", label: "用户管理", eyebrow: "IDENTITY", icon: "users" },
  { id: "llms", label: "LLM 配置", eyebrow: "INTELLIGENCE", icon: "model" },
  { id: "artifacts", label: "工具源文件", eyebrow: "ARTIFACTS", icon: "download" },
  { id: "releases", label: "版本升级", eyebrow: "RELEASES", icon: "route" },
  { id: "billing", label: "收费配置", eyebrow: "COMMERCE", icon: "chart" },
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
      .then(response => response.ok ? response.json() : Promise.reject(new Error("无法读取管理员数据。")))
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
    <header className="admin-bar"><a href="/console" className="admin-brand"><span><img src="/favicon.svg" alt=""/></span><div><b>Eval Admin</b><small>CONTROL ROOM</small></div></a><nav aria-label="管理员导航">{modules.map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav><div className="admin-actions"><a href="/console">用户控制台</a><button onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}><Icon name={theme === "dark" ? "sun" : "moon"}/></button><span>{currentUser.displayName.slice(0,2)}</span></div></header>
    <div className="admin-frame">
      <div className="admin-rail"><span>ADMINISTRATIVE CONTROL PLANE</span><i/></div>
      <section className="admin-heading"><div><p>{activeModule.eyebrow} / 0{modules.indexOf(activeModule)+1}</p><h1>{activeModule.label}</h1></div><p>{adminDescription(active)}</p></section>
      {notice && <div className="admin-notice success"><Icon name="check"/>{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {error && <div className="admin-notice error">{error}<button onClick={() => setError("")}>×</button></div>}
      {!data ? <div className="admin-loading"><i/><span>正在读取控制面数据</span></div> : <>
        {active === "dashboard" && <DashboardView data={data}/>} 
        {active === "users" && <UsersView data={data} busy={busy} action={action}/>} 
        {active === "llms" && <LlmsView data={data} busy={busy} action={action}/>} 
        {active === "artifacts" && <ArtifactsView data={data} busy={busy} upload={uploadArtifact}/>} 
        {active === "releases" && <ReleasesView data={data} busy={busy} action={action}/>} 
        {active === "billing" && <BillingView data={data} busy={busy} action={action}/>} 
      </>}
      <footer><span>EVAL ADMIN / GOVERNED OPERATIONS</span><span>所有管理员写操作均绑定当前组织与操作身份</span><span>{currentUser.tenantName}</span></footer>
    </div>
  </main>;
}

function DashboardView({ data }: { data: Snapshot }) {
  const stats = [[data.metrics.users,"组织用户"],[data.metrics.llms,"LLM 接入"],[data.metrics.artifacts,"工具源文件"],[data.metrics.publishedReleases,"公开版本"],[data.metrics.activePlans,"生效套餐"]];
  return <div className="admin-dashboard"><section className="admin-hero"><div><p><i/>SYSTEM GOVERNANCE ONLINE</p><h2>看见平台。<br/><em>控制每一次变化。</em></h2><span>用户、模型、发布与商业策略在一个可审计的控制平面中完成配置。</span></div><aside><small>CONTROL INDEX</small><strong>{String(data.metrics.activeUsers).padStart(2,"0")}</strong><p>活跃成员</p><i/></aside></section><section className="admin-stat-strip">{stats.map(([value,label],index)=><article key={label}><span>0{index+1}</span><strong>{value}</strong><small>{label}</small></article>)}</section><section className="admin-insight-grid"><article><p>配置完整度</p><h3>{data.metrics.llms && data.metrics.activePlans ? "运营链路已建立" : "等待完成核心配置"}</h3><div className="admin-progress"><i style={{width:`${Math.min(100,25+data.metrics.llms*15+data.metrics.activePlans*20+data.metrics.publishedReleases*20)}%`}}/></div></article><article><p>发布状态</p><h3>{data.metrics.publishedReleases ? `${data.metrics.publishedReleases} 个版本正在公开分发` : "尚未发布正式版本"}</h3><span>只有绑定实际安装包的版本才能进入发布链路。</span></article></section></div>;
}

function UsersView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建用户账号" note="账号立即生效，密码以安全哈希保存。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void action("create_user",Object.fromEntries(f),"用户账号已创建。");event.currentTarget.reset();}}><input name="displayName" placeholder="姓名" required/><input name="email" type="email" placeholder="name@company.com" required/><input name="password" type="password" minLength={6} placeholder="初始密码（至少 6 位）" required/><select name="role" defaultValue="developer"><option value="developer">开发者</option><option value="viewer">查看者</option><option value="auditor">审计员</option><option value="tenant_admin">租户管理员</option></select><button disabled={busy}>创建账号 <Icon name="arrow"/></button></form></AdminForm><AdminLedger headings={["用户","状态","角色","最近登录","操作"]}>{data.users.map(user=><article key={user.id}><div><b>{user.displayName}</b><small>{user.email}</small></div><span className={`admin-status ${user.status}`}><i/>{user.status === "active" ? "正常" : "已停用"}</span><select defaultValue={user.role} onChange={event=>void action("update_user",{id:user.id,status:user.status,role:event.target.value},"用户角色已更新。")}>{["tenant_admin","developer","auditor","viewer"].map(role=><option value={role} key={role}>{role}</option>)}</select><code>{user.lastLoginAt ? new Date(user.lastLoginAt*1000).toLocaleDateString("zh-CN") : "尚未登录"}</code><button onClick={()=>void action("update_user",{id:user.id,role:user.role,status:user.status === "active" ? "disabled" : "active"},user.status === "active" ? "用户已停用。" : "用户已启用。")} disabled={busy}>{user.status === "active" ? "停用" : "启用"}</button></article>)}</AdminLedger></div>;
}

function LlmsView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="接入模型" note="API 密钥不写入数据库，只保存部署环境中的密钥变量名。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void action("save_llm",Object.fromEntries(f),"LLM 配置已保存。");event.currentTarget.reset();}}><input name="displayName" placeholder="显示名称，如 GPT-5.2" required/><input name="provider" placeholder="供应商，如 OpenAI" required/><input name="modelId" placeholder="上游模型 ID" required/><input name="baseUrl" type="url" placeholder="https://api.example.com/v1" required/><input name="secretRef" placeholder="密钥变量，如 OPENAI_API_KEY" pattern="[A-Z][A-Z0-9_]{2,63}" required/><input name="requestsPerMinute" type="number" min="1" defaultValue="60"/><button disabled={busy}>保存配置 <Icon name="arrow"/></button></form></AdminForm><div className="admin-card-grid">{data.llms.length ? data.llms.map(llm=><article key={llm.id}><span>{llm.provider}</span><h3>{llm.displayName}</h3><p>{llm.modelId}</p><div><code>{llm.baseUrl}</code><small>{llm.requestsPerMinute} RPM</small></div><footer><i/>ACTIVE · {llm.secretRef}</footer></article>) : <EmptyState title="尚未接入 LLM" text="从上方配置供应商、模型 ID、地址与密钥引用。"/>}</div></div>;
}

function ArtifactsView({ data, busy, upload }: {data:Snapshot;busy:boolean;upload:(form:HTMLFormElement)=>Promise<void>}) {
  return <div className="admin-module"><AdminForm title="上传 Agent 工具源文件" note="根据项目真实构建产物，仅接受 Windows x64 NSIS（.exe）和 MSI（.msi），最大 120 MB。"><form className="artifact-form" encType="multipart/form-data" onSubmit={event=>{event.preventDefault();void upload(event.currentTarget);}}><input name="label" placeholder="显示名称，如 Windows x64 安装程序" required/><label className="admin-file"><Icon name="download"/><span>选择 .exe 或 .msi 文件</span><input name="file" type="file" accept=".exe,.msi" required/></label><button disabled={busy}>{busy ? "正在上传…" : "上传源文件"} <Icon name="arrow"/></button></form></AdminForm><AdminLedger headings={["源文件","格式","大小","SHA256","状态"]}>{data.artifacts.map(item=><article key={item.id}><div><b>{item.label}</b><small>{item.fileName}</small></div><span>{item.format}</span><code>{formatBytes(item.sizeBytes)}</code><code title={item.sha256}>{item.sha256.slice(0,12)}…</code><a href={`/api/admin/artifacts/${item.id}`}>下载校验</a></article>)}</AdminLedger></div>;
}

function ReleasesView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建升级版本" note="版本必须绑定已上传的真实安装包；发布后才会进入公开下载链路。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);const input={...Object.fromEntries(f),mandatory:f.get("mandatory")==="on"};void action("create_release",input,"版本配置已创建。");event.currentTarget.reset();}}><input name="version" placeholder="版本号，如 0.1.1" pattern="\d+\.\d+\.\d+.*" required/><select name="artifactId" required defaultValue=""><option value="" disabled>选择已上传安装包</option>{data.artifacts.map(item=><option key={item.id} value={item.id}>{item.label} · {item.fileName}</option>)}</select><select name="channel" defaultValue="stable"><option value="stable">Stable</option><option value="beta">Beta</option><option value="internal">Internal</option></select><select name="status" defaultValue="draft"><option value="draft">草稿</option><option value="published">立即发布</option></select><textarea name="notes" placeholder="更新说明"/><label className="admin-check"><input name="mandatory" type="checkbox"/>强制升级</label><button disabled={busy || !data.artifacts.length}>创建版本 <Icon name="arrow"/></button></form></AdminForm><AdminLedger headings={["版本","渠道","安装包","升级策略","状态"]}>{data.releases.map(item=><article key={item.id}><div><b>v{item.version}</b><small>{item.notes || "无更新说明"}</small></div><span>{item.channel.toUpperCase()}</span><span>{item.fileName}</span><span>{item.mandatory ? "强制升级" : "用户可选"}</span><span className={`admin-status ${item.status}`}><i/>{item.status === "published" ? "已发布" : "草稿"}</span></article>)}</AdminLedger></div>;
}

function BillingView({ data, busy, action }: ViewProps) {
  return <div className="admin-module"><AdminForm title="创建收费套餐" note="金额使用最小货币单位保存；功能权益每行一项。支付渠道与自动扣费将在后续独立接入。"><form onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void action("save_plan",Object.fromEntries(f),"收费套餐已保存。");event.currentTarget.reset();}}><input name="name" placeholder="套餐名称" required/><div className="admin-money"><select name="currency"><option value="CNY">CNY</option><option value="USD">USD</option></select><input name="monthlyPriceCents" type="number" min="0" placeholder="月费（分）" required/></div><input name="requestLimit" type="number" min="0" placeholder="每月请求额度，0 表示不限" required/><input name="seatLimit" type="number" min="1" placeholder="席位数" required/><textarea name="features" placeholder={'功能权益，每行一项\n统一模型网关\n用量分析'}/><button disabled={busy}>保存套餐 <Icon name="arrow"/></button></form></AdminForm><div className="pricing-grid">{data.plans.length ? data.plans.map(plan=><article key={plan.id}><span>{plan.status.toUpperCase()}</span><h3>{plan.name}</h3><strong>{plan.currency === "CNY" ? "¥" : "$"}{(plan.monthlyPriceCents/100).toLocaleString()}<small>/ 月</small></strong><p>{plan.seatLimit} 个席位 · {plan.requestLimit ? `${plan.requestLimit.toLocaleString()} 次请求` : "请求不限"}</p><ul>{safeFeatures(plan.features).map(item=><li key={item}>{item}</li>)}</ul></article>) : <EmptyState title="尚未配置收费套餐" text="创建套餐后，这里会形成独立的商业配置视图。"/>}</div></div>;
}

type ViewProps = { data: Snapshot; busy: boolean; action: (name:string,input:Record<string,unknown>,success:string)=>Promise<void> };
function AdminForm({title,note,children}:{title:string;note:string;children:React.ReactNode}){return <section className="admin-form"><div><p>CONFIGURATION</p><h2>{title}</h2><span>{note}</span></div>{children}</section>}
function AdminLedger({headings,children}:{headings:string[];children:React.ReactNode}){return <section className="admin-ledger"><header>{headings.map(item=><span key={item}>{item}</span>)}</header>{children}</section>}
function EmptyState({title,text}:{title:string;text:string}){return <div className="admin-empty"><i/><h3>{title}</h3><p>{text}</p></div>}
function adminDescription(id:string){return ({dashboard:"跨用户、模型、发布与商业配置的独立管理视角。",users:"创建账号、控制角色与成员生命周期。",llms:"配置供应商、模型路由地址、密钥引用与速率边界。",artifacts:"管理管理员上传的真实 Agent 安装包源文件。",releases:"把真实安装包组织成可审计的版本与升级策略。",billing:"定义套餐价格、席位、请求额度与商业权益。"} as Record<string,string>)[id]}
function formatBytes(value:number){return value>1024*1024?`${(value/1024/1024).toFixed(1)} MB`:`${Math.round(value/1024)} KB`}
function safeFeatures(value:string){try{const result=JSON.parse(value);return Array.isArray(result)?result:[]}catch{return []}}
