import { bearerToken, getDesktopSession } from "../auth/desktop";
import { ContentValidationError } from "../content/store";
import { CommunityAuthorizationError, type AgentCommunityContext } from "./policy-store";

export type AgentErrorCode = "unauthenticated" | "scope_denied" | "site_policy_denied" | "user_consent_denied" |
  "role_denied" | "content_not_found" | "topic_locked" | "idempotency_conflict" | "validation_error" |
  "rate_limited" | "invalid_request" | "internal_error";

export class AgentApiError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

export function agentRequestId() {
  return `req_${crypto.randomUUID()}`;
}

export async function requireAgentContext(request: Request): Promise<AgentCommunityContext> {
  const context = await getDesktopSession(bearerToken(request));
  if (!context) throw new AgentApiError("unauthenticated", "桌面账号登录已失效。", 401);
  return context;
}

export async function readAgentJson(request: Request, options: { allowEmpty?: boolean; maxBytes?: number } = {}) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  const maxBytes = options.maxBytes ?? 64 * 1024;
  if (contentLength > maxBytes) throw new AgentApiError("validation_error", "请求正文过大。", 422, { maxBytes });
  const text = await request.text();
  if (!text.trim() && options.allowEmpty) return {};
  if (!contentType.startsWith("application/json")) throw new AgentApiError("invalid_request", "写请求必须使用 application/json。", 415);
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new AgentApiError("validation_error", "请求正文过大。", 422, { maxBytes });
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AgentApiError("invalid_request", "请求 JSON 格式无效。", 400);
  }
}

export function agentJson(data: unknown, requestId: string, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
      ...headers,
    },
  });
}

export function agentError(error: unknown, requestId: string) {
  const normalized = normalizeAgentError(error);
  return agentJson({ error: { code: normalized.code, message: normalized.message, requestId, details: normalized.details } }, requestId, normalized.status,
    normalized.retryAfter ? { "Retry-After": String(normalized.retryAfter) } : undefined);
}

export function normalizeAgentError(error: unknown): AgentApiError {
  if (error instanceof AgentApiError) return error;
  if (error instanceof CommunityAuthorizationError) return new AgentApiError(error.code, error.message, 403);
  if (error instanceof ContentValidationError) return new AgentApiError("validation_error", error.message, 422);
  return new AgentApiError("internal_error", "服务暂时无法处理该请求。", 500);
}

export function parseBoundedLimit(value: string | null, fallback: number, maximum: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) throw new AgentApiError("validation_error", `limit 必须是 1–${maximum} 的整数。`, 422);
  return parsed;
}

export function parseIsoTime(value: string | null) {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new AgentApiError("validation_error", "since 必须是有效的 ISO 8601 时间。", 422);
  return Math.floor(milliseconds / 1000);
}

export function isoTime(epoch: number | null | undefined) {
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}
