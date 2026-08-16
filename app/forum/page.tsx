import type { Metadata } from "next";
import Link from "next/link";
import { requireUserSession } from "../auth/server";
import { ContentHeader } from "../content/ContentHeader";
import { forumCategories, forumOverview, type ForumCategory } from "../content/store";
import { TopicComposer } from "./ForumComposer";
import "../content/style.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "工程论坛", description: "Eval Agent 用户交流硬件、固件与 Agent 实践的空间。" };

export default async function ForumPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await requireUserSession();
  const { category } = await searchParams;
  const data = await forumOverview(user, category);
  const total = Object.values(data.categoryCounts).reduce((sum, count) => sum + count, 0);

  return <div className="content-site">
    <ContentHeader active="forum" user={{ displayName: user.displayName }}/>
    <main className="content-main">
      <section className="content-hero forum-hero">
        <div><p>ENGINEERING COMMUNITY / EVAL AGENT</p><h1>把问题说清楚。<br/><em>把经验留下来。</em></h1></div>
        <aside><span>用户论坛</span><strong>{total}</strong><small>个可见主题 · 登录后参与讨论</small></aside>
      </section>

      <section className="forum-layout">
        <div className="forum-feed">
          <nav className="forum-categories" aria-label="论坛分类">
            <Link className={!data.selectedCategory ? "active" : ""} href="/forum"><span>全部主题</span><b>{total}</b></Link>
            {forumCategories.map(item => <Link key={item} className={data.selectedCategory === item ? "active" : ""} href={`/forum?category=${item}`}><span>{categoryLabel(item)}</span><b>{data.categoryCounts[item]}</b></Link>)}
          </nav>
          <div className="forum-feed-head"><div><p>RECENT SIGNAL</p><h2>{data.selectedCategory ? categoryLabel(data.selectedCategory) : "最新讨论"}</h2></div><span>按最近互动排序</span></div>
          <div className="topic-list">
            {data.topics.map(topic => <Link className="topic-card" href={`/forum/${encodeURIComponent(topic.slug)}`} key={topic.id}>
              <div className="topic-card-top"><span>{categoryLabel(topic.category)}</span>{topic.pinned && <i>置顶</i>}{topic.status === "locked" && <i>已锁定</i>}</div>
              <h3>{topic.title}</h3>
              <p>{excerpt(topic.body, 150)}</p>
              <footer><span><b>{initials(topic.authorName)}</b>{topic.authorName}</span><time>{formatContentDate(topic.lastActivityAt)}</time><strong>{topic.replyCount} 条回复</strong></footer>
            </Link>)}
            {!data.topics.length && <div className="content-empty"><span>NO DISCUSSION YET</span><h3>这里还没有主题</h3><p>从右侧发布第一条工程讨论，让知识从真实问题开始沉淀。</p></div>}
          </div>
        </div>
        <aside className="forum-compose-panel">
          <div className="compose-heading"><span>NEW TOPIC</span><h2>发起讨论</h2><p>面向 Eval 用户发布。正文仅按纯文本展示，不执行 HTML 或脚本。</p></div>
          <TopicComposer/>
          <div className="community-guidance"><span>COMMUNITY NOTES</span><ul><li>提供足够的工程背景和复现条件</li><li>不要粘贴密钥、客户数据或未脱敏日志</li><li>每小时最多发布 5 个主题</li></ul></div>
        </aside>
      </section>
    </main>
    <footer className="content-footer"><span>EVAL AGENT / ENGINEERING COMMUNITY</span><Link href="/blog">阅读博客</Link><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2024097468号-10</a></footer>
  </div>;
}

function categoryLabel(category: ForumCategory) {
  return ({ general: "综合讨论", hardware: "硬件设计", firmware: "固件开发", agents: "Agent 实践" })[category];
}

function excerpt(value: string, length: number) {
  const compact = value.replace(/\s+/g, " ");
  return compact.length > length ? `${compact.slice(0, length)}…` : compact;
}

function initials(value: string) { return value.trim().slice(0, 2).toUpperCase(); }
function formatContentDate(value: number) { return new Date(value * 1000).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
