"use client";

import { Icon } from "../ui/icons";

export type ContentAdminSnapshot = {
  blogPosts: Array<{ id: string; title: string; slug: string; excerpt: string; body: string; status: string; publishedAt?: number | null; updatedAt: number; authorName: string }>;
  forumTopics: Array<{ id: string; title: string; slug: string; category: string; status: string; pinned: boolean; createdAt: number; lastActivityAt: number; authorName: string; replyCount: number }>;
  forumReplies: Array<{ id: string; topicId: string; topicTitle: string; body: string; status: string; createdAt: number; authorName: string }>;
};

type Props = {
  content: ContentAdminSnapshot;
  busy: boolean;
  action: (name: string, input: Record<string, unknown>, success: string) => Promise<boolean>;
};

export function ContentSettingsView({ content, busy, action }: Props) {
  return <div className="admin-module content-admin-view">
    <section className="content-publish-scope ready">
      <div><span>PUBLIC CONTENT</span><h2>全站博客与论坛</h2><p>已发布文章会直接进入公开博客；论坛内容面向所有已登录的 Eval 用户。</p></div>
      <aside><i/>PUBLICATION READY</aside>
    </section>

    <section className="content-admin-grid">
      <div>
        <div className="content-admin-heading"><span>EDITORIAL DESK</span><h2>博客发布</h2><p>使用纯文本编写文章。发布状态的文章会立即进入公开博客，草稿和归档不会对外显示。</p></div>
        <form className="content-editor-form" onSubmit={event => {
          event.preventDefault();
          const form = event.currentTarget;
          void action("save_blog_post", Object.fromEntries(new FormData(form)), "博客文章已保存。");
        }}>
          <label><span>文章标题</span><input name="title" minLength={4} maxLength={140} required/></label>
          <label><span>发布状态</span><select name="status" defaultValue="draft"><option value="draft">草稿</option><option value="published">立即发布</option></select></label>
          <label className="wide"><span>文章摘要</span><textarea name="excerpt" minLength={10} maxLength={320} required/></label>
          <label className="wide"><span>文章正文</span><textarea className="article-body-input" name="body" minLength={40} maxLength={50000} required/></label>
          <button disabled={busy}>保存文章<Icon name="arrow"/></button>
        </form>

        <div className="content-record-list">
          {content.blogPosts.map(post => <details key={post.id}>
            <summary><div><span className={`content-record-status ${post.status}`}>{blogStatus(post.status)}</span><h3>{post.title}</h3><p>{post.excerpt}</p></div><aside><time>{post.publishedAt ? formatDate(post.publishedAt) : "尚未发布"}</time><Icon name="chevron"/></aside></summary>
            <form onSubmit={event => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void action("save_blog_post", { ...Object.fromEntries(form), id: post.id }, "博客文章已更新。");
            }}>
              <label><span>标题</span><input name="title" minLength={4} maxLength={140} defaultValue={post.title} required/></label>
              <label><span>状态</span><select name="status" defaultValue={post.status}><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label>
              <label className="wide"><span>摘要</span><textarea name="excerpt" minLength={10} maxLength={320} defaultValue={post.excerpt} required/></label>
              <label className="wide"><span>正文</span><textarea className="article-body-input" name="body" minLength={40} maxLength={50000} defaultValue={post.body} required/></label>
              <div className="content-record-actions"><a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer">预览公开地址</a><button disabled={busy}>保存修改</button></div>
            </form>
          </details>)}
          {!content.blogPosts.length && <div className="content-admin-empty">尚无博客文章，从上方编辑第一篇草稿。</div>}
        </div>
      </div>

      <div>
        <div className="content-admin-heading"><span>COMMUNITY MODERATION</span><h2>论坛治理</h2><p>锁定会保留阅读但停止新回复；隐藏会从用户论坛移除。置顶主题始终排在列表前方。</p></div>
        <div className="moderation-list topic-moderation-list">
          {content.forumTopics.map(topic => <article key={topic.id}>
            <div><span>{categoryLabel(topic.category)} · {topic.authorName}</span><h3>{topic.title}</h3><p>{Number(topic.replyCount)} 条可见回复 · {formatDate(topic.lastActivityAt)}</p></div>
            <div className="moderation-controls">
              <select aria-label={`${topic.title}状态`} value={topic.status} disabled={busy} onChange={event => void action("moderate_forum_topic", { id: topic.id, status: event.target.value, pinned: Boolean(topic.pinned) }, "论坛主题状态已更新。")}><option value="open">开放</option><option value="locked">锁定</option><option value="hidden">隐藏</option></select>
              <button disabled={busy} className={topic.pinned ? "active" : ""} onClick={() => void action("moderate_forum_topic", { id: topic.id, status: topic.status, pinned: !topic.pinned }, topic.pinned ? "主题已取消置顶。" : "主题已置顶。")}>{topic.pinned ? "取消置顶" : "置顶"}</button>
              <a href={`/forum/${topic.slug}`} target="_blank" rel="noreferrer">查看</a>
            </div>
          </article>)}
          {!content.forumTopics.length && <div className="content-admin-empty">还没有论坛主题。</div>}
        </div>

        <div className="content-admin-heading reply-heading"><span>RECENT REPLIES</span><h2>最近回复</h2><p>单独隐藏不合适的回复，不影响主题中的其他讨论。</p></div>
        <div className="moderation-list reply-moderation-list">
          {content.forumReplies.map(reply => <article key={reply.id}>
            <div><span>{reply.authorName} · {formatDate(reply.createdAt)}</span><h3>{reply.topicTitle}</h3><p>{compact(reply.body, 150)}</p></div>
            <button disabled={busy} className={reply.status === "hidden" ? "active" : ""} onClick={() => void action("moderate_forum_reply", { id: reply.id, status: reply.status === "hidden" ? "visible" : "hidden" }, reply.status === "hidden" ? "回复已恢复显示。" : "回复已隐藏。")}>{reply.status === "hidden" ? "恢复" : "隐藏"}</button>
          </article>)}
          {!content.forumReplies.length && <div className="content-admin-empty">还没有论坛回复。</div>}
        </div>
      </div>
    </section>
  </div>;
}

function blogStatus(value: string) { return ({ draft: "草稿", published: "已发布", archived: "已归档" } as Record<string, string>)[value] || value; }
function categoryLabel(value: string) { return ({ general: "综合", hardware: "硬件", firmware: "固件", agents: "Agent" } as Record<string, string>)[value] || value; }
function formatDate(value: number) { return new Date(Number(value) * 1000).toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }); }
function compact(value: string, length: number) { const result = value.replace(/\s+/g, " "); return result.length > length ? `${result.slice(0, length)}…` : result; }
