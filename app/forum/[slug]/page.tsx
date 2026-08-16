import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserSession } from "../../auth/server";
import { ContentHeader } from "../../content/ContentHeader";
import { forumTopic, type ForumCategory } from "../../content/store";
import { ReplyComposer } from "../ForumComposer";
import "../../content/style.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "论坛主题" };

export default async function ForumTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUserSession();
  const { slug } = await params;
  const data = await forumTopic(user, slug);
  if (!data) notFound();

  return <div className="content-site content-workspace">
    <ContentHeader active="forum" user={user}/>
    <main className="content-main topic-detail-main">
      <nav className="content-breadcrumb" aria-label="面包屑"><Link href="/forum">论坛</Link><span>/</span><Link href={`/forum?category=${data.topic.category}`}>{categoryLabel(data.topic.category)}</Link></nav>
      <article className="topic-detail">
        <div className="topic-detail-meta"><span>{categoryLabel(data.topic.category)}</span>{data.topic.createdVia === "eval_agent" && <i className="eval-agent-badge">由 Eval 辅助发布</i>}{data.topic.pinned && <i>置顶主题</i>}{data.topic.status === "locked" && <i>讨论已锁定</i>}</div>
        <h1>{data.topic.title}</h1>
        <div className="topic-author"><b>{initials(data.topic.authorName)}</b><span><strong>{data.topic.authorName}</strong><small>{formatDate(data.topic.createdAt)} 发布 · {data.topic.replyCount} 条回复</small></span></div>
        <div className="plain-content">{data.topic.body}</div>
      </article>

      <section className="reply-section">
        <div className="reply-section-head"><div><p>DISCUSSION / {String(data.replies.length).padStart(2, "0")}</p><h2>讨论回复</h2></div><Link href="/forum">返回全部主题</Link></div>
        <div className="reply-list">
          {data.replies.map((reply, index) => <article key={reply.id}><aside><b>{initials(reply.authorName)}</b><span>{String(index + 1).padStart(2, "0")}</span></aside><div><div><strong>{reply.authorName}{reply.createdVia === "eval_agent" && <i className="eval-agent-inline">由 Eval 辅助发布</i>}</strong><time>{formatDate(reply.createdAt)}</time></div><p>{reply.body}</p></div></article>)}
          {!data.replies.length && <div className="content-empty compact"><span>FIRST RESPONSE</span><h3>还没有回复</h3><p>如果你有相关经验，可以成为第一个参与讨论的人。</p></div>}
        </div>
        {data.topic.status === "open" ? <ReplyComposer topicId={data.topic.id}/> : <div className="topic-locked-note">管理员已锁定该主题，现有内容仍可阅读，但不再接受新回复。</div>}
      </section>
    </main>
      <footer className="content-footer"><span>EVAL AGENT / ENGINEERING COMMUNITY</span><Link href="/forum">返回论坛</Link><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2024097468号-10</a></footer>
  </div>;
}

function categoryLabel(category: ForumCategory) { return ({ general: "综合讨论", hardware: "硬件设计", firmware: "固件开发", agents: "Agent 实践" })[category]; }
function initials(value: string) { return value.trim().slice(0, 2).toUpperCase(); }
function formatDate(value: number) { return new Date(value * 1000).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
