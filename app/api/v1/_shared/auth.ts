export type ApiIdentity = { tenantId: string; subject: string; scopes: string[] };

export function requireApiIdentity(request: Request): ApiIdentity | Response {
  const authorization = request.headers.get("authorization");
  const tenantId = request.headers.get("x-luban-tenant");
  const configuredToken = process.env.LUBAN_GATEWAY_TOKEN;
  if (!configuredToken || authorization !== `Bearer ${configuredToken}`) {
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "需要有效的 Bearer 凭证。" } }, { status: 401 });
  }
  if (!tenantId || !/^[a-zA-Z0-9_-]{3,64}$/.test(tenantId)) {
    return Response.json({ error: { code: "TENANT_REQUIRED", message: "缺少有效的租户上下文。" } }, { status: 400 });
  }
  return { tenantId, subject: "service-token", scopes: ["models:read", "models:invoke", "downloads:read"] };
}

export function isResponse(value: ApiIdentity | Response): value is Response { return value instanceof Response; }
