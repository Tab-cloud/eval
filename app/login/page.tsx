"use client";

import { useState } from "react";
import { Icon } from "../ui/icons";
import { useTheme } from "../ui/useTheme";
import "./style.css";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <main className="login-page">
      <a className="login-brand" href="/"><span>L</span><b>LUBAN</b></a>
      <button className="login-theme" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
        <Icon name={theme === "dark" ? "sun" : "moon"}/>
      </button>
      <section className="login-copy">
        <div className="login-kicker"><i/>ENTERPRISE AI CONTROL PLANE</div>
        <h1>智能，始于<br/><em>可信的连接。</em></h1>
        <p>一个入口，连接全球模型。每一次调用都有边界、可追踪、可治理。</p>
        <div className="trust"><span><Icon name="shield"/>企业级权限隔离</span><span><Icon name="chart"/>全链路调用审计</span><span><Icon name="route"/>智能容灾与路由</span></div>
      </section>
      <section className="login-card"><div className="card-glow"/><div className="login-form">
        <div className="eyebrow">欢迎回来</div><h2>登录 Luban AI</h2><p>使用组织账户继续访问控制台</p>
        <label>工作邮箱<input type="email" placeholder="name@company.com" inputMode="email" autoComplete="email"/></label>
        <label>密码<div className="password"><input type="password" placeholder="输入密码" autoComplete="current-password"/><button type="button">忘记密码</button></div></label>
        <button className="login-submit" onClick={() => { setLoading(true); setTimeout(() => location.href = "/", 700); }}>{loading ? "正在验证…" : <>安全登录 <Icon name="arrow"/></>}</button>
        <div className="divider"><span/>或<span/></div><button className="sso"><Icon name="shield"/>通过企业 SSO 登录</button>
        <small className="policy">登录即代表你同意服务条款与隐私政策。组织管理员可根据安全策略查看登录活动。</small>
      </div></section>
      <footer>© 2026 Luban Intelligence. All rights reserved.</footer>
    </main>
  );
}
