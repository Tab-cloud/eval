"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useTheme } from "./useTheme";

const nav: { id: string; label: string; icon: IconName }[] = [
  { id: "overview", label: "总览", icon: "grid" }, { id: "models", label: "模型广场", icon: "model" },
  { id: "routes", label: "路由策略", icon: "route" }, { id: "keys", label: "API 密钥", icon: "key" },
  { id: "users", label: "用户与组织", icon: "users" }, { id: "access", label: "权限策略", icon: "shield" },
  { id: "analytics", label: "用量分析", icon: "chart" }, { id: "downloads", label: "下载中心", icon: "download" },
];

const models = [
  { mark: "O", name: "GPT-5.2", vendor: "OpenAI", status: "运行中", latency: "682 ms", usage: "41.8%", color: "#edf1ff" },
  { mark: "C", name: "Claude 4.5 Sonnet", vendor: "Anthropic", status: "运行中", latency: "741 ms", usage: "27.4%", color: "#f6e7db" },
  { mark: "G", name: "Gemini 3 Pro", vendor: "Google", status: "运行中", latency: "890 ms", usage: "18.2%", color: "#dfeaff" },
  { mark: "D", name: "DeepSeek V3.2", vendor: "DeepSeek", status: "维护中", latency: "1.2 s", usage: "8.6%", color: "#e1e8ff" },
];

function Metric({ label, value, change, children }: { label: string; value: string; change: string; children?: React.ReactNode }) {
  return <article className="metric panel"><div className="eyebrow">{label}</div><div className="metric-row"><strong>{value}</strong><span className="trend">{change}</span></div>{children}</article>;
}

function Overview({ onCreate }: { onCreate: () => void }) {
  return <>
    <section className="hero panel">
      <div><div className="live"><span /> 所有系统运行正常</div><h1>让每一次智能调用<br/><em>稳定抵达。</em></h1><p>统一连接、路由与治理全球领先模型。让团队只关注创造，而非基础设施。</p><div className="hero-actions"><button className="primary" onClick={onCreate}><Icon name="plus"/>创建 API 密钥</button><button className="secondary">查看开发文档 <Icon name="arrow"/></button></div></div>
      <div className="orbital" aria-hidden="true"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="core"><span>L</span></div><span className="sat s1">O</span><span className="sat s2">A</span><span className="sat s3">G</span></div>
    </section>
    <section className="metric-grid">
      <Metric label="今日请求" value="1.84M" change="↑ 12.8%"><div className="sparkline"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></Metric>
      <Metric label="本月消费" value="$ 8,429" change="预算 63%"><div className="meter"><span style={{width:"63%"}}/></div></Metric>
      <Metric label="平均延迟" value="726 ms" change="↓ 8.3%"><div className="micro"><span>全球边缘节点</span><b>28</b></div></Metric>
      <Metric label="请求成功率" value="99.98%" change="SLA 达标"><div className="micro"><span>过去 30 天</span><b className="ok">优秀</b></div></Metric>
    </section>
    <section className="dashboard-grid">
      <article className="panel chart-card"><div className="card-head"><div><div className="eyebrow">请求趋势</div><h2>模型调用量</h2></div><div className="seg"><button className="active">7 天</button><button>30 天</button><button>90 天</button></div></div><div className="chart"><div className="grid-lines"/><svg viewBox="0 0 700 180" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8ba6ff" stopOpacity=".34"/><stop offset="1" stopColor="#8ba6ff" stopOpacity="0"/></linearGradient></defs><path className="area" d="M0 150 C65 135 82 72 145 94 S230 148 285 92 S368 42 420 78 S510 142 560 79 S640 36 700 42 L700 180 L0 180Z"/><path className="line" d="M0 150 C65 135 82 72 145 94 S230 148 285 92 S368 42 420 78 S510 142 560 79 S640 36 700 42"/></svg><div className="chart-labels"><span>周一</span><span>周二</span><span>周三</span><span>周四</span><span>周五</span><span>周六</span><span>今天</span></div></div></article>
      <article className="panel activity-card"><div className="card-head"><div><div className="eyebrow">实时活动</div><h2>调用动态</h2></div><button className="icon-btn"><Icon name="chevron"/></button></div><div className="activity-list">{[["GPT-5.2","产品研发组","刚刚","684ms"],["Claude 4.5","内容策略组","12 秒前","731ms"],["Gemini 3 Pro","数据分析组","28 秒前","902ms"],["GPT-5.2","智能客服组","41 秒前","612ms"]].map((x,i)=><div className="activity" key={i}><span className="pulse"/><div><b>{x[0]}</b><small>{x[1]} · {x[2]}</small></div><code>{x[3]}</code></div>)}</div></article>
    </section>
    <section className="panel models-card"><div className="card-head"><div><div className="eyebrow">模型网络</div><h2>活跃模型</h2></div><button className="text-btn">管理全部模型 <Icon name="arrow"/></button></div><div className="model-table"><div className="tr th"><span>模型</span><span>状态</span><span>平均延迟</span><span>流量占比</span><span/></div>{models.map(m=><div className="tr" key={m.name}><span className="model-name"><i style={{background:m.color}}>{m.mark}</i><span><b>{m.name}</b><small>{m.vendor}</small></span></span><span><i className={`status ${m.status === "运行中" ? "online":"maintenance"}`}>{m.status}</i></span><code>{m.latency}</code><span className="usage"><span><i style={{width:m.usage}}/></span>{m.usage}</span><button className="icon-btn"><Icon name="chevron"/></button></div>)}</div></section>
  </>;
}

function Coming({ id }: { id: string }) {
  const item = nav.find(n => n.id === id) ?? nav[0];
  return <section className="subpage"><div className="subhero panel"><div className="subicon"><Icon name={item.icon}/></div><div><div className="eyebrow">LUBAN CONTROL PLANE</div><h1>{item.label}</h1><p>此模块的产品架构与权限边界已经就绪，下一阶段将连接真实数据与业务工作流。</p></div></div><div className="placeholder-grid"><div className="panel placeholder-main"><span/><span/><span/><span/></div><div className="panel placeholder-side"><i/><i/><i/></div></div></section>;
}

export function Dashboard() {
  const [active,setActive] = useState("overview"); const [modal,setModal] = useState(false); const [search,setSearch] = useState(false); const [toast,setToast] = useState("");
  const { theme, toggleTheme } = useTheme();
  useEffect(()=>{const fn=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setSearch(true)}if(e.key==="Escape"){setModal(false);setSearch(false)}};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[]);
  const save=()=>{setModal(false);setToast("API 密钥已创建，请立即安全保存");setTimeout(()=>setToast(""),3000)};
  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span className="brandmark">L</span><span><b>LUBAN</b><small>AI CONTROL PLANE</small></span></div><nav>{nav.map(n=><button key={n.id} className={active===n.id?"active":""} onClick={()=>setActive(n.id)}><Icon name={n.icon}/><span>{n.label}</span>{n.id==="models"&&<i>24</i>}</button>)}</nav><div className="side-bottom"><button><Icon name="settings"/><span>系统设置</span></button><a href="/login"><Icon name="logout"/><span>退出登录</span></a><div className="tenant"><div className="avatar">LY</div><div><b>林屿</b><small>鲁班科技 · 管理员</small></div><Icon name="chevron"/></div></div></aside>
    <main><header><button className="search" onClick={()=>setSearch(true)}><Icon name="search"/><span>搜索模型、用户或密钥</span><kbd>⌘ K</kbd></button><div className="header-actions"><span className="region"><i/> CN East</span><button className="icon-btn theme-toggle" onClick={toggleTheme} aria-label={theme==="dark"?"切换到浅色模式":"切换到深色模式"} title={theme==="dark"?"浅色模式":"深色模式"}><Icon name={theme==="dark"?"sun":"moon"}/></button><button className="icon-btn" aria-label="通知"><Icon name="bell"/><i className="notify"/></button><button className="avatar small" aria-label="账户菜单">LY</button></div></header><div className="content"><div className="page-title"><div><p>2026 年 7 月 18 日 · 星期六</p><h2>{active==="overview"?"下午好，林屿。":nav.find(n=>n.id===active)?.label}</h2></div>{active==="overview"&&<div className="sync"><Icon name="clock"/> 30 秒前更新</div>}</div>{active==="overview"?<Overview onCreate={()=>setModal(true)}/>:<Coming id={active}/>}<footer><span>Luban AI Cloud · Enterprise</span><span>服务状态 · API 文档 · 安全中心</span></footer></div></main>
    {modal&&<div className="overlay" onMouseDown={e=>e.currentTarget===e.target&&setModal(false)}><div className="modal"><div className="modal-top"><div className="subicon"><Icon name="key"/></div><button onClick={()=>setModal(false)}>×</button></div><div className="eyebrow">凭证管理</div><h2>创建 API 密钥</h2><p>密钥仅会完整展示一次。所有调用都将绑定当前租户与权限策略。</p><label>密钥名称<input autoFocus defaultValue="Production Gateway"/></label><label>权限范围<select defaultValue="models:invoke"><option value="models:invoke">调用已授权模型</option><option value="read:all">只读访问</option><option value="admin">租户管理员</option></select></label><div className="scope-note"><Icon name="shield"/><span><b>最小权限原则</b><small>建议为不同环境创建独立密钥。</small></span></div><button className="primary full" onClick={save}>创建并显示密钥 <Icon name="arrow"/></button></div></div>}
    {search&&<div className="overlay search-overlay" onMouseDown={e=>e.currentTarget===e.target&&setSearch(false)}><div className="command"><div><Icon name="search"/><input autoFocus placeholder="搜索模型、团队、文档或命令…"/></div><p>快速前往</p>{nav.slice(0,5).map(n=><button key={n.id} onClick={()=>{setActive(n.id);setSearch(false)}}><Icon name={n.icon}/><span>{n.label}</span><kbd>↵</kbd></button>)}</div></div>}
    {toast&&<div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}
