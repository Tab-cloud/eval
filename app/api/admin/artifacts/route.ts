import { authDatabase } from "../../../auth/core";
import { isAdminError, requireAdminRequest } from "../../../auth/admin";
import { ensureAdminSchema } from "../../../admin/store";
import { rejectCrossSiteWrite } from "../../../security/request";
import { deleteArtifact, putArtifact } from "../../../storage/artifacts";

const MAX_ARTIFACT_SIZE = 120 * 1024 * 1024;

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await requireAdminRequest(request);
  if (isAdminError(user)) return user;
  await ensureAdminSchema();
  const form = await request.formData();
  const file = form.get("file");
  const label = typeof form.get("label") === "string" ? String(form.get("label")).trim() : "";
  if (!(file instanceof File) || !label) return Response.json({ error: "请选择安装包并填写显示名称。" }, { status: 400 });
  const extension = file.name.toLowerCase().endsWith(".exe") ? ".exe" : file.name.toLowerCase().endsWith(".msi") ? ".msi" : "";
  if (!extension) return Response.json({ error: "当前仅接受项目实际构建的 Windows .exe 或 .msi 安装包。" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_ARTIFACT_SIZE) return Response.json({ error: "安装包必须小于 120 MB。" }, { status: 400 });
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const id = `artifact_${crypto.randomUUID()}`;
  const objectKey = `releases/${user.tenantId}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await putArtifact(objectKey, bytes);
  const now = Math.floor(Date.now() / 1000);
  const db = authDatabase();
  try {
    await db.batch([
      db.prepare("INSERT INTO agent_artifacts (id, tenant_id, file_name, label, format, object_key, size_bytes, sha256, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)").bind(id, user.tenantId, file.name, label, extension === ".exe" ? "NSIS" : "MSI", objectKey, file.size, sha256, now),
      db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, 'artifact.upload', 'agent_artifact', ?, ?, ?)").bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, id, JSON.stringify({ fileName: file.name, sizeBytes: file.size, sha256 }), now),
    ]);
  } catch (error) {
    await deleteArtifact(objectKey);
    throw error;
  }
  return Response.json({ ok: true, artifact: { id, fileName: file.name, label, format: extension === ".exe" ? "NSIS" : "MSI", sizeBytes: file.size, sha256 } });
}
