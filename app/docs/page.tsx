import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./style.css";

export const metadata: Metadata = {
  title: "开发者文档",
  description: "Eval Agent OpenAI-compatible API、认证与调用说明。",
};

const chatExample = `curl https://your-domain.example/api/v1/chat/completions \\
  -H "Authorization: Bearer eval_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "管理员配置中的模型 ID",
    "messages": [{"role": "user", "content": "检查这段固件逻辑"}],
    "stream": true
  }'`;

export default function DocsPage() {
  return <main className="docs-page">
    <header><Link href="/"><Image src="/favicon.svg" alt="" width={24} height={24}/><span><b>EVAL</b><small>DEVELOPER SYSTEM</small></span></Link><nav><Link href="/console">控制台</Link><Link href="/login">登录</Link></nav></header>
    <section className="docs-hero"><p>DEVELOPER INTERFACE / V1</p><h1>一个端点。<br/><em>进入所有模型。</em></h1><span>当前接口使用 OpenAI-compatible JSON 契约。租户身份由服务端根据 API Key 反查，客户端不能指定组织。</span></section>
    <section className="docs-grid">
      <aside><p>QUICK START</p>{["认证","模型目录","Chat Completions","Responses","错误与限流"].map((item,index)=><a href={`#section-${index+1}`} key={item}><span>0{index+1}</span>{item}</a>)}</aside>
      <article>
        <section id="section-1"><small>01 / AUTHENTICATION</small><h2>创建并保护 API Key</h2><p>在用户控制台的“API 密钥”中创建密钥。完整密钥只显示一次，服务端只保存 SHA-256 哈希。建议按生产、测试和本地环境分别创建。</p><div className="docs-note">请求头：<code>Authorization: Bearer eval_live_...</code></div></section>
        <section id="section-2"><small>02 / MODELS</small><h2>读取当前组织的真实模型</h2><p><code>GET /api/v1/models</code> 仅返回管理员已经启用的模型配置，需要 <code>models:read</code> Scope。</p></section>
        <section id="section-3"><small>03 / CHAT COMPLETIONS</small><h2>流式或非流式调用</h2><pre><code>{chatExample}</code></pre></section>
        <section id="section-4"><small>04 / RESPONSES</small><h2>Responses API</h2><p>向 <code>POST /api/v1/responses</code> 发送 OpenAI-compatible 请求。网关会将公开模型标识映射为管理员配置的上游模型 ID。</p></section>
        <section id="section-5"><small>05 / OPERATIONS</small><h2>错误、限流与追踪</h2><p>每个响应都会返回 <code>X-Eval-Request-Id</code> 和 <code>X-Eval-Latency-Ms</code>。超过模型 RPM 时返回 429；上游凭据未部署时返回 503；上游不可用时返回 502。</p></section>
      </article>
    </section>
    <footer><span>EVAL AGENT / API V1</span><span>正在连接（杭州）科技有限公司</span></footer>
  </main>;
}
