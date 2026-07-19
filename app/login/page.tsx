"use client";

import { useState } from "react";
import { Icon } from "../ui/icons";
import { useTheme } from "../ui/useTheme";
import "./style.css";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const completeLogin = () => {
    if (loading) return;
    setLoading(true);
    setTimeout(() => location.href = "/console", 700);
  };

  return (
    <main className="login-page">
      <a className="login-brand" href="/"><span><img src="/favicon.svg" alt=""/></span><b>EVAL</b></a>
      <button className="login-theme" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
        <Icon name={theme === "dark" ? "sun" : "moon"}/>
      </button>
      <section className="login-copy">
        <div className="login-kicker"><i/>EVAL AGENT ACCESS</div>
        <h1>工程，始于<br/><em>可信的执行。</em></h1>
        <p>登录你的团队空间，继续管理 Agent、模型、工具权限与每一次工程执行。</p>
        <div className="trust"><span><Icon name="shield"/>工具级权限控制</span><span><Icon name="chart"/>完整执行记录</span><span><Icon name="route"/>模型健康与容灾</span></div>
      </section>
      <section className="login-card"><div className="card-glow"/><div className="login-form">
        <form onSubmit={event => { event.preventDefault(); completeLogin(); }}>
        <div className="eyebrow">欢迎回来</div><h2>登录 Eval Agent</h2><p>使用组织账户继续访问用户控制台</p>
        <label>工作邮箱<input required type="email" placeholder="name@company.com" inputMode="email" autoComplete="email"/></label>
        <label>密码<div className="password"><input required type="password" placeholder="输入密码" autoComplete="current-password"/><button type="button">忘记密码</button></div></label>
        <button type="submit" className="login-submit" disabled={loading}>{loading ? "正在验证…" : <>安全登录 <Icon name="arrow"/></>}</button>
        <div className="divider"><span/>或<span/></div><button type="button" className="sso" onClick={completeLogin} disabled={loading}><Icon name="shield"/>通过企业 SSO 登录</button>
        <small className="policy">登录即代表你同意服务条款与隐私政策。组织管理员可根据安全策略查看登录活动。</small>
        </form>
      </div></section>
      <footer>© 2026 正在连接（杭州）科技有限公司</footer>
    </main>
  );
}
