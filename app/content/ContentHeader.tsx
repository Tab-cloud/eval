"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTheme } from "../ui/useTheme";

type Props = {
  active: "blog" | "forum";
  user?: { displayName: string } | null;
};

export function ContentHeader({ active, user }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [locale, setLocale] = useState<"zh" | "en">(() => typeof localStorage !== "undefined" && localStorage.getItem("eval-locale") === "en" ? "en" : "zh");
  const isZh = locale === "zh";
  const toggleLocale = () => {
    const next = locale === "zh" ? "en" : "zh";
    setLocale(next);
    localStorage.setItem("eval-locale", next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  };

  return <>
    <header className="content-header">
      <Link className="content-brand" href="/#top" aria-label={isZh ? "Eval Agent 首页" : "Eval Agent home"}>
        <span className="content-brand-mark"><Image src="/favicon.svg" alt="" width={24} height={24}/></span>
        <span className="content-brand-copy"><b>Eval</b><small>Agent System</small></span>
      </Link>
      <nav aria-label={isZh ? "网站导航" : "Site navigation"}>
        <Link href="/#difference">{isZh ? "为何不同" : "Difference"}</Link>
        <Link href="/#system">{isZh ? "系统能力" : "System"}</Link>
        <Link href="/#audience">{isZh ? "适用人群" : "For whom"}</Link>
        <Link href="/#downloads">{isZh ? "下载" : "Download"}</Link>
        <Link className={active === "blog" ? "active" : ""} aria-current={active === "blog" ? "page" : undefined} href="/blog">{isZh ? "博客" : "Blog"}</Link>
        <Link className={active === "forum" ? "active" : ""} aria-current={active === "forum" ? "page" : undefined} href="/forum">{isZh ? "论坛" : "Forum"}</Link>
      </nav>
      <div className="content-header-actions">
        <button className="language-switch" type="button" onClick={toggleLocale} aria-label={isZh ? "切换到英文" : "Switch to Chinese"}>{isZh ? "EN" : "中文"}</button>
        <button className="theme-switch" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>{theme === "dark" ? "LIGHT" : "DARK"}</button>
        <Link href={user ? "/console" : "/login"}>{user ? (isZh ? "控制台" : "Console") : (isZh ? "登录" : "Sign in")} <span className="css-arrow" aria-hidden="true"/></Link>
      </div>
    </header>
    <nav className="content-mobile-content" aria-label={isZh ? "移动端内容导航" : "Mobile content navigation"}>
      <Link className={active === "blog" ? "active" : ""} aria-current={active === "blog" ? "page" : undefined} href="/blog">{isZh ? "团队博客" : "Blog"}</Link>
      <Link className={active === "forum" ? "active" : ""} aria-current={active === "forum" ? "page" : undefined} href="/forum">{isZh ? "工程论坛" : "Forum"}</Link>
    </nav>
  </>;
}
