import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";
import "./theme.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:41738";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/eval-agent-og.png", metadataBase).toString();

  return {
    metadataBase,
    title: { default: "Eval Agent", template: "%s · Eval Agent" },
    description: "面向硬件研发团队的 Agent 工具、工程社区与可治理执行平台。",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "Eval Agent",
      title: "Eval Agent · 让硬件开发开始行动",
      description: "连接专业 Agent 与工程工具，让硬件研发进入一条可治理、可追踪的执行链。",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Eval Agent" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Eval Agent · 让硬件开发开始行动",
      description: "面向硬件研发团队的 Agent 工具、工程社区与可治理执行平台。",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `(function(){try{var saved=localStorage.getItem('luban-theme');var theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch(e){}})()`;
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><Script id="eval-theme-bootstrap" strategy="beforeInteractive">{themeScript}</Script></head>
      <body>{children}</body>
    </html>
  );
}
