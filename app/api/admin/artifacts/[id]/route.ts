import { env } from "cloudflare:workers";
import { authDatabase } from "../../../../auth/core";
import { isAdminError, requireAdminRequest } from "../../../../auth/admin";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireAdminRequest(request);
  if (isAdminError(user)) return user;
  const { id } = await context.params;
  const artifact = await authDatabase().prepare("SELECT file_name, object_key FROM agent_artifacts WHERE id = ? AND tenant_id = ?").bind(id, user.tenantId).first<{ file_name: string; object_key: string }>();
  if (!artifact) return Response.json({ error: "安装包不存在。" }, { status: 404 });
  const object = await env.RELEASES.get(artifact.object_key);
  if (!object) return Response.json({ error: "源文件不存在。" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(artifact.file_name)}`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
}
