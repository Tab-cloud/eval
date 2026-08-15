"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { Icon } from "../../../ui/icons";
import { useTheme } from "../../../ui/useTheme";

export function AdminLogin() {
  const pageRef = useRef<HTMLElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useTheme();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "暂时无法登录，请稍后重试。");
        return;
      }
      location.href = "/admin";
    } catch {
      setError("暂时无法连接登录服务，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="admin-auth-page"
      ref={pageRef}
      onPointerMove={event => {
        pageRef.current?.style.setProperty("--auth-pointer-x", `${event.clientX}px`);
        pageRef.current?.style.setProperty("--auth-pointer-y", `${event.clientY}px`);
        pageRef.current?.style.setProperty("--auth-pointer-opacity", "1");
      }}
      onPointerLeave={() => pageRef.current?.style.setProperty("--auth-pointer-opacity", "0")}
    >
      <div className="admin-auth-pointer" aria-hidden="true"/>
      <header className="admin-auth-header">
        <Link href="/" className="admin-auth-brand" aria-label="返回 Eval Agent 首页">
          <span><Image src="/favicon.svg" alt="" width={22} height={22}/></span>
          <div><b>Eval Admin</b><small>CONTROL PLANE</small></div>
        </Link>
        <div className="admin-auth-actions">
          <Link href="/login">用户登录</Link>
          <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
            <Icon name={theme === "dark" ? "sun" : "moon"}/>
          </button>
        </div>
      </header>

      <section className="admin-auth-story" aria-labelledby="admin-auth-title">
        <div className="admin-auth-index"><span>AUTHORIZATION / 01</span><i/><span>RESTRICTED ACCESS</span></div>
        <div className="admin-auth-signal"><i/>ADMINISTRATIVE IDENTITY</div>
        <h1 id="admin-auth-title">进入控制层。<br/><em>管理每一次变化。</em></h1>
        <p>面向平台管理员的独立入口。用户、登录方式、社区内容、工具版本与产品套餐，均在可审计的权限边界内完成。</p>
        <div className="admin-auth-points">
          <span><Icon name="shield"/><b>管理员角色校验</b><small>仅限授权控制平面账号</small></span>
          <span><Icon name="clock"/><b>登录风险控制</b><small>失败限制与安全会话</small></span>
          <span><Icon name="chart"/><b>操作全程留痕</b><small>关键配置可追溯</small></span>
        </div>
      </section>

      <section className="admin-auth-panel" aria-label="管理员账号登录">
        <div className="admin-auth-panel-top"><span>ADMIN ACCESS</span><i/><strong>SECURE</strong></div>
        <form onSubmit={submit}>
          <div className="admin-auth-form-heading">
            <span>欢迎回来</span>
            <h2>管理员登录</h2>
            <p>使用已配置管理员权限的用户名和密码进入控制室。</p>
          </div>
          <label>
            <span>管理员用户名</span>
            <input
              type="text"
              name="username"
              value={username}
              onChange={event => setUsername(event.target.value.toLowerCase())}
              placeholder="输入管理员用户名"
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9][a-z0-9._-]{2,31}"
              autoFocus
              required
            />
          </label>
          <label>
            <span>密码</span>
            <div className="admin-auth-password">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="输入管理员密码"
                autoComplete="current-password"
                minLength={6}
                maxLength={128}
                required
              />
              <button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? "隐藏" : "显示"}</button>
            </div>
          </label>
          {error && <div className="admin-auth-error" role="alert"><i/>{error}</div>}
          <button className="admin-auth-submit" type="submit" disabled={loading}>
            <span>{loading ? "正在验证身份…" : "进入管理员控制室"}</span><Icon name="arrow"/>
          </button>
          <div className="admin-auth-policy"><Icon name="shield"/><p>该入口不会创建账号。登录身份必须已启用，并拥有租户管理员或平台管理员权限。</p></div>
        </form>
      </section>

      <footer><span>正在连接（杭州）科技有限公司</span><i/><span>GOVERNED OPERATIONS</span></footer>
    </main>
  );
}
