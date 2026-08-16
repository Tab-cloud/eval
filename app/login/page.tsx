"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/icons";
import { useTheme } from "../ui/useTheme";
import { safeReturnPath } from "../auth/return-path";
import "./style.css";

type Locale = "zh" | "en";
type ChineseMethod = "sms" | "password" | "register";

const providerErrors: Record<Locale, Record<string, string>> = {
  zh: {
    github_cancelled: "GitHub 登录已取消。",
    github_failed: "GitHub 无法验证本次登录，请重试。",
    github_not_configured: "当前环境尚未完成 GitHub 登录配置。",
    github_unavailable: "GitHub 登录暂时不可用。",
    github_identity_unavailable: "暂时无法读取 GitHub 账号信息。",
    verified_email_required: "该 GitHub 账号没有可用于登录的已验证邮箱。",
    invalid_state: "登录请求已过期，请重新开始。",
    expired_state: "登录请求已过期，请重新开始。",
    token_exchange_failed: "第三方身份服务无法完成本次登录。",
    invalid_identity: "第三方账号身份无法通过验证。",
    account_not_provisioned: "该邮箱尚未由管理员加入组织。",
    identity_already_linked: "该 GitHub 账号已经绑定其他用户。",
    link_session_required: "绑定会话已过期，请登录后重试。",
    provider_not_allowed: "该登录方式不适用于中文账号。",
    provider_failed: "第三方账号登录失败，请重试。",
  },
  en: {
    google_cancelled: "Google sign-in was cancelled.",
    google_failed: "Google could not verify this sign-in. Please try again.",
    google_not_configured: "Google sign-in has not been configured for this environment.",
    google_unavailable: "Google sign-in is temporarily unavailable.",
    github_cancelled: "GitHub sign-in was cancelled.",
    github_failed: "GitHub could not verify this sign-in. Please try again.",
    github_not_configured: "GitHub sign-in has not been configured for this environment.",
    github_unavailable: "GitHub sign-in is temporarily unavailable.",
    github_identity_unavailable: "GitHub account information is temporarily unavailable.",
    verified_email_required: "This GitHub account has no verified email available for sign-in.",
    invalid_state: "This sign-in request has expired. Please start again.",
    expired_state: "This sign-in request has expired. Please start again.",
    token_exchange_failed: "The identity provider could not complete this sign-in.",
    missing_id_token: "Google did not return a valid identity.",
    invalid_id_token: "Google returned an invalid identity.",
    invalid_identity: "This identity could not be verified.",
    hosted_domain_denied: "This Google Workspace domain is not allowed.",
    account_not_provisioned: "This email has not been invited by an administrator.",
    identity_already_linked: "This identity is already linked to another user.",
    link_session_required: "Your linking session expired. Sign in and try again.",
    provider_not_allowed: "This sign-in method is not available for this account.",
    provider_failed: "Third-party sign-in failed. Please try again.",
  },
};

export default function LoginPage() {
  const pageRef = useRef<HTMLElement>(null);
  const [locale, setLocale] = useState<Locale>("zh");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [chineseMethod, setChineseMethod] = useState<ChineseMethod>("sms");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [returnTo, setReturnTo] = useState("/console");
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const query = new URLSearchParams(location.search);
      const selected: Locale = query.get("lang") === "en" || localStorage.getItem("eval-locale") === "en" ? "en" : "zh";
      setLocale(selected);
      document.documentElement.lang = selected === "zh" ? "zh-CN" : "en";
      const reason = query.get("error");
      if (reason) setError(providerErrors[selected][reason] ?? providerErrors[selected].provider_failed);
      setReturnTo(safeReturnPath(query.get("returnTo")));
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
    const query = new URLSearchParams({ lang: next });
    if (returnTo !== "/console") query.set("returnTo", returnTo);
    history.replaceState(null, "", `/login?${query.toString()}`);
  };

  const sendCode = async (purpose: "login" | "register") => {
    if (sending || countdown > 0) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose }),
      });
      const payload = await response.json() as { error?: string; message?: string; retryAfter?: number };
      if (!response.ok) {
        setError(payload.error ?? "验证码发送失败，请稍后再试。");
        if (response.status === 429) setCountdown(Math.min(Math.max(payload.retryAfter ?? 60, 1), 3600));
        return;
      }
      setNotice(payload.message ?? "验证码请求已受理。");
      setCountdown(payload.retryAfter ?? 60);
    } catch {
      setError("暂时无法连接短信服务，请稍后再试。");
    } finally {
      setSending(false);
    }
  };

  const completeUsernameLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/username/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "登录失败，请稍后再试。");
      location.href = returnTo;
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录失败，请稍后再试。");
      setLoading(false);
    }
  };

  const completeRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, phone, code, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "注册失败，请稍后再试。");
      location.href = returnTo;
    } catch (error) {
      setError(error instanceof Error ? error.message : "注册失败，请稍后再试。");
      setLoading(false);
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
      location.href = returnTo;
    } catch {
      setError("暂时无法连接登录服务，请稍后再试。");
    } finally {
      setLoading(false);
    }
  };

  const isChinese = locale === "zh";
  const oauthHref = (provider: "google" | "github") => `/api/auth/${provider}/start?${new URLSearchParams({
    lang: locale,
    returnTo,
  }).toString()}`;
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
            <p>登录你的团队空间，继续使用 Agent、工程工具、社区内容与每一次工程执行记录。</p>
          </> : <>
            <h1>Engineering,<br/><em>made accountable.</em></h1>
            <p>Enter your team workspace for agents, engineering tools, community knowledge, and every recorded run.</p>
          </>}
        </div>
        <div className="trust">
          <span><Icon name="shield"/>{isChinese ? "工具级权限控制" : "Tool-level control"}</span>
          <span><Icon name="chart"/>{isChinese ? "完整执行记录" : "Complete run history"}</span>
          <span><Icon name="route"/>{isChinese ? "任务恢复与检查点" : "Task recovery"}</span>
        </div>
        <div className="login-copy-foot"><span>SECURE CONTROL PLANE</span><p>{isChinese ? "身份、权限与工程证据在同一条可信链路中完成验证。" : "Identity, access, and engineering evidence are verified across one trusted control plane."}</p></div>
      </section>

      <section className="login-card">
        <div className="card-glow"/>
        <div className="login-form">
          {isChinese ? <div className="zh-method">
            <div className="eyebrow">统一账号</div>
            <h2>{chineseMethod === "register" ? "注册 Eval Agent" : "登录 Eval Agent"}</h2>
            <p>{chineseMethod === "register" ? "验证手机号并设置账号密码，完成后可继续绑定 GitHub。" : "手机号验证码、账号密码或 GitHub 均可进入同一账号。"}</p>
            <div className="login-method-tabs" role="tablist" aria-label="登录方式">
              {(["sms", "password", "register"] as const).map(method => <button key={method} type="button" className={chineseMethod === method ? "active" : ""} onClick={() => { setChineseMethod(method); setError(""); setNotice(""); setCode(""); }}>
                {method === "sms" ? "手机验证码" : method === "password" ? "账号密码" : "注册账号"}
              </button>)}
            </div>
            {chineseMethod === "sms" && <form onSubmit={completeSmsLogin}>
              <label>手机号<input required value={phone} onChange={event => setPhone(event.target.value)} name="phone" type="tel" placeholder="请输入手机号" inputMode="tel" autoComplete="tel" maxLength={17}/></label>
              <label>短信验证码<div className="sms-code-row"><input required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} name="code" type="text" placeholder="6 位验证码" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}"/><button type="button" className="sms-send" onClick={() => void sendCode("login")} disabled={sending || countdown > 0 || phone.trim().length < 11}>{sending ? "发送中" : countdown > 0 ? `${countdown}s` : "获取验证码"}</button></div></label>
              {notice && <div className="login-notice" role="status">{notice}</div>}{error && <div className="login-error" role="alert">{error}</div>}
              <button type="submit" className="login-submit" disabled={loading || code.length !== 6}>{loading ? "正在验证…" : <>安全登录 <Icon name="arrow"/></>}</button>
            </form>}
            {chineseMethod === "password" && <form onSubmit={completeUsernameLogin}>
              <label>账号<input required value={username} onChange={event => setUsername(event.target.value)} name="username" type="text" placeholder="请输入账号" autoComplete="username" minLength={3} maxLength={32}/></label>
              <label>密码<input required value={password} onChange={event => setPassword(event.target.value)} name="password" type="password" placeholder="请输入密码" autoComplete="current-password" minLength={10} maxLength={128}/></label>
              {error && <div className="login-error" role="alert">{error}</div>}
              <button type="submit" className="login-submit" disabled={loading}>{loading ? "正在登录…" : <>账号登录 <Icon name="arrow"/></>}</button>
            </form>}
            {chineseMethod === "register" && <form onSubmit={completeRegistration}>
              <label>账号<input required value={username} onChange={event => setUsername(event.target.value)} name="username" type="text" placeholder="3–32 位账号" autoComplete="username" minLength={3} maxLength={32}/></label>
              <label>设置密码<input required value={password} onChange={event => setPassword(event.target.value)} name="password" type="password" placeholder="至少 10 位，包含字母与数字" autoComplete="new-password" minLength={10} maxLength={128}/></label>
              <label>手机号<input required value={phone} onChange={event => setPhone(event.target.value)} name="phone" type="tel" placeholder="中国大陆手机号" inputMode="tel" autoComplete="tel" maxLength={17}/></label>
              <label>短信验证码<div className="sms-code-row"><input required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} name="code" type="text" placeholder="6 位验证码" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}"/><button type="button" className="sms-send" onClick={() => void sendCode("register")} disabled={sending || countdown > 0 || phone.trim().length < 11}>{sending ? "发送中" : countdown > 0 ? `${countdown}s` : "获取验证码"}</button></div></label>
              {notice && <div className="login-notice" role="status">{notice}</div>}{error && <div className="login-error" role="alert">{error}</div>}
              <button type="submit" className="login-submit" disabled={loading || code.length !== 6}>{loading ? "正在创建…" : <>注册并登录 <Icon name="arrow"/></>}</button>
            </form>}
            <div className="identity-divider"><span>或使用第三方账号</span></div>
            <a className="oauth-login github-login" href={oauthHref("github")}><GitHubMark/><span>使用 GitHub 登录</span><Icon name="arrow"/></a>
            <small className="policy">注册后，手机号、账号密码和绑定的 GitHub 都会进入同一个 Eval 账号。</small>
          </div> : <div className="google-method">
            <div className="eyebrow">ORGANIZATION IDENTITY</div>
            <h2>Sign in to Eval Agent</h2>
            <p>Continue with Google or GitHub. Your first verified identity creates one Eval account; the second can be linked from Profile.</p>
            {error && <div className="login-error" role="alert">{error}</div>}
            <a className="oauth-login google-login" href={oauthHref("google")}><GoogleMark/><span>Continue with Google</span><Icon name="arrow"/></a>
            <a className="oauth-login github-login" href={oauthHref("github")}><GitHubMark/><span>Continue with GitHub</span><Icon name="arrow"/></a>
            <div className="login-security-note"><Icon name="shield"/><span>Verified Google and GitHub identities can be linked to the same Eval account from Profile.</span></div>
            <small className="policy">Only Google and GitHub are available for English accounts. Password and SMS credentials are not enabled.</small>
          </div>}
        </div>
      </section>
      <footer><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2024097468号-10</a></footer>
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

function GitHubMark() {
  return <svg className="github-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.96 10.96 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.64 1.58.24 2.76.12 3.05.74.81 1.19 1.83 1.19 3.09 0 4.4-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.18c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"/>
  </svg>;
}
