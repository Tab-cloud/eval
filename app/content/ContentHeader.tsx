"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "../ui/icons";
import { useTheme } from "../ui/useTheme";

type Props = {
  active: "blog" | "forum";
  user?: { displayName: string } | null;
};

export function ContentHeader({ active, user }: Props) {
  const { theme, toggleTheme } = useTheme();
  return <header className="content-header">
    <Link className="content-brand" href="/" aria-label="Eval Agent 首页">
      <span><Image src="/favicon.svg" alt="" width={24} height={24}/></span>
      <b>Eval Agent</b>
    </Link>
    <nav aria-label="内容导航">
      <Link className={active === "blog" ? "active" : ""} aria-current={active === "blog" ? "page" : undefined} href="/blog">博客</Link>
      <Link className={active === "forum" ? "active" : ""} aria-current={active === "forum" ? "page" : undefined} href="/forum">论坛</Link>
    </nav>
    <div className="content-header-actions">
      <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
        <Icon name={theme === "dark" ? "sun" : "moon"}/>
      </button>
      <Link href={user ? "/console" : "/login"}>{user ? user.displayName : "登录"}<Icon name="arrow"/></Link>
    </div>
  </header>;
}
