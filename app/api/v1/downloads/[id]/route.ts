import { authDatabase } from "../../../../auth/core";
import { ensureAdminSchema } from "../../../../admin/store";
import { recordArtifactDownload } from "../../../../releases/download-stats";
import { publicReleaseSigningSettings } from "../../../../releases/settings";
import { getArtifact } from "../../../../storage/artifacts";

type PublicArtifact = { artifact_id: string; file_name: string; object_key: string; sha256: string };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureAdminSchema();
  const { id } = await context.params;
  const signingSettings = await publicReleaseSigningSettings();
  if (!signingSettings) return Response.json({ error: "更新签名公钥尚未配置。" }, { status: 404 });
  const artifact = await authDatabase().prepare(
    "SELECT a.id AS artifact_id, a.file_name, a.object_key, a.sha256 FROM release_versions r JOIN agent_artifacts a ON a.id = r.artifact_id AND a.format = 'NSIS' WHERE (a.id = ? OR r.id = ?) AND r.status = 'published' AND r.channel IN ('stable', 'beta') AND r.id = (SELECT latest_r.id FROM release_versions latest_r WHERE latest_r.channel = r.channel AND latest_r.status = 'published' ORDER BY latest_r.published_at DESC, latest_r.created_at DESC LIMIT 1) AND a.status = 'ready' AND a.signature_verified_at IS NOT NULL AND a.signature_key_id = ? AND a.embedded_version = r.version LIMIT 1",
  ).bind(id, id, signingSettings.publicKeyId).first<PublicArtifact>();
  if (!artifact) return Response.json({ error: "该版本不存在或尚未公开发布。" }, { status: 404 });
  const object = await getArtifact(artifact.object_key);
  if (!object) return Response.json({ error: "安装包源文件不存在。" }, { status: 404 });
  try {
    await recordArtifactDownload(artifact.artifact_id);
  } catch (error) {
    console.error("Failed to record public artifact download.", error);
  }
  const headers = new Headers({
    "Content-Type": object.contentType,
    "Content-Length": String(object.contentLength),
  });
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(artifact.file_name)}`);
  headers.set("X-Checksum-SHA256", artifact.sha256);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
}
