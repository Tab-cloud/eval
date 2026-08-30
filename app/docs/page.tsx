import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./style.css";

export const metadata: Metadata = {
  title: "使用指南",
  description: "Eval Agent 安装、账号、桌面端授权、社区与更新说明。",
};

export default function DocsPage() {
  return <main className="docs-page">
    <header><Link href="/"><Image src="/favicon.svg" alt="" width={24} height={24}/><span><b>EVAL</b><small>PRODUCT GUIDE</small></span></Link><nav><Link href="/forum">论坛</Link><Link href="/blog">博客</Link><Link href="/console">控制台</Link><Link href="/login">登录</Link></nav></header>
    <section className="docs-hero"><p>PRODUCT GUIDE / 2026</p><h1>下载工具。<br/><em>进入工程现场。</em></h1><span>这里说明 Eval Agent 的安装、账号登录、桌面端授权、版本更新与社区协作方式。</span></section>
    <section className="docs-grid">
      <aside><p>QUICK START</p>{["下载与安装","账号登录","桌面端授权","版本更新","论坛与博客","安全边界"].map((item,index)=><a href={`#section-${index+1}`} key={item}><span>{String(index+1).padStart(2,"0")}</span>{item}</a>)}</aside>
      <article>
        <section id="section-1"><small>01 / INSTALLATION</small><h2>下载已发布的安装包</h2><p>首页和用户控制台各展示一个最新 Windows EXE 与一个 macOS DMG，不重复列出多个 Mac 架构占位。Mac 条目会标明实际发布包的适用架构。</p><div className="docs-note">推荐：从 <Link href="/console">用户控制台</Link> 的“下载”页面获取最新 Stable 版本。没有 Developer ID 签名或 Apple 公证的 macOS 包可能被 Gatekeeper 拦截，首次打开时需要在系统设置中手动确认。</div></section>
        <section id="section-2"><small>02 / SIGN IN</small><h2>一个账号，使用多种可信身份</h2><p>中文界面可通过手机验证码注册并设置账号密码，之后使用手机号验证码、账号密码或已绑定 GitHub 登录；修改密码需要再次验证绑定手机。英文界面仅支持 Google 或 GitHub，并可在个人中心将二者绑定到同一账号。管理员平台继续使用独立入口。</p></section>
        <section id="section-3"><small>03 / DESKTOP AUTHORIZATION</small><h2>在浏览器确认桌面端设备</h2><p>桌面端发起授权后，会显示一次性用户码并打开浏览器确认页。登录后核对设备名称与客户端版本，再选择允许或拒绝。不要批准来源不明的设备。</p></section>
        <section id="section-4"><small>04 / RELEASES</small><h2>跟随正式发布渠道更新</h2><p>版本中心区分 Stable、Beta 与 Internal 渠道。Windows 客户端使用签名更新包自动升级；macOS 当前只发布一个 DMG，用户从官网或控制台下载新版后手动安装。管理员可以保留可追溯的发布记录。</p></section>
        <section id="section-5"><small>05 / COMMUNITY</small><h2>用论坛讨论，用博客沉淀</h2><p><Link href="/forum">工程论坛</Link>适合提问、协作和跟进问题；<Link href="/blog">团队博客</Link>用于发布产品动态、工程方法和整理后的知识内容。</p></section>
        <section id="section-6"><small>06 / SECURITY</small><h2>账号与设备授权始终分离</h2><p>登录会话和桌面端设备会话由服务端独立验证。管理员操作会进入审计日志，密码、短信验证码与登录凭据不会以明文写入日志。</p></section>
      </article>
    </section>
    <footer><span>EVAL AGENT / PRODUCT GUIDE</span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2024097468号-10</a></footer>
  </main>;
}
