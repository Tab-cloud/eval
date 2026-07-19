"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../ui/icons";
import { useTheme } from "../ui/useTheme";
import "./style.css";

export default function LoginPage() {
  const pageRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useTheme();
  const completeLogin = async (form: HTMLFormElement) => {
    if (loading) return;
    setLoading(true);
    setError("");
    const fields = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "登录失败，请稍后重试。");
        return;
      }
      location.href = "/console";
    } catch {
      setError("暂时无法连接登录服务，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page" ref={pageRef} onPointerMove={event => {
      pageRef.current?.style.setProperty("--cursor-x", `${event.clientX}px`);
      pageRef.current?.style.setProperty("--cursor-y", `${event.clientY}px`);
      pageRef.current?.style.setProperty("--cursor-opacity", "1");
    }} onPointerLeave={() => pageRef.current?.style.setProperty("--cursor-opacity", "0")}>
      <div className="login-cursor-light" aria-hidden="true"/>
      <Link className="login-brand" href="/"><span><img src="/favicon.svg" alt=""/></span><b>EVAL</b></Link>
      <button className="login-theme" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
        <Icon name={theme === "dark" ? "sun" : "moon"}/>
      </button>
      <section className="login-copy">
        <div className="login-chapter"><span>01 / ACCESS</span><i/><span>ENGINEERING, DIRECTED.</span></div>
        <div className="login-copy-main"><div className="login-kicker"><i/>EVAL AGENT ACCESS</div>
        <h1>工程，始于<br/><em>可信的执行。</em></h1>
        <p>登录你的团队空间，继续管理 Agent、模型、工具权限与每一次工程执行。</p></div>
        <div className="trust"><span><Icon name="shield"/>工具级权限控制</span><span><Icon name="chart"/>完整执行记录</span><span><Icon name="route"/>模型健康与容灾</span></div>
        <div className="login-copy-foot"><span>SECURE CONTROL PLANE</span><p>身份、权限与工程证据在同一条可信链路中完成验证。</p></div>
      </section>
      <section className="login-card"><div className="card-glow"/><div className="login-form">
        <form onSubmit={event => { event.preventDefault(); void completeLogin(event.currentTarget); }}>
        <div className="eyebrow">邮箱账号</div><h2>登录 Eval Agent</h2><p>使用工作邮箱与密码继续访问用户控制台</p>
        <label>工作邮箱<input required name="email" type="email" placeholder="name@company.com" inputMode="email" autoComplete="email"/></label>
        <label>密码<div className="password"><input required name="password" type="password" placeholder="输入密码" autoComplete="current-password"/></div></label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button type="submit" className="login-submit" disabled={loading}>{loading ? "正在验证…" : <>安全登录 <Icon name="arrow"/></>}</button>
        <small className="policy">登录即代表你同意服务条款与隐私政策。组织管理员可根据安全策略查看登录活动。</small>
        </form>
      </div></section>
      <footer>© 2026 正在连接（杭州）科技有限公司</footer>
    </main>
  );
}
