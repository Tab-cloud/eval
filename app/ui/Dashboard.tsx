"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useTheme } from "./useTheme";

type DashboardUser = { email: string; displayName: string; tenantName: string; role: "platform_admin" | "tenant_admin" | "developer" | "auditor" | "viewer" };

const nav: { id: string; label: string; icon: IconName }[] = [
  { id: "overview", label: "总览", icon: "grid" },
  { id: "models", label: "模型", icon: "model" },
  { id: "routes", label: "路由", icon: "route" },
  { id: "keys", label: "API 密钥", icon: "key" },
  { id: "users", label: "用户与组织", icon: "users" },
  { id: "access", label: "权限策略", icon: "shield" },
  { id: "analytics", label: "用量分析", icon: "chart" },
  { id: "downloads", label: "下载中心", icon: "download" },
];

const models = [
  { mark: "O", name: "GPT-5.2", vendor: "OpenAI", state: "正常", latency: "682 ms", usage: "41.8%", tone: "blue" },
  { mark: "C", name: "Claude 4.5 Sonnet", vendor: "Anthropic", state: "正常", latency: "741 ms", usage: "27.4%", tone: "sand" },
  { mark: "G", name: "Gemini 3 Pro", vendor: "Google", state: "正常", latency: "890 ms", usage: "18.2%", tone: "sky" },
  { mark: "D", name: "DeepSeek V3.2", vendor: "DeepSeek", state: "维护", latency: "1.2 s", usage: "8.6%", tone: "indigo" },
];

const moduleDetails: Record<string, { chapter: string; kicker: string; title: string; description: string; stats: [string, string][]; rows: [string, string, string][] }> = {
  models: { chapter: "MODEL FIELD", kicker: "模型集合", title: "选择智能，\n不被供应商束缚。", description: "统一查看模型能力、健康状态与租户授权，让每个团队在正确的任务上调用正确的模型。", stats: [["24", "可用模型"], ["4", "模型供应商"], ["99.98%", "网关可用率"]], rows: [["GPT-5.2", "生产可用", "682 ms"], ["Claude 4.5 Sonnet", "生产可用", "741 ms"], ["Gemini 3 Pro", "生产可用", "890 ms"]] },
  routes: { chapter: "ROUTING LAYER", kicker: "智能路由", title: "每一次请求，\n都走向更好的答案。", description: "以延迟、成本、地域和健康状态为信号，在模型之间完成可解释的流量调度与故障转移。", stats: [["8", "活动策略"], ["32 ms", "路由开销"], ["0.02%", "故障转移率"]], rows: [["生产默认路由", "运行中", "68% 流量"], ["低延迟路由", "运行中", "21% 流量"], ["分析任务路由", "观察中", "11% 流量"]] },
  keys: { chapter: "CREDENTIAL VAULT", kicker: "访问凭证", title: "授权调用，\n不交出控制权。", description: "为环境与团队分别签发最小权限凭证，所有使用、轮换与撤销动作都进入审计链。", stats: [["12", "活动密钥"], ["3", "权限范围"], ["0", "异常调用"]], rows: [["Production Gateway", "models:invoke", "2 分钟前"], ["Analytics Readonly", "read:all", "1 小时前"], ["Staging Agent", "models:invoke", "昨天"]] },
  users: { chapter: "ORGANIZATION", kicker: "用户与组织", title: "让协作扩张，\n让边界保持清晰。", description: "以租户、团队和成员关系组织协作，每个身份只看见被授权的资源与操作。", stats: [["36", "组织成员"], ["6", "协作团队"], ["4", "待处理邀请"]], rows: [["产品研发组", "12 名成员", "正常"], ["智能硬件组", "9 名成员", "正常"], ["数据分析组", "7 名成员", "正常"]] },
  access: { chapter: "GOVERNANCE", kicker: "权限策略", title: "自主运行，\n始终处于治理之中。", description: "角色权限、资源归属与租户隔离共同组成不可绕过的控制边界。", stats: [["5", "系统角色"], ["18", "生效策略"], ["100%", "审计覆盖"]], rows: [["租户管理员", "全局管理", "5 名成员"], ["开发者", "模型调用", "18 名成员"], ["审计员", "只读审计", "3 名成员"]] },
  analytics: { chapter: "SIGNAL ROOM", kicker: "用量分析", title: "看见消耗，\n也看见价值。", description: "从团队、密钥、模型与错误维度理解调用质量，让成本决策建立在真实信号之上。", stats: [["12.6M", "七日请求"], ["$8,429", "本月消费"], ["12.8%", "调用增长"]], rows: [["产品研发组", "4.8M 请求", "$3,214"], ["智能客服组", "3.1M 请求", "$2,087"], ["数据分析组", "2.4M 请求", "$1,662"]] },
  downloads: { chapter: "RELEASE VAULT", kicker: "工具发布", title: "把能力带回，\n你的工程现场。", description: "公开安装包由管理员审核与上传；正式发布前不展示虚假文件、大小或下载地址。", stats: [["2", "实际构建格式"], ["0", "当前公开包"], ["PUBLIC", "访客权限"]], rows: [["Windows x64 安装程序", "NSIS · .exe", "等待管理员上传"], ["Windows x64 企业部署包", "MSI · .msi", "等待管理员上传"], ["公开下载目录", "无需登录", "已就绪"]] },
};

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    type Particle = { x: number; y: number; vx: number; vy: number; radius: number; alpha: number; pulse: number; color: number };
    let width = 0;
    let height = 0;
    let frame = 0;
    let particles: Particle[] = [];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionScale = reduceMotion ? .28 : 1;

    const spawn = (): Particle => {
      const side = Math.floor(Math.random() * 4);
      const edgeX = Math.max(70, Math.min(190, width * .13));
      const edgeY = Math.max(64, Math.min(150, height * .16));
      let x = Math.random() * width;
      let y = Math.random() * height;
      if (side === 0) y = Math.random() * edgeY;
      if (side === 1) x = width - Math.random() * edgeX;
      if (side === 2) y = height - Math.random() * edgeY;
      if (side === 3) x = Math.random() * edgeX;
      const angle = Math.random() * Math.PI * 2;
      const speed = .18 + Math.random() * .42;
      return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 1.7 + Math.random() * 2.7, alpha: .38 + Math.random() * .48, pulse: Math.random() * Math.PI * 2, color: Math.floor(Math.random() * 3) };
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = reduceMotion ? width < 600 ? 14 : 32 : width < 600 ? 24 : 54;
      particles = Array.from({ length: count }, spawn);
    };

    const render = (move: boolean) => {
      context.clearRect(0, 0, width, height);
      const dark = document.documentElement.dataset.theme === "dark";
      const palette = dark ? ["#52bdff", "#e2f4ff", "#7cd2ff"] : ["#347bb5", "#7896af", "#5d9ed0"];
      const edgeX = Math.max(70, Math.min(190, width * .13));
      const edgeY = Math.max(64, Math.min(150, height * .16));

      particles.forEach((particle, index) => {
        if (move) {
          particle.vx = Math.max(-.78, Math.min(.78, particle.vx + (Math.random() - .5) * .055 * motionScale));
          particle.vy = Math.max(-.78, Math.min(.78, particle.vy + (Math.random() - .5) * .055 * motionScale));
          particle.x += particle.vx * motionScale;
          particle.y += particle.vy * motionScale;
          particle.pulse += (.018 + (index % 5) * .002) * motionScale;
          if (particle.x < 0 || particle.x > width) particle.vx *= -1;
          if (particle.y < 0 || particle.y > height) particle.vy *= -1;
          particle.x = Math.max(0, Math.min(width, particle.x));
          particle.y = Math.max(0, Math.min(height, particle.y));
          const enteredCenter = particle.x > edgeX && particle.x < width - edgeX && particle.y > edgeY && particle.y < height - edgeY;
          if (enteredCenter) Object.assign(particle, spawn());
        }

        const pulse = .72 + Math.sin(particle.pulse) * .28;
        context.beginPath();
        context.fillStyle = palette[particle.color];
        context.globalAlpha = particle.alpha * pulse;
        context.shadowColor = palette[particle.color];
        context.shadowBlur = dark ? 14 : 9;
        context.arc(particle.x, particle.y, particle.radius * (.86 + pulse * .18), 0, Math.PI * 2);
        context.fill();
        if (index % 7 === 0) {
          context.beginPath();
          context.globalAlpha = particle.alpha * .2 * pulse;
          context.lineWidth = 1;
          context.strokeStyle = palette[particle.color];
          context.arc(particle.x, particle.y, particle.radius * 2.7, 0, Math.PI * 2);
          context.stroke();
        }
      });
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    };

    const tick = () => {
      render(true);
      frame = window.requestAnimationFrame(tick);
    };

    resize();
    tick();
    const themeObserver = new MutationObserver(() => render(false));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      themeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-field" aria-hidden="true"/>;
}

function Metric({ label, value, note, tone, featured = false }: { label: string; value: string; note: string; tone?: string; featured?: boolean }) {
  return <article className={`metric-card surface${featured ? " featured" : ""}`}>
    <div className="metric-top"><div className={`metric-symbol ${tone ?? ""}`}><span/></div><p>{label}</p></div>
    <div className="metric-value"><strong>{value}</strong><small>{note}</small></div>
    {featured && <div className="metric-bars" aria-hidden="true">{[42, 58, 46, 72, 65, 84, 76, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }}/>)}</div>}
  </article>;
}

function Overview({ onCreate }: { onCreate: () => void }) {
  return <>
    <section className="overview-hero surface">
      <div className="hero-refraction" aria-hidden="true"/>
      <div className="hero-copy"><div className="status-label"><span/>服务运行正常</div><h1>一个入口。<br/>连接所有模型。</h1><p>在一个清晰、安全的控制台中管理模型、访问权限和每一次调用。</p><div className="hero-actions"><button className="primary" onClick={onCreate}><Icon name="plus"/>创建 API 密钥</button><button className="plain-button">阅读开发文档 <Icon name="arrow"/></button></div></div>
      <div className="gateway-card">
        <div className="gateway-head"><span>Gateway</span><span className="availability">99.98%</span></div>
        <div className="gateway-score"><strong>1.84M</strong><span>今日请求</span></div>
        <div className="gateway-list">
          <div><span><i className="dot green"/>亚太</span><b>18 ms</b></div>
          <div><span><i className="dot green"/>北美</span><b>42 ms</b></div>
          <div><span><i className="dot green"/>欧洲</span><b>36 ms</b></div>
        </div>
      </div>
    </section>

    <section className="content-section metrics-section">
      <div className="section-intro"><div><p>实时态势</p><h2>今天，一切运行顺畅。</h2></div><span>所有关键指标均在预期范围内</span></div>
      <div className="metric-grid">
        <Metric label="今日请求" value="1.84M" note="较昨日增长 12.8%" tone="blue" featured/>
        <Metric label="本月消费" value="$8,429" note="已使用预算的 63%" tone="graphite"/>
        <Metric label="平均延迟" value="726 ms" note="较上周降低 8.3%" tone="violet"/>
        <Metric label="成功率" value="99.98%" note="过去 30 天" tone="green"/>
      </div>
    </section>

    <section className="content-section traffic-section">
      <div className="section-intro"><div><p>流量脉络</p><h2>让每一次调用都清晰可见。</h2></div><span>过去 7 天 · 实时更新</span></div>
      <div className="dashboard-grid"><article className="surface chart-card">
        <div className="card-head"><div><p>请求趋势</p><h2>模型调用量</h2></div><div className="segmented"><button className="active">7 天</button><button>30 天</button><button>90 天</button></div></div>
        <div className="chart-summary"><strong>12.6M</strong><span>过去 7 天</span></div>
        <div className="chart"><div className="grid-lines"/><svg viewBox="0 0 700 180" preserveAspectRatio="none" aria-label="过去七天的调用量折线图"><path className="line" d="M0 150 C65 135 82 72 145 94 S230 148 285 92 S368 42 420 78 S510 142 560 79 S640 36 700 42"/></svg><div className="chart-labels"><span>周一</span><span>周二</span><span>周三</span><span>周四</span><span>周五</span><span>周六</span><span>今天</span></div></div>
      </article>
      <article className="surface activity-card">
        <div className="card-head"><div><p>实时活动</p><h2>最近调用</h2></div><button className="round-button" aria-label="查看全部"><Icon name="arrow"/></button></div>
        <div className="activity-list">{[["GPT-5.2","产品研发组","刚刚","684 ms"],["Claude 4.5","内容策略组","12 秒前","731 ms"],["Gemini 3 Pro","数据分析组","28 秒前","902 ms"],["GPT-5.2","智能客服组","41 秒前","612 ms"]].map((item, i) => <div className="activity" key={i}><span className="activity-mark">{item[0][0]}</span><div><b>{item[0]}</b><small>{item[1]} · {item[2]}</small></div><code>{item[3]}</code></div>)}</div>
      </article></div>
    </section>

    <section className="content-section models-section">
      <div className="section-intro"><div><p>模型目录</p><h2>模型，始终在最佳状态。</h2></div><button className="plain-button">管理模型 <Icon name="arrow"/></button></div>
      <div className="surface models-card">
        <div className="model-table"><div className="model-row model-header"><span>模型</span><span>状态</span><span>平均延迟</span><span>流量占比</span><span/></div>{models.map(model => <div className="model-row" key={model.name}><span className="model-name"><i className={model.tone}>{model.mark}</i><span><b>{model.name}</b><small>{model.vendor}</small></span></span><span className={`model-state ${model.state === "正常" ? "online" : "maintenance"}`}><i/>{model.state}</span><code>{model.latency}</code><span className="usage"><span><i style={{ width: model.usage }}/></span>{model.usage}</span><button className="round-button small" aria-label={`查看 ${model.name}`}><Icon name="chevron"/></button></div>)}</div>
      </div>
    </section>
  </>;
}

function Coming({ id }: { id: string }) {
  const item = nav.find(entry => entry.id === id) ?? nav[0];
  const detail = moduleDetails[id] ?? moduleDetails.models;
  return <section className="subpage cinematic-subpage">
    <div className="subpage-chapter"><span>CONTROL ROOM</span><i/><span>{detail.chapter}</span></div>
    <div className="subhero surface"><div className="subhero-copy"><p>{detail.kicker}</p><h1>{detail.title.split("\n").map((line, index) => <span key={line}>{line}{index === 0 && <br/>}</span>)}</h1><strong>{detail.description}</strong></div><div className="subhero-signal"><div className="subicon"><Icon name={item.icon}/></div><small>MODULE / {item.id.toUpperCase()}</small><b>ONLINE</b></div></div>
    <div className="sub-stat-grid">{detail.stats.map(([value, label], index) => <article className="surface" key={label}><span>0{index + 1}</span><strong>{value}</strong><small>{label}</small></article>)}</div>
    <div className="sub-ledger"><div className="sub-ledger-head"><span>LIVE DIRECTORY</span><span>STATUS / NOW</span></div>{detail.rows.map(([name, meta, state], index) => <article key={name}><span>0{index + 1}</span><h2>{name}</h2><p>{meta}</p><b><i/>{state}</b><button aria-label={`查看 ${name}`}><Icon name="arrow"/></button></article>)}</div>
  </section>;
}

export function Dashboard({ currentUser }: { currentUser: DashboardUser }) {
  const [active, setActive] = useState("overview");
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState(false);
  const [toast, setToast] = useState("");
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearch(true); }
      if (event.key === "Escape") { setModal(false); setSearch(false); setGovernanceOpen(false); setMobileMenu(false); setAccountOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const saveKey = () => { setModal(false); setToast("API 密钥已创建，请立即安全保存"); setTimeout(() => setToast(""), 3000); };
  const navigate = (id: string) => { setActive(id); setGovernanceOpen(false); setMobileMenu(false); setAccountOpen(false); };
  const logout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout failed");
      location.href = "/login";
    } catch {
      setToast("退出失败，请稍后重试");
      setLogoutLoading(false);
    }
  };
  const governanceActive = ["keys", "users", "access"].includes(active);
  const avatarText = currentUser.displayName.slice(0, 2).toUpperCase();
  const roleLabel = currentUser.role === "tenant_admin" ? "租户管理员" : currentUser.role === "platform_admin" ? "平台管理员" : currentUser.role === "developer" ? "开发者" : currentUser.role === "auditor" ? "审计员" : "查看者";
  const isAdmin = currentUser.role === "tenant_admin" || currentUser.role === "platform_admin";

  return <div className="shell">
    <ParticleField/>
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand top-brand" onClick={() => navigate("overview")} aria-label="返回总览"><span className="console-brand-mark"><img src="/favicon.svg" alt=""/></span><span><b>Eval</b><small>Control Room</small></span></button>
        <nav className="topnav" aria-label="主要导航">
          <button className={active === "overview" ? "active" : ""} onClick={() => navigate("overview")}>总览</button>
          <button className={active === "models" ? "active" : ""} onClick={() => navigate("models")}>模型</button>
          <button className={active === "routes" ? "active" : ""} onClick={() => navigate("routes")}>路由</button>
          <div className="nav-group"><button className={governanceActive ? "active" : ""} onClick={() => setGovernanceOpen(open => !open)}>治理 <Icon name="chevron"/></button>{governanceOpen && <div className="nav-popover"><p>访问与组织</p>{nav.filter(item => ["keys", "users", "access"].includes(item.id)).map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => navigate(item.id)}><span className="nav-popover-icon"><Icon name={item.icon}/></span><span><b>{item.label}</b><small>{item.id === "keys" ? "凭证与调用范围" : item.id === "users" ? "成员、团队与邀请" : "角色和资源边界"}</small></span><Icon name="chevron"/></button>)}</div>}</div>
          <button className={active === "analytics" ? "active" : ""} onClick={() => navigate("analytics")}>分析</button>
          <button className={active === "downloads" ? "active" : ""} onClick={() => navigate("downloads")}>下载</button>
        </nav>
        <div className="header-actions"><button className="command-trigger" onClick={() => setSearch(true)}><Icon name="search"/><span>搜索</span><kbd>⌘ K</kbd></button><span className="region"><i/>CN East</span><button className="round-button theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}><Icon name={theme === "dark" ? "sun" : "moon"}/></button><button className="round-button" aria-label="通知"><Icon name="bell"/><i className="notify"/></button><button className={`avatar account-button${accountOpen ? " active" : ""}`} onClick={() => setAccountOpen(open => !open)} aria-expanded={accountOpen} aria-haspopup="menu" aria-label={`${currentUser.displayName}，${roleLabel}`}>{avatarText}</button>{accountOpen && <div className="account-popover" role="menu"><div className="account-popover-head"><span className="avatar">{avatarText}</span><div><b>{currentUser.displayName}</b><small>{currentUser.email}</small></div></div><div className="account-context"><span>当前组织</span><b>{currentUser.tenantName}</b><small>{roleLabel}</small></div>{isAdmin && <a className="account-admin-link" href="/admin" role="menuitem"><Icon name="shield"/><span><b>管理员控制室</b><small>用户、模型、发布与收费配置</small></span><Icon name="arrow"/></a>}<button className="account-logout" onClick={() => void logout()} disabled={logoutLoading} role="menuitem"><Icon name="logout"/><span>{logoutLoading ? "正在退出…" : "退出登录"}</span><Icon name="arrow"/></button></div>}</div>
      </div>
    </header>
    <main>
      <div className="content"><div className="console-rail"><span>EVAL / EMBEDDED INTELLIGENCE CONTROL PLANE</span><span>CN EAST · LIVE</span></div><div className="page-title"><div><p>2026 年 7 月 19 日</p><h2>{active === "overview" ? `欢迎回来，${currentUser.displayName}` : nav.find(item => item.id === active)?.label}</h2></div>{active === "overview" && <div className="sync"><Icon name="clock"/>刚刚更新</div>}</div>{active === "overview" ? <Overview onCreate={() => setModal(true)}/> : <Coming id={active}/>}<footer><span>EVAL AGENT / CONTROL ROOM</span><span>{currentUser.tenantName}</span><span>© 2026 CONNECTING TECHNOLOGY</span></footer></div>
    </main>

    <nav className="mobile-dock" aria-label="移动端导航"><button className={active === "overview" ? "active" : ""} onClick={() => navigate("overview")}><Icon name="grid"/><span>总览</span></button><button className={active === "models" ? "active" : ""} onClick={() => navigate("models")}><Icon name="model"/><span>模型</span></button><button className={active === "routes" ? "active" : ""} onClick={() => navigate("routes")}><Icon name="route"/><span>路由</span></button><button className={active === "analytics" ? "active" : ""} onClick={() => navigate("analytics")}><Icon name="chart"/><span>分析</span></button><button className={mobileMenu || ["keys","users","access","downloads"].includes(active) ? "active" : ""} onClick={() => setMobileMenu(true)}><Icon name="more"/><span>更多</span></button></nav>

    {mobileMenu && <div className="overlay mobile-menu-overlay" onMouseDown={event => event.currentTarget === event.target && setMobileMenu(false)}><div className="mobile-menu"><div className="mobile-menu-handle"/><div className="mobile-menu-head"><div><p>Eval Control Room</p><h2>更多功能</h2></div><button onClick={() => setMobileMenu(false)} aria-label="关闭">×</button></div><div className="mobile-menu-grid">{nav.filter(item => ["keys","users","access","downloads"].includes(item.id)).map(item => <button key={item.id} onClick={() => navigate(item.id)}><span><Icon name={item.icon}/></span><b>{item.label}</b><small>{item.id === "keys" ? "凭证管理" : item.id === "users" ? "团队成员" : item.id === "access" ? "角色权限" : "客户端与 SDK"}</small></button>)}</div><div className="mobile-account"><div className="avatar">{avatarText}</div><div><b>{currentUser.displayName}</b><small>{currentUser.tenantName} · {roleLabel}</small></div>{isAdmin && <a className="mobile-admin-link" href="/admin"><Icon name="shield"/>管理</a>}<button className="mobile-logout" onClick={() => void logout()} disabled={logoutLoading}><Icon name="logout"/>{logoutLoading ? "退出中" : "退出登录"}</button></div></div></div>}

    {modal && <div className="overlay" onMouseDown={event => event.currentTarget === event.target && setModal(false)}><div className="modal"><div className="modal-top"><div className="subicon"><Icon name="key"/></div><button onClick={() => setModal(false)} aria-label="关闭">×</button></div><p className="modal-kicker">凭证管理</p><h2>创建 API 密钥</h2><p>密钥只会完整显示一次。所有调用都将绑定当前租户与权限策略。</p><label>密钥名称<input autoFocus defaultValue="Production Gateway"/></label><label>权限范围<select defaultValue="models:invoke"><option value="models:invoke">调用已授权模型</option><option value="read:all">只读访问</option><option value="admin">租户管理员</option></select></label><div className="scope-note"><Icon name="shield"/><span><b>最小权限原则</b><small>建议为不同环境创建独立密钥。</small></span></div><button className="primary full" onClick={saveKey}>创建密钥 <Icon name="arrow"/></button></div></div>}
    {search && <div className="overlay search-overlay" onMouseDown={event => event.currentTarget === event.target && setSearch(false)}><div className="command"><div><Icon name="search"/><input autoFocus placeholder="搜索模型、团队、文档或命令"/></div><p>快速前往</p>{nav.slice(0, 5).map(item => <button key={item.id} onClick={() => { setActive(item.id); setSearch(false); }}><Icon name={item.icon}/><span>{item.label}</span><kbd>↵</kbd></button>)}</div></div>}
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}
