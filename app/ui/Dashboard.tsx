"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useTheme } from "./useTheme";

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
  return <section className="subpage"><div className="subhero surface"><div className="subicon"><Icon name={item.icon}/></div><div><p>Luban Cloud</p><h1>{item.label}</h1><span>该模块的架构与权限边界已经就绪，下一阶段将连接真实数据与业务工作流。</span></div></div><div className="placeholder-grid"><div className="surface placeholder-main"><span/><span/><span/><span/></div><div className="surface placeholder-side"><i/><i/><i/></div></div></section>;
}

export function Dashboard() {
  const [active, setActive] = useState("overview");
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState(false);
  const [toast, setToast] = useState("");
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearch(true); }
      if (event.key === "Escape") { setModal(false); setSearch(false); setGovernanceOpen(false); setMobileMenu(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const saveKey = () => { setModal(false); setToast("API 密钥已创建，请立即安全保存"); setTimeout(() => setToast(""), 3000); };
  const navigate = (id: string) => { setActive(id); setGovernanceOpen(false); setMobileMenu(false); };
  const governanceActive = ["keys", "users", "access"].includes(active);

  return <div className="shell">
    <ParticleField/>
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand top-brand" onClick={() => navigate("overview")} aria-label="返回总览"><span className="brandmark">L</span><span><b>Luban</b><small>Cloud</small></span></button>
        <nav className="topnav" aria-label="主要导航">
          <button className={active === "overview" ? "active" : ""} onClick={() => navigate("overview")}>总览</button>
          <button className={active === "models" ? "active" : ""} onClick={() => navigate("models")}>模型</button>
          <button className={active === "routes" ? "active" : ""} onClick={() => navigate("routes")}>路由</button>
          <div className="nav-group"><button className={governanceActive ? "active" : ""} onClick={() => setGovernanceOpen(open => !open)}>治理 <Icon name="chevron"/></button>{governanceOpen && <div className="nav-popover"><p>访问与组织</p>{nav.filter(item => ["keys", "users", "access"].includes(item.id)).map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => navigate(item.id)}><span className="nav-popover-icon"><Icon name={item.icon}/></span><span><b>{item.label}</b><small>{item.id === "keys" ? "凭证与调用范围" : item.id === "users" ? "成员、团队与邀请" : "角色和资源边界"}</small></span><Icon name="chevron"/></button>)}</div>}</div>
          <button className={active === "analytics" ? "active" : ""} onClick={() => navigate("analytics")}>分析</button>
          <button className={active === "downloads" ? "active" : ""} onClick={() => navigate("downloads")}>下载</button>
        </nav>
        <div className="header-actions"><button className="command-trigger" onClick={() => setSearch(true)}><Icon name="search"/><span>搜索</span><kbd>⌘ K</kbd></button><span className="region"><i/>CN East</span><button className="round-button theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}><Icon name={theme === "dark" ? "sun" : "moon"}/></button><button className="round-button" aria-label="通知"><Icon name="bell"/><i className="notify"/></button><button className="avatar account-button" aria-label="账户菜单">LY</button></div>
      </div>
    </header>
    <main>
      <div className="content"><div className="page-title"><div><p>2026 年 7 月 19 日</p><h2>{active === "overview" ? "欢迎回来，林屿" : nav.find(item => item.id === active)?.label}</h2></div>{active === "overview" && <div className="sync"><Icon name="clock"/>刚刚更新</div>}</div>{active === "overview" ? <Overview onCreate={() => setModal(true)}/> : <Coming id={active}/>}<footer><span>© 2026 Luban Cloud</span><span>服务状态　开发文档　隐私</span></footer></div>
    </main>

    <nav className="mobile-dock" aria-label="移动端导航"><button className={active === "overview" ? "active" : ""} onClick={() => navigate("overview")}><Icon name="grid"/><span>总览</span></button><button className={active === "models" ? "active" : ""} onClick={() => navigate("models")}><Icon name="model"/><span>模型</span></button><button className={active === "routes" ? "active" : ""} onClick={() => navigate("routes")}><Icon name="route"/><span>路由</span></button><button className={active === "analytics" ? "active" : ""} onClick={() => navigate("analytics")}><Icon name="chart"/><span>分析</span></button><button className={mobileMenu || ["keys","users","access","downloads"].includes(active) ? "active" : ""} onClick={() => setMobileMenu(true)}><Icon name="more"/><span>更多</span></button></nav>

    {mobileMenu && <div className="overlay mobile-menu-overlay" onMouseDown={event => event.currentTarget === event.target && setMobileMenu(false)}><div className="mobile-menu"><div className="mobile-menu-handle"/><div className="mobile-menu-head"><div><p>Luban Cloud</p><h2>更多功能</h2></div><button onClick={() => setMobileMenu(false)} aria-label="关闭">×</button></div><div className="mobile-menu-grid">{nav.filter(item => ["keys","users","access","downloads"].includes(item.id)).map(item => <button key={item.id} onClick={() => navigate(item.id)}><span><Icon name={item.icon}/></span><b>{item.label}</b><small>{item.id === "keys" ? "凭证管理" : item.id === "users" ? "团队成员" : item.id === "access" ? "角色权限" : "客户端与 SDK"}</small></button>)}</div><div className="mobile-account"><div className="avatar">LY</div><div><b>林屿</b><small>鲁班科技 · 管理员</small></div><button><Icon name="settings"/>设置</button></div></div></div>}

    {modal && <div className="overlay" onMouseDown={event => event.currentTarget === event.target && setModal(false)}><div className="modal"><div className="modal-top"><div className="subicon"><Icon name="key"/></div><button onClick={() => setModal(false)} aria-label="关闭">×</button></div><p className="modal-kicker">凭证管理</p><h2>创建 API 密钥</h2><p>密钥只会完整显示一次。所有调用都将绑定当前租户与权限策略。</p><label>密钥名称<input autoFocus defaultValue="Production Gateway"/></label><label>权限范围<select defaultValue="models:invoke"><option value="models:invoke">调用已授权模型</option><option value="read:all">只读访问</option><option value="admin">租户管理员</option></select></label><div className="scope-note"><Icon name="shield"/><span><b>最小权限原则</b><small>建议为不同环境创建独立密钥。</small></span></div><button className="primary full" onClick={saveKey}>创建密钥 <Icon name="arrow"/></button></div></div>}
    {search && <div className="overlay search-overlay" onMouseDown={event => event.currentTarget === event.target && setSearch(false)}><div className="command"><div><Icon name="search"/><input autoFocus placeholder="搜索模型、团队、文档或命令"/></div><p>快速前往</p>{nav.slice(0, 5).map(item => <button key={item.id} onClick={() => { setActive(item.id); setSearch(false); }}><Icon name={item.icon}/><span>{item.label}</span><kbd>↵</kbd></button>)}</div></div>}
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>;
}
