import { env } from "cloudflare:workers";
import { authDatabase } from "../../../../auth/core";
import { ensureAdminSchema } from "../../../../admin/store";

type PublicArtifact = { file_name: string; object_key: string; sha256: string };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureAdminSchema();
  const { id } = await context.params;
  const artifact = await authDatabase().prepare(
    "SELECT a.file_name, a.object_key, a.sha256 FROM release_versions r JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id WHERE r.id = ? AND r.status = 'published' AND r.channel = 'stable' AND a.status = 'ready'",
  ).bind(id).first<PublicArtifact>();
  if (!artifact) return Response.json({ error: "该版本不存在或尚未公开发布。" }, { status: 404 });
  const object = await env.RELEASES.get(artifact.object_key);
  if (!object) return Response.json({ error: "安装包源文件不存在。" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(artifact.file_name)}`);
  headers.set("X-Checksum-SHA256", artifact.sha256);
  headers.set("Cache-Control", "public, max-age=3600, immutable");
  return new Response(object.body, { headers });
}
