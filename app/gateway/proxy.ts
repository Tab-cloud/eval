import { authDatabase } from "../auth/core";
import { ensureGatewaySchema } from "../console/store";
import { isResponse, requireApiIdentity, requireScope } from "../api/v1/_shared/auth";

type GatewayEndpoint = "chat.completions" | "responses";
type ModelConfig = {
  id: string;
  model_id: string;
  base_url: string;
  secret_ref: string;
  requests_per_minute: number;
};

export async function proxyGateway(request: Request, endpoint: GatewayEndpoint) {
  const identity = await requireApiIdentity(request);
  if (isResponse(identity)) return identity;
  const forbidden = requireScope(identity, "models:invoke");
  if (forbidden) return forbidden;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2 * 1024 * 1024) return gatewayError(413, "REQUEST_TOO_LARGE", "请求体不能超过 2 MB。");
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return gatewayError(400, "INVALID_JSON", "请求体必须是 JSON。"); }
  const requestedModel = typeof payload.model === "string" ? payload.model.trim() : "";
  if (!requestedModel) return gatewayError(400, "MODEL_REQUIRED", "缺少 model 参数。");

  await ensureGatewaySchema();
  const db = authDatabase();
  const model = await db.prepare(`
    SELECT id, model_id, base_url, secret_ref, requests_per_minute FROM llm_configs
    WHERE tenant_id = ? AND status = 'active' AND (id = ? OR model_id = ?) LIMIT 1
  `).bind(identity.tenantId, requestedModel, requestedModel).first<ModelConfig>();
  if (!model) return gatewayError(404, "MODEL_NOT_FOUND", "该模型未授权给当前组织，或当前不可用。");

  const now = Math.floor(Date.now() / 1000);
  const minuteUsage = await db.prepare("SELECT COUNT(*) AS count FROM gateway_requests WHERE api_key_id = ? AND created_at >= ?")
    .bind(identity.apiKeyId, now - 60).first<{ count: number }>();
  if (Number(minuteUsage?.count ?? 0) >= model.requests_per_minute) {
    return Response.json({ error: { code: "RATE_LIMITED", message: "已达到该模型的每分钟请求上限。" } }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const upstreamSecret = process.env[model.secret_ref];
  if (typeof upstreamSecret !== "string" || !upstreamSecret) {
    return gatewayError(503, "PROVIDER_SECRET_MISSING", "模型凭据尚未在部署环境中配置。");
  }

  const upstreamUrl = resolveUpstream(model.base_url, endpoint);
  if (!upstreamUrl) return gatewayError(503, "PROVIDER_URL_INVALID", "模型上游地址无效。");
  const requestId = `req_${crypto.randomUUID()}`;
  const started = Date.now();
  const body = JSON.stringify({ ...payload, model: model.model_id });
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${upstreamSecret}`, "Content-Type": "application/json", "Accept": request.headers.get("accept") ?? "application/json" },
      body,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    const latency = Date.now() - started;
    await recordGatewayRequest(identity.tenantId, identity.apiKeyId, model.id, endpoint, 502, latency, 0, 0, error instanceof Error && error.name === "TimeoutError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE");
    return gatewayError(502, "UPSTREAM_UNAVAILABLE", "模型上游暂时不可用。", requestId, latency);
  }

  const latency = Date.now() - started;
  let inputTokens = 0;
  let outputTokens = 0;
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  if (contentType.includes("application/json")) {
    try {
      const parsed = await upstream.clone().json() as { usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number } };
      inputTokens = Number(parsed.usage?.prompt_tokens ?? parsed.usage?.input_tokens ?? 0);
      outputTokens = Number(parsed.usage?.completion_tokens ?? parsed.usage?.output_tokens ?? 0);
    } catch { /* Streaming and non-standard provider responses may not expose usage. */ }
  }
  await recordGatewayRequest(identity.tenantId, identity.apiKeyId, model.id, endpoint, upstream.status, latency, inputTokens, outputTokens, upstream.ok ? null : "UPSTREAM_ERROR");

  const headers = new Headers();
  for (const name of ["content-type", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("X-Eval-Request-Id", requestId);
  headers.set("X-Eval-Latency-Ms", String(latency));
  return new Response(upstream.body, { status: upstream.status, headers });
}

function resolveUpstream(baseUrl: string, endpoint: GatewayEndpoint) {
  try {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (base.protocol !== "https:") return null;
    return new URL(endpoint === "chat.completions" ? "chat/completions" : "responses", base);
  } catch { return null; }
}

async function recordGatewayRequest(tenantId: string, apiKeyId: string, modelConfigId: string, endpoint: GatewayEndpoint, statusCode: number, latencyMs: number, inputTokens: number, outputTokens: number, errorCode: string | null) {
  await authDatabase().prepare(
    "INSERT INTO gateway_requests (id, tenant_id, api_key_id, model_config_id, endpoint, status_code, latency_ms, input_tokens, output_tokens, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(`req_${crypto.randomUUID()}`, tenantId, apiKeyId, modelConfigId, endpoint, statusCode, latencyMs, inputTokens, outputTokens, errorCode, Math.floor(Date.now() / 1000)).run();
}

function gatewayError(status: number, code: string, message: string, requestId?: string, latency?: number) {
  const headers = new Headers();
  if (requestId) headers.set("X-Eval-Request-Id", requestId);
  if (latency !== undefined) headers.set("X-Eval-Latency-Ms", String(latency));
  return Response.json({ error: { code, message } }, { status, headers });
}
