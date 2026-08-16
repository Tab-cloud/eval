import type { Metadata } from "next";
import Link from "next/link";
import { optionalUserSession } from "../auth/server";
import { ContentHeader } from "../content/ContentHeader";
import { publishedBlogPosts } from "../content/store";
import "../content/style.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "博客", description: "Eval Agent 团队的产品进展、工程方法与 Agent 实践文章。" };

export default async function BlogPage() {
  const [user, posts] = await Promise.all([optionalUserSession(), publishedBlogPosts()]);
  const [featured, ...rest] = posts;

  return <div className={`content-site blog-site${user ? " content-workspace" : ""}`}>
    <ContentHeader active="blog" user={user}/>
    <main className="content-main">
      <section className="content-hero blog-hero">
        <div><p>FIELD NOTES / EVAL AGENT</p><h1>从真实工程中，<br/><em>提炼可复用的方法。</em></h1></div>
        <aside><span>团队博客</span><p>产品进展、硬件研发实践，以及 Agent 如何进入真实工作流。</p></aside>
      </section>

      {featured ? <Link className="featured-post" href={`/blog/${encodeURIComponent(featured.slug)}`}>
        <div><span>LATEST ARTICLE</span><h2>{featured.title}</h2><p>{featured.excerpt}</p><footer><b>{featured.authorName}</b><time>{formatBlogDate(featured.publishedAt)}</time></footer></div>
        <aside><span>{String(posts.length).padStart(2, "0")}</span><p>已发布文章</p><i>阅读全文</i></aside>
      </Link> : <div className="content-empty blog-empty"><span>EDITORIAL DESK</span><h3>第一篇文章正在准备中</h3><p>管理员发布文章后，这里会直接显示来自 PostgreSQL 的真实内容。</p></div>}

      {rest.length > 0 && <section className="blog-index">
        <div className="blog-index-head"><div><p>ARCHIVE</p><h2>更多文章</h2></div><span>{rest.length} 篇</span></div>
        <div className="blog-grid">{rest.map((post, index) => <Link href={`/blog/${encodeURIComponent(post.slug)}`} key={post.id}><span>{String(index + 2).padStart(2, "0")}</span><time>{formatBlogDate(post.publishedAt)}</time><h3>{post.title}</h3><p>{post.excerpt}</p><footer>{post.authorName}<i>阅读文章</i></footer></Link>)}</div>
      </section>}
    </main>
    <footer className="content-footer"><span>EVAL AGENT / FIELD NOTES</span><Link href="/forum">进入工程论坛</Link><span>BUILT FOR HARDWARE TEAMS</span></footer>
  </div>;
}

function formatBlogDate(value: number) { return new Date(value * 1000).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }); }
