"use client";

import { Icon } from "../ui/icons";

export type AgentCommunityPolicy = {
  enabled: boolean; writesEnabled: boolean; allowForumRead: boolean; allowForumTopicCreate: boolean;
  allowForumReplyCreate: boolean; allowBlogDraftCreate: boolean; allowBlogPublish: boolean;
  forumTopicsPerHour: number; forumRepliesPerHour: number; blogDraftsPerDay: number; blogPublishesPerDay: number;
  policyVersion: number; updatedAt: number;
};
export type AgentCommunityAction = { requestId: string; userId: string; desktopSessionId: string; action: string; resourceType: string | null; resourceId: string | null; status: string; reasonCode: string | null; createdAt: number };

export function AgentCommunityPolicyView({ policy, actions, busy, action }: {
  policy: AgentCommunityPolicy; actions: AgentCommunityAction[]; busy: boolean;
  action: (name: string, input: Record<string, unknown>, success: string) => Promise<boolean>;
}) {
  const writesActive = policy.enabled && policy.writesEnabled;
  return <div className="admin-module agent-community-admin">
    <section className="admin-module-head"><div><p>AGENT COMMUNITY GOVERNANCE</p><h2>Eval 社区自动化全站策略</h2></div><p>全站策略只决定能力上限。用户授权、设备 Scope、账号角色以及桌面本地策略仍会继续收紧权限。</p></section>
    <section className={`agent-community-emergency ${writesActive ? "live" : "stopped"}`}><div><Icon name="shield"/><span><b>{writesActive ? "社区写入已开放" : "社区写入已停止"}</b><small>策略版本 {policy.policyVersion} · {policy.updatedAt ? new Date(policy.updatedAt * 1000).toLocaleString("zh-CN") : "尚未配置"}</small></span></div><button disabled={busy || !writesActive} onClick={() => void action("disable_agent_community_writes", {}, "所有 Eval 社区写入已立即停止。")}>紧急停止所有写入</button></section>
    <section className="admin-form"><div><p>GLOBAL POLICY</p><h2>能力和限额</h2><span>默认关闭。发布博客同时要求管理员角色；所有公开写入都有幂等、限流和审计。</span></div><form key={policy.policyVersion} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void action("save_agent_community_policy", {
      enabled: form.get("enabled") === "on", writesEnabled: form.get("writesEnabled") === "on",
      allowForumRead: form.get("allowForumRead") === "on", allowForumTopicCreate: form.get("allowForumTopicCreate") === "on",
      allowForumReplyCreate: form.get("allowForumReplyCreate") === "on", allowBlogDraftCreate: form.get("allowBlogDraftCreate") === "on",
      allowBlogPublish: form.get("allowBlogPublish") === "on", forumTopicsPerHour: Number(form.get("forumTopicsPerHour")),
      forumRepliesPerHour: Number(form.get("forumRepliesPerHour")), blogDraftsPerDay: Number(form.get("blogDraftsPerDay")),
      blogPublishesPerDay: Number(form.get("blogPublishesPerDay")),
    }, "Eval 社区自动化全站策略已保存。"); }}>
      <div className="agent-community-parent"><label><input name="enabled" type="checkbox" defaultChecked={policy.enabled}/><span>启用社区自动化</span></label><label><input name="writesEnabled" type="checkbox" defaultChecked={policy.writesEnabled}/><span>允许社区写入</span></label></div>
      <div className="agent-community-capabilities">
        <PolicyToggle name="allowForumRead" label="论坛读取" checked={policy.allowForumRead}/><PolicyToggle name="allowForumTopicCreate" label="论坛发帖" checked={policy.allowForumTopicCreate}/><PolicyToggle name="allowForumReplyCreate" label="论坛回复" checked={policy.allowForumReplyCreate}/><PolicyToggle name="allowBlogDraftCreate" label="博客草稿" checked={policy.allowBlogDraftCreate}/><PolicyToggle name="allowBlogPublish" label="博客发布" checked={policy.allowBlogPublish}/>
      </div>
      <div className="agent-community-limits"><label>主题 / 小时<input name="forumTopicsPerHour" type="number" min="0" max="20" defaultValue={policy.forumTopicsPerHour}/></label><label>回复 / 小时<input name="forumRepliesPerHour" type="number" min="0" max="100" defaultValue={policy.forumRepliesPerHour}/></label><label>草稿 / 天<input name="blogDraftsPerDay" type="number" min="0" max="20" defaultValue={policy.blogDraftsPerDay}/></label><label>发布 / 天<input name="blogPublishesPerDay" type="number" min="0" max="10" defaultValue={policy.blogPublishesPerDay}/></label></div>
      <button disabled={busy}>保存全站策略 <Icon name="arrow"/></button>
    </form></section>
    <section className="agent-community-actions"><header><div><p>RECENT AGENT ACTIONS</p><h2>最近 100 条自动化操作</h2></div><span>{actions.length} 条</span></header>{actions.length ? actions.map(item => <article key={`${item.requestId}-${item.createdAt}`}><div><b>{actionLabel(item.action)}</b><small>{item.action}</small></div><span className={item.status}>{item.status}</span><code>{item.reasonCode || "—"}</code><time>{new Date(item.createdAt * 1000).toLocaleString("zh-CN")}</time><code>{item.requestId.slice(0, 18)}</code></article>) : <div className="admin-empty"><i/><h3>尚无自动化操作</h3><p>桌面 Agent 使用社区工具后，操作会在这里显示。</p></div>}</section>
  </div>;
}

function PolicyToggle({ name, label, checked }: { name: string; label: string; checked: boolean }) { return <label><input name={name} type="checkbox" defaultChecked={checked}/><span>{label}</span></label>; }
function actionLabel(value: string) { return ({ "forum.topic.create": "创建论坛主题", "forum.reply.create": "论坛回复", "blog.draft.create": "创建博客草稿", "blog.draft.update": "更新博客草稿", "blog.publish": "发布博客" } as Record<string, string>)[value] || "社区操作"; }
