"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "../ui/icons";

export function TopicComposer() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return <form className="topic-composer" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/forum/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      const payload = await response.json() as { slug?: string; error?: string };
      if (!response.ok || !payload.slug) throw new Error(payload.error || "发布失败，请稍后重试。");
      window.location.assign(`/forum/${encodeURIComponent(payload.slug)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败，请稍后重试。");
      setBusy(false);
    }
  }}>
    <label><span>主题标题</span><input name="title" minLength={4} maxLength={120} placeholder="描述你正在解决的问题" required/></label>
    <label><span>分类</span><select name="category" defaultValue="general"><option value="general">综合讨论</option><option value="hardware">硬件设计</option><option value="firmware">固件开发</option><option value="agents">Agent 实践</option></select></label>
    <label className="composer-body"><span>正文</span><textarea name="body" minLength={20} maxLength={10000} placeholder="补充背景、已尝试的方法和期望结果…" required/></label>
    {error && <p className="content-form-error" role="alert">{error}</p>}
    <button disabled={busy} type="submit">{busy ? "正在发布…" : "发布主题"}<Icon name="arrow"/></button>
  </form>;
}

export function ReplyComposer({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return <form className="reply-composer" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch(`/api/forum/topics/${encodeURIComponent(topicId)}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "回复失败，请稍后重试。");
      form.reset();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "回复失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }}>
    <label><span>参与讨论</span><textarea name="body" minLength={2} maxLength={5000} placeholder="写下你的经验、建议或补充信息…" required/></label>
    <div>{error ? <p className="content-form-error" role="alert">{error}</p> : <small>请保持内容具体、友善并与主题相关。</small>}<button disabled={busy}>{busy ? "正在回复…" : "提交回复"}<Icon name="arrow"/></button></div>
  </form>;
}
