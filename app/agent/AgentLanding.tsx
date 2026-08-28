"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type PublicRelease = {
  id: string;
  name: string;
  nameEn: string;
  version: string;
  platform: string;
  format: "NSIS" | "DMG";
  fileExtension: ".exe" | ".dmg";
  available: boolean;
  downloadUrl: string | null;
  size: number | null;
  sha256: string | null;
  public: true;
};

const strengths = [
  { index: "01", zh: ["不是回答问题。是完成工程。", "从器件研究、需求拆解、固件实现，到编译、烧录、串口与 SWD 调试，Eval 把 AI 从建议者推进到执行者。"], en: ["Not answers. Finished engineering.", "From component research and requirements to firmware, compilation, flashing, serial and SWD debugging—Eval moves AI from advisor to operator."] },
  { index: "02", zh: ["专业角色，自主接棒。", "17 个 Agent 角色覆盖硬件、软件、固件、UI、测试、架构与文档；5 条内置流水线让复杂任务按真实研发节奏流转。"], en: ["Specialists that take the baton.", "17 agent roles span hardware, software, firmware, UI, test, architecture and documentation. Five workflows move complex work at engineering pace."] },
  { index: "03", zh: ["过程可见，边界可控。", "实时 SSE 事件、工具工作日志、上下文容量、Checkpoint 与权限审批，让每一步都能理解、暂停、接管和恢复。"], en: ["Visible process. Governed autonomy.", "Live events, tool logs, context capacity, checkpoints and approvals make every step understandable, pausable, recoverable and ready for takeover."] },
];

const workflow = [
  { index: "01", verb: "Understand", zh: "需求与器件语境", en: "Requirements and device context" },
  { index: "02", verb: "Architect", zh: "任务分解与执行编排", en: "Task planning and execution orchestration" },
  { index: "03", verb: "Execute", zh: "工具调用与工程产出", en: "Tool execution and engineering output" },
  { index: "04", verb: "Verify", zh: "编译、调试与自省修复", en: "Build, debug and reflective repair" },
  { index: "05", verb: "Deliver", zh: "报告、文档与可追溯结果", en: "Reports, docs and traceable delivery" },
];

const audiences = [
  { zh: ["固件与硬件工程师", "少查资料，少切工具，把时间留给真正的工程判断。"], en: ["Firmware & hardware engineers", "Search less, switch tools less, and preserve time for real engineering judgment."] },
  { zh: ["嵌入式研发团队", "把隐性的专家经验固化为可复用工作流和权限策略。"], en: ["Embedded product teams", "Turn tacit expert knowledge into reusable workflows and permission policies."] },
  { zh: ["实验室与技术负责人", "看见任务、成本、运行状态和每次工具执行的证据。"], en: ["Lab & engineering leaders", "See tasks, cost, runtime health, and evidence from every tool execution."] },
  { zh: ["AI 工具构建者", "用开放的 Agent、Tool 与 Skill 架构继续扩展。"], en: ["AI tool builders", "Extend an open architecture of agents, tools and skills."] },
];

const runtimeScenes = [
  { act: "01", zh: [<>原理图<br/>理解</>, "视觉 / 硬件分析", "分析中", "硬件工程师正在读取原理图与数据手册，建立器件和引脚关系。", "视觉分析 · 就绪"], en: [<>Schematic<br/>Intelligence</>, "VISION / HARDWARE", "ANALYZING", "The hardware agent is reading schematics and datasheets to map devices and pins.", "VISION · READY"], checkpoint: "08:39:04", stage: 0 },
  { act: "02", zh: [<>系统<br/>规划</>, "规划 / 任务编排", "编排中", "架构师正在拆解目标、选择专业 Agent，并建立可恢复的执行计划。", "任务规划 · 健康"], en: [<>System<br/>Planning</>, "PLAN / ORCHESTRATOR", "DIRECTING", "The architect is decomposing the goal, selecting specialists and building a recoverable plan.", "PLANNING · HEALTHY"], checkpoint: "08:40:36", stage: 1 },
  { act: "03", zh: [<>固件<br/>执行</>, "执行 / AGENT 链", "运行中", "固件工程师正在调用编译工具，验证 STM32H7 构建输出。", "工程执行 · 健康"], en: [<>Firmware<br/>Execution</>, "LIVE / AGENT CHAIN", "RUNNING", "The firmware agent is compiling and validating the STM32H7 build output.", "EXECUTION · HEALTHY"], checkpoint: "08:42:19", stage: 2 },
  { act: "04", zh: [<>调试<br/>自省</>, "验证 / 自省修复", "修复中", "调试工程师正在分析编译错误，并启动自动反思与修复循环。", "自省修复 · 健康"], en: [<>Debug<br/>Reflection</>, "VERIFY / SELF-CRITIC", "REPAIRING", "The debug agent is analyzing build errors and launching a reflective repair loop.", "REPAIR · HEALTHY"], checkpoint: "08:46:31", stage: 3 },
  { act: "05", zh: [<>验证<br/>交付</>, "报告 / 工作流", "已完成", "测试结果、变更记录与工程报告已经汇总，等待团队确认交付。", "交付流程 · 就绪"], en: [<>Verified<br/>Delivery</>, "REPORT / WORKFLOW", "COMPLETE", "Test results, change records and the engineering report are ready for team approval.", "DELIVERY · READY"], checkpoint: "08:51:12", stage: 4 },
];

function BrandMark() {
  return <span className="agent-brand-mark"><Image src="/favicon.svg" alt="" width={24} height={24}/></span>;
}

export function AgentLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const [locale, setLocale] = useState<"zh" | "en">(() => typeof window !== "undefined" && typeof window.localStorage?.getItem === "function" && window.localStorage.getItem("eval-locale") === "en" ? "en" : "zh");
  const [activeRuntime, setActiveRuntime] = useState(0);
  const [downloads, setDownloads] = useState<PublicRelease[]>([]);
  const [downloadsLoading, setDownloadsLoading] = useState(true);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    }), { threshold: .14 });
    rootRef.current?.querySelectorAll("[data-reveal]").forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [locale]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActiveRuntime(current => (current + 1) % runtimeScenes.length), 4600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/downloads")
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Download catalog unavailable")))
      .then(payload => {
        const result = payload as { data?: PublicRelease[] };
        if (active) setDownloads(Array.isArray(result.data) ? result.data : []);
      })
      .catch(() => {
        if (active) setDownloads([]);
      })
      .finally(() => {
        if (active) setDownloadsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("luban-theme", next);
  };

  const trackLight = (event: React.PointerEvent<HTMLDivElement>) => {
    rootRef.current?.style.setProperty("--mx", `${event.clientX}px`);
    rootRef.current?.style.setProperty("--my", `${event.clientY}px`);
  };

  const changeRuntime = (direction: number) => setActiveRuntime(current => (current + direction + runtimeScenes.length) % runtimeScenes.length);
  const toggleLocale = () => {
    const next = locale === "zh" ? "en" : "zh";
    setLocale(next);
    localStorage.setItem("eval-locale", next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  };
  const isZh = locale === "zh";

  return <div className="agent-landing" ref={rootRef} onPointerMove={trackLight}>
    <div className="film-grain" aria-hidden="true"/>
    <div className="cursor-light" aria-hidden="true"/>

    <header className="agent-nav">
      <a className="agent-logo" href="#top" aria-label="Eval Agent 首页"><BrandMark/><span><b>Eval</b><small>Agent System</small></span></a>
      <nav aria-label={isZh ? "落地页导航" : "Landing navigation"}><a href="#difference">{isZh ? "为何不同" : "Difference"}</a><a href="#system">{isZh ? "系统能力" : "System"}</a><a href="#audience">{isZh ? "适用人群" : "For whom"}</a><a href="#downloads">{isZh ? "下载" : "Download"}</a><Link href="/blog">{isZh ? "博客" : "Blog"}</Link><Link href="/forum">{isZh ? "论坛" : "Forum"}</Link></nav>
      <div className="agent-nav-actions"><button className="language-switch" onClick={toggleLocale} aria-label={isZh ? "切换到英文" : "Switch to Chinese"}>{isZh ? "EN" : "中文"}</button><button className="theme-switch" onClick={toggleTheme}>{theme === "dark" ? "LIGHT" : "DARK"}</button><a href="/login">{isZh ? "登录" : "Sign in"} <span className="css-arrow" aria-hidden="true"/></a></div>
    </header>
    <nav className="agent-mobile-content" aria-label={isZh ? "移动端内容导航" : "Mobile content navigation"}><Link href="/blog">{isZh ? "团队博客" : "Blog"}</Link><Link href="/forum">{isZh ? "工程论坛" : "Forum"}</Link></nav>

    <main id="top">
      <section className="agent-hero">
        <div className="hero-aperture" aria-hidden="true"><i/><i/><i/></div>
        <div className="hero-rail"><span>THE EMBEDDED INTELLIGENCE SYSTEM</span><span>2026 / BUILD 0719</span></div>
        <div className="agent-hero-copy" data-reveal>
          <p className="agent-kicker"><i/> EVAL AGENT · ENGINEERING, DIRECTED.</p>
          <h1>{isZh ? <>让硬件开发<br/><em>开始行动。</em></> : <>Make hardware<br/><em>move.</em></>}</h1>
          <p className="agent-lede">{isZh ? <>从一张原理图，到一块真正运行的板。<br/>Eval 让专业 Agent 与工程工具进入同一条执行链。</> : <>From a schematic to a board that truly runs.<br/>Eval unifies specialist agents and engineering tools into one execution chain.</>}</p>
          <div className="agent-hero-actions"><a className="agent-primary" href="/login">{isZh ? "开始使用" : "Start building"} <span className="css-arrow" aria-hidden="true"/></a><a className="agent-secondary" href="#system"><i/>{isZh ? "观看系统如何工作" : "See how the system works"}</a></div>
        </div>
        <div className="agent-runtime" data-reveal aria-roledescription="carousel" aria-label="Eval Agent 工程场景">
          <div className="runtime-viewport" onTouchStart={event => touchStartRef.current = event.touches[0]?.clientX ?? null} onTouchEnd={event => {
            if (touchStartRef.current === null) return;
            const distance = (event.changedTouches[0]?.clientX ?? touchStartRef.current) - touchStartRef.current;
            if (Math.abs(distance) > 42) changeRuntime(distance > 0 ? -1 : 1);
            touchStartRef.current = null;
          }}>
            <div className="runtime-track" style={{ transform: `translateX(-${activeRuntime * 100}%)` }}>{runtimeScenes.map((scene, sceneIndex) => { const content = isZh ? scene.zh : scene.en; return <article className="runtime-slide" key={scene.act} aria-hidden={sceneIndex !== activeRuntime}>
              <div className="runtime-head"><span>{content[1]}</span><b>{content[2]}</b></div>
              <div className="runtime-focus"><small>{isZh ? "当前阶段" : "CURRENT ACT"}</small><strong>{scene.act}</strong><h2>{content[0]}</h2><p>{content[3]}</p></div>
              <div className="runtime-progress">{[0,1,2,3,4].map(step => <i key={step} className={step === scene.stage ? "active" : step < scene.stage ? "complete" : ""}/>)}</div>
              <div className="runtime-foot"><span>{isZh ? "执行状态" : "RUNTIME STATUS"}<br/><b>{content[4]}</b></span><span>{isZh ? "检查点" : "CHECKPOINT"}<br/><b>{scene.checkpoint}</b></span></div>
            </article>})}</div>
          </div>
          <div className="runtime-controls"><button className="runtime-prev" onClick={() => changeRuntime(-1)} aria-label={isZh ? "上一个工程场景" : "Previous scene"}><i/></button><div>{runtimeScenes.map((scene, index) => <button key={scene.act} className={index === activeRuntime ? "active" : ""} onClick={() => setActiveRuntime(index)} aria-label={isZh ? `查看场景 ${index + 1}` : `View scene ${index + 1}`}/>)}</div><button className="runtime-next" onClick={() => changeRuntime(1)} aria-label={isZh ? "下一个工程场景" : "Next scene"}><i/></button></div>
        </div>
        <div className="hero-metrics">
          <span><b>17</b>{isZh ? "专业 Agent" : "specialist agents"}</span><span><b>25</b>{isZh ? "工程工具" : "engineering tools"}</span><span><b>5</b>{isZh ? "协作流水线" : "agent workflows"}</span><span><b>24/25</b>{isZh ? "真实工具实现" : "tools implemented"}</span>
        </div>
      </section>

      <section className="manifesto" id="difference">
        <div className="chapter-mark" data-reveal><span>CHAPTER I</span><i/><span>THE DIFFERENCE</span></div>
        <div className="manifesto-title" data-reveal><p>{isZh ? "大多数 AI 停在屏幕里。" : "Most AI stops at the screen."}</p><h2>{isZh ? <>Eval 进入<br/><em>工程现场。</em></> : <>Eval enters<br/><em>the real build.</em></>}</h2></div>
        <div className="strength-list">{strengths.map(item => { const content = isZh ? item.zh : item.en; return <article key={item.index} data-reveal><span>{item.index}</span><h3>{content[0]}</h3><p>{content[1]}</p></article>})}</div>
      </section>

      <section className="system-section" id="system">
        <div className="chapter-mark light-mark" data-reveal><span>CHAPTER II</span><i/><span>THE SYSTEM</span></div>
        <div className="system-heading" data-reveal><p>{isZh ? "一套为复杂研发而生的运行系统" : "A runtime built for complex engineering"}</p><h2>{isZh ? <>一条执行链。<br/>五次专业接棒。</> : <>One execution chain.<br/>Five expert handoffs.</>}</h2></div>
        <div className="workflow-film" data-reveal>{workflow.map((item, index) => <article key={item.index} className={index === 2 ? "active" : ""}><span>{item.index}</span><div><small>{item.verb}</small><h3>{isZh ? item.zh : item.en}</h3></div><i/></article>)}</div>
        <div className="system-grid">
          <article className="agent-cast" data-reveal><div className="card-label">THE CAST / 17 AGENTS</div><h3>{isZh ? "一个任务，召集一支工程团队。" : "One task. An engineering team assembled."}</h3><div className="cast-credits"><span>ARCHITECT</span><b>{isZh ? "系统架构师" : "System architect"}</b><span>FIRMWARE</span><b>{isZh ? "固件工程师" : "Firmware engineer"}</b><span>HARDWARE</span><b>{isZh ? "硬件工程师" : "Hardware engineer"}</b><span>DEBUG</span><b>{isZh ? "调试工程师" : "Debug engineer"}</b><span>TEST</span><b>{isZh ? "测试工程师" : "Test engineer"}</b><span>DOC</span><b>{isZh ? "文档工程师" : "Documentation engineer"}</b></div></article>
          <article className="tool-frame" data-reveal><div className="card-label">REAL TOOL EXECUTION</div><div className="terminal-bar"><span/><span/><span/><b>eval / build</b></div><div className="terminal-copy"><p><i>01</i><span className="dim">agent</span> firmware-engineer</p><p><i>02</i><span className="dim">tool</span> compile firmware</p><p><i>03</i><span className="blue">build</span> 148 objects · 0 errors</p><p><i>04</i><span className="dim">tool</span> swd_debug verify</p><p><i>05</i><span className="green">result</span> target responding</p><p className="cursor-line"><i>06</i><span>checkpoint saved</span><b/></p></div></article>
          <article className="control-frame" data-reveal><div className="card-label">GOVERNED AUTONOMY</div><h3>{isZh ? "自主，但从不失控。" : "Autonomous. Never uncontrolled."}</h3><div className="control-rings"><span>FULL ACCESS</span><span>AUTO EDIT</span><span>CONFIRM</span><span>PLAN</span></div><p>{isZh ? "四级执行范围、工具级 allow / ask / deny、敏感数据脱敏与凭证安全存储。" : "Four execution scopes, tool-level allow / ask / deny, sensitive-data redaction and secure credential storage."}</p></article>
          <article className="resilience-frame" data-reveal><div className="card-label">RESILIENCE LAYER</div><h3>{isZh ? "长任务，也能稳稳抵达。" : "Long-running work that still arrives."}</h3><div className="resilience-stats"><span><b>70%</b>{isZh ? "上下文预警" : "context warning"}</span><span><b>80%</b>{isZh ? "自动压缩" : "auto compaction"}</span><span><b>3×</b>{isZh ? "任务恢复" : "task recovery"}</span></div><p>{isZh ? "上下文压力管理、自动恢复、自动检查点与自省修复共同托住复杂任务。" : "Context pressure control, automatic recovery, checkpoints and reflective repair support complex work."}</p></article>
        </div>
      </section>

      <section className="audience-section" id="audience">
        <div className="chapter-mark" data-reveal><span>CHAPTER III</span><i/><span>WHO IT IS FOR</span></div>
        <div className="audience-heading" data-reveal><h2>{isZh ? <>为那些必须让<br/><em>真实世界运行起来</em><br/>的人而造。</> : <>Built for those who<br/><em>make the real world run.</em></>}</h2></div>
        <div className="audience-list">{audiences.map((item, index) => { const content = isZh ? item.zh : item.en; return <article key={content[0]} data-reveal><span>0{index + 1}</span><h3>{content[0]}</h3><p>{content[1]}</p><i className="css-arrow" aria-hidden="true"/></article>})}</div>
      </section>

      <section className="download-section" id="downloads">
        <div className="chapter-mark light-mark" data-reveal><span>CHAPTER IV</span><i/><span>PUBLIC RELEASES</span></div>
        <div className="download-heading" data-reveal>
          <div><p>{isZh ? "无需账号 · 公开下载" : "NO ACCOUNT · PUBLIC DOWNLOAD"}</p><h2>{isZh ? <>下载工具，<br/><em>直接开始。</em></> : <>Download.<br/><em>Start directly.</em></>}</h2></div>
          <p>{isZh ? "下载工具无需登录。管理员上传正式发布包后，下载按钮会在这里开放。" : "No sign-in is required. Download buttons become available here after an administrator uploads an official release."}</p>
        </div>
        <div className="release-list" aria-live="polite">
          {downloadsLoading ? <div className="release-loading">{isZh ? "正在读取发布目录" : "Reading release catalog"}<i/><i/><i/></div> : downloads.map((release, index) => <article className="is-standard" key={release.id}>
            <div className="release-index">0{index + 1}</div>
            <div className="release-name"><small>{release.format === "DMG" ? (isZh ? "macOS 安装" : "MACOS INSTALL") : (isZh ? "Windows 安装" : "WINDOWS INSTALL")} · {release.platform}</small><h3>{isZh ? release.name : release.nameEn}</h3></div>
            <div className="release-spec"><span>{release.format}</span><span>{release.fileExtension}</span><span>v{release.version}</span></div>
            {release.available && release.downloadUrl ? <a className="release-action is-ready" href={release.downloadUrl} download>{isZh ? `下载 ${release.fileExtension.toUpperCase()}` : `Download ${release.fileExtension.toUpperCase()}`}<i className="download-arrow" aria-hidden="true"/></a> : <span className="release-action is-pending" aria-disabled="true"><i/>{isZh ? "等待管理员上传" : "Awaiting administrator upload"}</span>}
          </article>)}
          {!downloadsLoading && downloads.length === 0 ? <div className="release-empty">{isZh ? "发布目录暂不可用" : "Release catalog is currently unavailable"}</div> : null}
        </div>
        <div className="release-truth" data-reveal><span>LATEST STABLE RELEASE</span><p>{isZh ? "这里只提供最新稳定版的 Windows EXE 与 macOS DMG。已安装客户端会按系统和芯片架构获取同一版本的签名自动更新。" : "Only the latest stable Windows EXE and macOS DMG are provided. Installed clients receive the matching signed update for their OS and architecture."}</p></div>
      </section>

      <section className="closing-scene">
        <div className="closing-beam" aria-hidden="true"/>
        <div data-reveal><BrandMark/><p>THE NEXT BUILD STARTS HERE</p><h2>{isZh ? <>把复杂，交给系统。<br/><em>把创造，留给工程师。</em></> : <>Give complexity to the system.<br/><em>Keep invention with engineers.</em></>}</h2><a href="/login">{isZh ? "登录 Eval Agent" : "Sign in to Eval Agent"} <span className="css-arrow" aria-hidden="true"/></a></div>
        <footer><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2024097468号-10</a></footer>
      </section>
    </main>
  </div>;
}
