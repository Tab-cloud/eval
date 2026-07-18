import { isResponse, requireApiIdentity } from "../_shared/auth";

export async function GET(request: Request) {
  const identity = requireApiIdentity(request); if (isResponse(identity)) return identity;
  return Response.json({ data: [{ id: "desktop-win-x64", name: "Luban Desktop", version: "0.1.0-preview", platform: "Windows x64", sha256: "pending-release", downloadUrl: null }], meta: { tenantId: identity.tenantId } });
}
