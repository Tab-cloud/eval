"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/icons";
import { useTheme } from "../ui/useTheme";
import "./style.css";

type Locale = "zh" | "en";

const googleErrors: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google could not verify this sign-in. Please try again.",
  google_not_configured: "Google sign-in has not been configured for this environment.",
  google_unavailable: "Google sign-in is temporarily unavailable.",
  invalid_state: "This sign-in request has expired. Please start again.",
  expired_state: "This sign-in request has expired. Please start again.",
  token_exchange_failed: "Google could not complete this sign-in.",
  missing_id_token: "Google did not return a valid identity.",
  invalid_id_token: "Google returned an invalid identity.",
  invalid_identity: "This Google identity could not be verified.",
  hosted_domain_denied: "This Google Workspace domain is not allowed.",
  account_not_provisioned: "This email has not been invited by an administrator.",
};

export default function LoginPage() {
  const pageRef = useRef<HTMLElement>(null);
  const [locale, setLocale] = useState<Locale>("zh");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const query = new URLSearchParams(location.search);
      const selected: Locale = query.get("lang") === "en" || localStorage.getItem("eval-locale") === "en" ? "en" : "zh";
      setLocale(selected);
      document.documentElement.lang = selected === "zh" ? "zh-CN" : "en";
      const reason = query.get("error");
      if (reason) setError(googleErrors[reason] ?? googleErrors.google_failed);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const switchLocale = () => {
    const next: Locale = locale === "zh" ? "en" : "zh";
    setLocale(next);
    setError("");
    setNotice("");
    localStorage.setItem("eval-locale", next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    history.replaceState(null, "", `/login?lang=${next}`);
  };

  const sendCode = async () => {
    if (sending || countdown > 0) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json() as { error?: string; message?: string; retryAfter?: number };
      if (!response.ok) {
        setError(payload.error ?? "验证码发送失败，请稍后再试。");
        if (response.status === 429) setCountdown(Math.min(Math.max(payload.retryAfter ?? 60, 1), 3600));
        return;
      }
      setNotice(payload.message ?? "如果手机号已绑定账号，验证码将发送至手机。");
      setCountdown(payload.retryAfter ?? 60);
    } catch {
      setError("暂时无法连接短信服务，请稍后再试。");
    } finally {
      setSending(false);
    }
  };

  const completeSmsLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sms/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "登录失败，请稍后再试。");
        return;
      }
      location.href = "/console";
    } catch {
      setError("暂时无法连接登录服务，请稍后再试。");
    } finally {
      setLoading(false);
    }
  };

  const isChinese = locale === "zh";
  return (
    <main className="login-page" ref={pageRef} onPointerMove={event => {
      pageRef.current?.style.setProperty("--cursor-x", `${event.clientX}px`);
      pageRef.current?.style.setProperty("--cursor-y", `${event.clientY}px`);
      pageRef.current?.style.setProperty("--cursor-opacity", "1");
    }} onPointerLeave={() => pageRef.current?.style.setProperty("--cursor-opacity", "0")}>
      <div className="login-cursor-light" aria-hidden="true"/>
      <Link className="login-brand" href="/"><span><Image src="/favicon.svg" alt="" width={24} height={24}/></span><b>EVAL</b></Link>
      <div className="login-tools">
        <button className="login-locale" onClick={switchLocale} aria-label={isChinese ? "Switch to English" : "切换到中文"}>{isChinese ? "EN" : "中"}</button>
        <button className="login-theme" onClick={toggleTheme} aria-label={theme === "dark" ? (isChinese ? "切换到浅色模式" : "Use light mode") : (isChinese ? "切换到深色模式" : "Use dark mode")}>
          <Icon name={theme === "dark" ? "sun" : "moon"}/>
        </button>
      </div>

      <section className="login-copy">
        <div className="login-chapter"><span>01 / ACCESS</span><i/><span>ENGINEERING, DIRECTED.</span></div>
        <div className="login-copy-main">
          <div className="login-kicker"><i/>EVAL AGENT ACCESS</div>
          {isChinese ? <>
            <h1>工程，始于<br/><em>可信的执行。</em></h1>
            <p>登录你的团队空间，继续管理 Agent、模型、工具权限与每一次工程执行。</p>
          </> : <>
            <h1>Engineering,<br/><em>made accountable.</em></h1>
            <p>Enter your team workspace to govern agents, models, tool permissions, and every engineering run.</p>
          </>}
        </div>
        <div className="trust">
          <span><Icon name="shield"/>{isChinese ? "工具级权限控制" : "Tool-level control"}</span>
          <span><Icon name="chart"/>{isChinese ? "完整执行记录" : "Complete run history"}</span>
          <span><Icon name="route"/>{isChinese ? "模型健康与容灾" : "Model resilience"}</span>
        </div>
        <div className="login-copy-foot"><span>SECURE CONTROL PLANE</span><p>{isChinese ? "身份、权限与工程证据在同一条可信链路中完成验证。" : "Identity, access, and engineering evidence are verified across one trusted control plane."}</p></div>
      </section>

      <section className="login-card">
        <div className="card-glow"/>
        <div className="login-form">
          {isChinese ? <form onSubmit={completeSmsLogin}>
            <div className="eyebrow">手机号验证</div>
            <h2>登录 Eval Agent</h2>
            <p>使用管理员已绑定的中国大陆手机号继续访问用户控制台</p>
            <label>手机号
              <input required value={phone} onChange={event => setPhone(event.target.value)} name="phone" type="tel" placeholder="请输入手机号" inputMode="tel" autoComplete="tel" maxLength={17}/>
            </label>
            <label>短信验证码
              <div className="sms-code-row">
                <input required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} name="code" type="text" placeholder="6 位验证码" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}"/>
                <button type="button" className="sms-send" onClick={() => void sendCode()} disabled={sending || countdown > 0 || phone.trim().length < 11}>
                  {sending ? "发送中" : countdown > 0 ? `${countdown}s` : "获取验证码"}
                </button>
              </div>
            </label>
            {notice && <div className="login-notice" role="status">{notice}</div>}
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" className="login-submit" disabled={loading || code.length !== 6}>{loading ? "正在验证…" : <>安全登录 <Icon name="arrow"/></>}</button>
            <small className="policy">验证码由阿里云短信服务发送。未被管理员绑定的手机号不会创建账号，也不会透露账号是否存在。</small>
          </form> : <div className="google-method">
            <div className="eyebrow">GOOGLE IDENTITY</div>
            <h2>Sign in to Eval Agent</h2>
            <p>Use the Google email address provisioned by your administrator.</p>
            {error && <div className="login-error" role="alert">{error}</div>}
            <a className="google-login" href="/api/auth/google/start"><GoogleMark/><span>Continue with Google</span><Icon name="arrow"/></a>
            <div className="login-security-note"><Icon name="shield"/><span>Google verifies your identity. Eval grants access only after the email matches an active organization account.</span></div>
            <small className="policy">No workspace is created during sign-in. Tenant membership and permissions remain controlled by your Eval administrator.</small>
          </div>}
        </div>
      </section>
      <footer>{isChinese ? "© 2026 正在连接（杭州）科技有限公司" : "© 2026 CONNECTING (HANGZHOU) TECHNOLOGY CO., LTD."}</footer>
    </main>
  );
}

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.35 12.27c0-.73-.06-1.27-.2-1.84H12v3.48h5.37a4.58 4.58 0 0 1-1.99 3.01l2.94 2.28c1.72-1.59 3.03-3.93 3.03-6.93Z"/>
    <path fill="#34A853" d="M12 21.75c2.46 0 4.52-.81 6.03-2.21l-2.94-2.28c-.82.55-1.86.87-3.09.87-2.37 0-4.38-1.6-5.1-3.75l-3.04 2.35A9.12 9.12 0 0 0 12 21.75Z"/>
    <path fill="#FBBC05" d="M6.9 14.38A5.5 5.5 0 0 1 6.61 12c0-.83.14-1.64.39-2.38L3.96 7.27A9.75 9.75 0 0 0 2.99 12c0 1.56.37 3.03.97 4.73l2.94-2.35Z"/>
    <path fill="#EA4335" d="M12 5.87c1.34 0 2.54.46 3.49 1.36l2.61-2.61C16.52 3.15 14.46 2.25 12 2.25a9.12 9.12 0 0 0-8.14 5.02L6.9 9.62C7.62 7.47 9.63 5.87 12 5.87Z"/>
  </svg>;
}
