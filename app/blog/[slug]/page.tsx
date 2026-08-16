import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { optionalUserSession } from "../../auth/server";
import { ContentHeader } from "../../content/ContentHeader";
import { publishedBlogPost } from "../../content/store";
import "../../content/style.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await publishedBlogPost(slug);
  return post ? { title: post.title, description: post.excerpt } : { title: "文章未找到" };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [user, post] = await Promise.all([optionalUserSession(), publishedBlogPost(slug)]);
  if (!post) notFound();
  const paragraphs = post.body.split(/\n{2,}/).map(item => item.trim()).filter(Boolean);

  return <div className={`content-site blog-site${user ? " content-workspace" : ""}`}>
    <ContentHeader active="blog" user={user}/>
    <main className="content-main blog-article-main">
      <nav className="content-breadcrumb" aria-label="面包屑"><Link href="/blog">博客</Link><span>/</span><span>文章</span></nav>
      <article className="blog-article">
        <div className="blog-article-kicker">FIELD NOTE / {formatMachineDate(post.publishedAt)}{post.createdVia === "eval_agent" ? " / 由 Eval 辅助发布" : ""}</div>
        <h1>{post.title}</h1>
        <p className="blog-article-excerpt">{post.excerpt}</p>
        <div className="blog-byline"><span><b>{post.authorName.slice(0, 2)}</b><strong>{post.authorName}</strong></span><time>{formatBlogDate(post.publishedAt)}</time></div>
        <div className="blog-body">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <footer><span>文章内容最后更新于 {formatBlogDate(post.updatedAt)}</span><Link href="/blog">返回全部文章</Link></footer>
      </article>
    </main>
    <footer className="content-footer"><span>EVAL AGENT / FIELD NOTES</span><Link href="/forum">进入工程论坛</Link><span>BUILT FOR HARDWARE TEAMS</span></footer>
  </div>;
}

function formatBlogDate(value: number) { return new Date(value * 1000).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }); }
function formatMachineDate(value: number) { return new Date(value * 1000).toISOString().slice(0, 10).replaceAll("-", " / "); }
