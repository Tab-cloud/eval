import { authDatabase } from "../../../../auth/core";
import { isAdminError, requireAdminRequest } from "../../../../auth/admin";
import { getArtifact } from "../../../../storage/artifacts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireAdminRequest(request);
  if (isAdminError(user)) return user;
  const { id } = await context.params;
  const artifact = await authDatabase().prepare("SELECT file_name, object_key FROM agent_artifacts WHERE id = ?").bind(id).first<{ file_name: string; object_key: string }>();
  if (!artifact) return Response.json({ error: "安装包不存在。" }, { status: 404 });
  const object = await getArtifact(artifact.object_key);
  if (!object) return Response.json({ error: "源文件不存在。" }, { status: 404 });
  const headers = new Headers({
    "Content-Type": object.contentType,
    "Content-Length": String(object.contentLength),
  });
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(artifact.file_name)}`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
}
