import { authDatabase } from "../auth/core";
import type { PreparedStatement } from "../../db/postgres";
import { AgentApiError } from "./agent-api";
import type { AgentCommunityContext } from "./policy-store";
import { ensureAgentCommunitySchema } from "./schema";

type ActionRow = {
  id: string;
  request_digest: string;
  status: string;
  response: unknown;
  created_at: number;
};

export type AgentActionHandle = { id: string; replay?: { status: number; body: unknown } };

export async function beginAgentAction(context: AgentCommunityContext, requestId: string, action: string, idempotencyKey: string | null, input: Record<string, unknown>, idempotencyIdentity = ""): Promise<AgentActionHandle> {
  await ensureAgentCommunitySchema();
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw new AgentApiError("invalid_request", "写请求必须携带 UUID 格式的 Idempotency-Key。", 400);
  }
  const keyHash = await sha256(idempotencyKey);
  const requestDigest = await sha256(`${action}:${idempotencyIdentity}:${stableStringify(input)}`);
  const db = authDatabase();
  const now = epochSeconds();
  const id = `aca_${crypto.randomUUID()}`;
  try {
    await db.prepare(`INSERT INTO agent_community_actions (id, request_id, user_id, desktop_session_id, action,
      idempotency_key_hash, request_digest, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`)
      .bind(id, requestId, context.user.id, context.session.id, action, keyHash, requestDigest, now).run();
    return { id };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const existing = await db.prepare(`SELECT id, request_digest, status, response, created_at
    FROM agent_community_actions WHERE desktop_session_id = ? AND idempotency_key_hash = ? LIMIT 1`)
    .bind(context.session.id, keyHash).first<ActionRow>();
  if (!existing || existing.request_digest !== requestDigest) {
    throw new AgentApiError("idempotency_conflict", "同一幂等键不能用于不同请求。", 409);
  }
  if (existing.status === "completed" && existing.response && typeof existing.response === "object") {
    const replay = existing.response as { status?: unknown; body?: unknown };
    return { id: existing.id, replay: { status: Number(replay.status ?? 200), body: replay.body } };
  }
  if (existing.status === "accepted" && now - Number(existing.created_at) <= 120) {
    throw new AgentApiError("idempotency_conflict", "相同请求仍在处理中，请稍后重试。", 409);
  }
  await db.prepare(`UPDATE agent_community_actions SET request_id=?, status='accepted', reason_code=NULL,
    response=NULL, resource_type=NULL, resource_id=NULL, created_at=?, completed_at=NULL WHERE id=?`)
    .bind(requestId, now, existing.id).run();
  return { id: existing.id };
}

export async function enforceAgentActionLimit(context: AgentCommunityContext, action: string, limit: number, windowSeconds: number) {
  if (limit <= 0) throw new AgentApiError("rate_limited", "管理员已将此项自动化操作的限额设为 0。", 429, {}, windowSeconds);
  const since = epochSeconds() - windowSeconds;
  const db = authDatabase();
  const [userCount, deviceCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM agent_community_actions WHERE user_id=? AND action=? AND status IN ('accepted', 'completed') AND created_at>=?")
      .bind(context.user.id, action, since).first<{ count: number | string }>(),
    db.prepare("SELECT COUNT(*) AS count FROM agent_community_actions WHERE desktop_session_id=? AND action=? AND status IN ('accepted', 'completed') AND created_at>=?")
      .bind(context.session.id, action, since).first<{ count: number | string }>(),
  ]);
  if (Number(userCount?.count ?? 0) > limit || Number(deviceCount?.count ?? 0) > limit) {
    throw new AgentApiError("rate_limited", "Eval 自动化操作已达到当前限额。", 429, { limit, windowSeconds }, windowSeconds);
  }
}

export function agentCompletionStatements(context: AgentCommunityContext, handle: AgentActionHandle, requestId: string, action: string, resourceType: string, resourceId: string, responseStatus: number, body: Record<string, unknown>): PreparedStatement[] {
  const db = authDatabase();
  const now = epochSeconds();
  return [
    db.prepare(`UPDATE agent_community_actions SET status='completed', resource_type=?, resource_id=?, response=?, completed_at=? WHERE id=?`)
      .bind(resourceType, resourceId, JSON.stringify({ status: responseStatus, body }), now, handle.id),
    db.prepare(`INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(`audit_${crypto.randomUUID()}`, context.user.id, action, resourceType, resourceId,
        JSON.stringify({ requestId, desktopSessionId: context.session.id, createdVia: "eval_agent" }), now),
  ];
}

export async function rejectAgentAction(handle: AgentActionHandle | null, code: string) {
  if (!handle) return;
  await authDatabase().prepare("UPDATE agent_community_actions SET status='rejected', reason_code=?, completed_at=? WHERE id=? AND status='accepted'")
    .bind(code, epochSeconds(), handle.id).run();
}

export async function failAgentAction(handle: AgentActionHandle | null) {
  if (!handle) return;
  await authDatabase().prepare("UPDATE agent_community_actions SET status='failed', reason_code='internal_error', completed_at=? WHERE id=? AND status='accepted'")
    .bind(epochSeconds(), handle.id).run();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

function isUniqueViolation(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505"); }
function epochSeconds() { return Math.floor(Date.now() / 1000); }
