"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";

type Scope =
  | "community.forum.read"
  | "community.forum.topic.create"
  | "community.forum.reply.create"
  | "community.blog.draft.create"
  | "community.blog.publish";
type Settings = { enabled: boolean; allowForumRead: boolean; allowForumTopicCreate: boolean; allowForumReplyCreate: boolean; allowBlogDraftCreate: boolean; allowBlogPublish: boolean };
type Snapshot = {
  settings: Settings;
  policy: Settings & { writesEnabled: boolean; forumTopicsPerHour: number; forumRepliesPerHour: number; blogDraftsPerDay: number; blogPublishesPerDay: number; policyVersion: number };
  roleScopes: Scope[]; effectiveUserScopes: Scope[];
  devices: Array<{ id: string; deviceName: string; clientVersion: string; grantedScopes: Scope[]; lastUsedAt: number; expiresAt: number }>;
  recentActions: Array<{ requestId: string; action: string; resourceType: string | null; resourceId: string | null; status: string; reasonCode: string | null; createdAt: number }>;
};

const controls: Array<{ flag: keyof Omit<Settings, "enabled">; scope: Scope; label: string; detail: string }> = [
  { flag: "allowForumRead", scope: "community.forum.read", label: "读取与总结论坛", detail: "允许桌面 Agent 获取主题和回复。" },
  { flag: "allowForumTopicCreate", scope: "community.forum.topic.create", label: "创建论坛主题", detail: "允许以你的账号发布新主题。" },
  { flag: "allowForumReplyCreate", scope: "community.forum.reply.create", label: "回复论坛主题", detail: "允许以你的账号发布公开回复。" },
  { flag: "allowBlogDraftCreate", scope: "community.blog.draft.create", label: "创建和更新博客草稿", detail: "草稿不会自动公开。" },
  { flag: "allowBlogPublish", scope: "community.blog.publish", label: "自动发布博客", detail: "允许发布你自己的 Eval 博客草稿。" },
];

export function CommunitySettings({ notify }: { notify: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/console/agent-community-settings", { cache: "no-store" });
    const payload = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error || "无法读取社区自动化设置。");
    setSnapshot(payload); setDraft(payload.settings);
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void load().catch(reason => setError(reason instanceof Error ? reason.message : "加载失败。"));
    }, 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/console/agent-community-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error || "保存失败。");
      setSnapshot(payload); setDraft(payload.settings); notify("社区自动化授权已保存。请在设备列表确认当前 Eval 的 Scope。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败。"); }
    finally { setBusy(false); }
  };
  const updateDevice = async (device: Snapshot["devices"][number], scope: Scope, enabled: boolean) => {
    if (!snapshot || busy) return;
    const grantedScopes = enabled ? [...new Set([...device.grantedScopes, scope])] : device.grantedScopes.filter(item => item !== scope);
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/console/agent-community-devices/${encodeURIComponent(device.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantedScopes }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "设备权限更新失败。");
      await load(); notify("设备权限已更新。桌面端刷新后生效。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "设备权限更新失败。"); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    if (busy || !confirm("确定撤销这台设备吗？撤销后需要重新登录绑定。")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/console/agent-community-devices/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("设备撤销失败。");
      await load(); notify("设备已撤销。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "设备撤销失败。"); }
    finally { setBusy(false); }
  };

  if (!snapshot || !draft) return <section className="workspace-page"><div className="workspace-empty"><i/><p>{error || "正在读取社区自动化设置…"}</p></div></section>;
  const effective = new Set(snapshot.effectiveUserScopes);
  const roleScopes = new Set(snapshot.roleScopes);
  return <section className="workspace-page community-console">
    <div className="workspace-page-hero"><small>AGENT COMMUNITY PERMISSIONS</small><h2>决定 Eval 可以代表你做什么。</h2><p>这里控制 Web 账号授权；桌面端还有独立的本地 Allow / Ask / Deny。只有全站策略、账号授权、设备 Scope、角色和桌面本地策略全部允许时，操作才会执行。</p></div>
    {error && <div className="community-console-error">{error}</div>}
    <article className="community-console-panel"><header><div><small>USER CONSENT</small><h3>我的授权</h3></div><Switch checked={draft.enabled} disabled={busy} onChange={enabled => setDraft({ ...draft, enabled })}/></header>
      <div className={!draft.enabled ? "community-console-controls disabled" : "community-console-controls"}>{controls.map(control => <label key={control.scope}><div><b>{control.label}</b><span>{control.detail}</span><small>{!snapshot.policy.enabled || !policyAllows(snapshot.policy, control.flag) ? "管理员未开放" : !roleScopes.has(control.scope) ? "账号角色不允许" : effective.has(control.scope) ? "当前有效" : "等待开启"}</small></div><Switch checked={draft[control.flag]} disabled={busy || !draft.enabled || !snapshot.policy.enabled || !policyAllows(snapshot.policy, control.flag) || !roleScopes.has(control.scope)} onChange={checked => setDraft({ ...draft, [control.flag]: checked })}/></label>)}</div>
      <button className="community-console-save" disabled={busy} onClick={() => void save()}>{busy ? "正在保存…" : "保存我的授权"}<Icon name="arrow"/></button>
    </article>
    <article className="community-console-panel"><header><div><small>AUTHORIZED DEVICES</small><h3>设备 Scope</h3></div><span>{snapshot.devices.length} 台</span></header>{snapshot.devices.length ? snapshot.devices.map(device => <section className="community-device" key={device.id}><header><div><b>{device.deviceName}</b><span>Eval {device.clientVersion} · 最近使用 {formatDate(device.lastUsedAt)}</span></div><button disabled={busy} onClick={() => void revoke(device.id)}>撤销设备</button></header><div>{controls.map(control => { const checked = device.grantedScopes.includes(control.scope); return <label key={control.scope}><input type="checkbox" checked={checked} disabled={busy || (!checked && !effective.has(control.scope))} onChange={event => void updateDevice(device, control.scope, event.target.checked)}/><span>{control.label}</span></label>; })}</div></section>) : <div className="workspace-empty"><i/><p>尚无已绑定的 Eval 桌面设备。</p></div>}</article>
    <article className="community-console-panel"><header><div><small>AUDIT TRAIL</small><h3>最近自动化操作</h3></div><span>{snapshot.recentActions.length} 条</span></header><div className="community-action-list">{snapshot.recentActions.length ? snapshot.recentActions.slice(0, 20).map(action => <div key={`${action.requestId}-${action.createdAt}`}><b>{actionLabel(action.action)}</b><span className={action.status}>{action.status}</span><time>{formatDate(action.createdAt)}</time><code>{action.requestId.slice(0, 18)}</code></div>) : <div className="workspace-empty"><i/><p>尚无社区自动化操作。</p></div>}</div></article>
  </section>;
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) { return <button className={`community-web-switch ${checked ? "on" : ""}`} disabled={disabled} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><i/></button>; }
function policyAllows(policy: Snapshot["policy"], flag: keyof Omit<Settings, "enabled">) { return Boolean(policy[flag]) && (flag === "allowForumRead" || policy.writesEnabled); }
function formatDate(value: number) { return value ? new Date(value * 1000).toLocaleString("zh-CN") : "尚未使用"; }
function actionLabel(value: string) { return ({ "forum.topic.create": "创建论坛主题", "forum.reply.create": "回复论坛主题", "blog.draft.create": "创建博客草稿", "blog.draft.update": "更新博客草稿", "blog.publish": "发布博客" } as Record<string, string>)[value] || value; }
