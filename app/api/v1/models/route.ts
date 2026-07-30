import { authDatabase } from "../../../auth/core";
import { ensureGatewaySchema } from "../../../console/store";
import { isResponse, requireApiIdentity, requireScope } from "../_shared/auth";

export async function GET(request: Request) {
  const identity = await requireApiIdentity(request);
  if (isResponse(identity)) return identity;
  const forbidden = requireScope(identity, "models:read");
  if (forbidden) return forbidden;
  await ensureGatewaySchema();
  const result = await authDatabase().prepare(
    "SELECT id, display_name, provider, model_id, status, requests_per_minute FROM llm_configs WHERE tenant_id = ? AND status != 'disabled' ORDER BY display_name",
  ).bind(identity.tenantId).all<Record<string, string | number>>();
  return Response.json({
    object: "list",
    data: result.results.map(model => ({
      id: String(model.id),
      object: "model",
      created: 0,
      owned_by: String(model.provider),
      display_name: String(model.display_name),
      upstream_model: String(model.model_id),
      status: String(model.status),
      requests_per_minute: Number(model.requests_per_minute),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
