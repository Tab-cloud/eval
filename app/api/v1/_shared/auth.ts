import { authDatabase } from "../../../auth/core";
import { ensureGatewaySchema, sha256 } from "../../../console/store";

export type ApiIdentity = {
  tenantId: string;
  subject: string;
  apiKeyId: string;
  scopes: string[];
};

export async function requireApiIdentity(request: Request): Promise<ApiIdentity | Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length < 24) return unauthenticated();
  await ensureGatewaySchema();
  const now = Math.floor(Date.now() / 1000);
  const row = await authDatabase().prepare(`
    SELECT k.id, k.tenant_id, k.scopes, k.expires_at, k.revoked_at, t.status AS tenant_status
    FROM api_keys k JOIN tenants t ON t.id = k.tenant_id
    WHERE k.secret_hash = ? LIMIT 1
  `).bind(await sha256(token)).first<Record<string, string | number | null>>();
  if (!row || row.tenant_status !== "active" || row.revoked_at || (row.expires_at && Number(row.expires_at) <= now)) return unauthenticated();
  let scopes: string[] = [];
  try {
    const parsed = Array.isArray(row.scopes) ? row.scopes : JSON.parse(String(row.scopes));
    if (Array.isArray(parsed)) scopes = parsed.filter(value => typeof value === "string");
  } catch { return unauthenticated(); }
  await authDatabase().prepare("UPDATE api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?").bind(now, now, row.id).run();
  return { tenantId: String(row.tenant_id), subject: String(row.id), apiKeyId: String(row.id), scopes };
}

export function requireScope(identity: ApiIdentity, scope: string): Response | null {
  if (identity.scopes.includes(scope)) return null;
  return Response.json({ error: { code: "FORBIDDEN", message: `API 密钥缺少 ${scope} 权限。` } }, { status: 403 });
}

export function isResponse(value: ApiIdentity | Response): value is Response { return value instanceof Response; }

function unauthenticated() {
  return Response.json({ error: { code: "UNAUTHENTICATED", message: "需要有效且未撤销的 Bearer API 密钥。" } }, { status: 401 });
}
