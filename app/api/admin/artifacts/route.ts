import { authDatabase } from "../../../auth/core";
import { isAdminError, requireAdminRequest } from "../../../auth/admin";
import { ensureAdminSchema } from "../../../admin/store";
import { rejectCrossSiteWrite } from "../../../security/request";
import { deleteArtifact, putArtifact } from "../../../storage/artifacts";

const MAX_ARTIFACT_SIZE = 120 * 1024 * 1024;
const MAX_SIGNATURE_SIZE = 8 * 1024;

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await requireAdminRequest(request);
  if (isAdminError(user)) return user;
  await ensureAdminSchema();
  const form = await request.formData();
  const file = form.get("file");
  const signatureFile = form.get("signature");
  const label = typeof form.get("label") === "string" ? String(form.get("label")).trim() : "";
  if (!(file instanceof File) || !(signatureFile instanceof File) || !label) return Response.json({ error: "请选择安装包、对应的 .sig 签名文件并填写显示名称。" }, { status: 400 });
  const extension = file.name.toLowerCase().endsWith(".exe") ? ".exe" : file.name.toLowerCase().endsWith(".msi") ? ".msi" : "";
  if (!extension) return Response.json({ error: "当前仅接受项目实际构建的 Windows .exe 或 .msi 安装包。" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_ARTIFACT_SIZE) return Response.json({ error: "安装包必须小于 120 MB。" }, { status: 400 });
  if (!signatureFile.name.toLowerCase().endsWith(".sig") || signatureFile.size <= 0 || signatureFile.size > MAX_SIGNATURE_SIZE) {
    return Response.json({ error: "请选择由 Tauri 构建生成且不超过 8 KB 的 .sig 文件。" }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  const updaterSignature = (await signatureFile.text()).trim();
  if (!updaterSignature || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(updaterSignature)) {
    return Response.json({ error: "更新签名文件内容无效。" }, { status: 400 });
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const id = `artifact_${crypto.randomUUID()}`;
  const objectKey = `releases/${user.tenantId}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await putArtifact(objectKey, bytes);
  const now = Math.floor(Date.now() / 1000);
  const db = authDatabase();
  try {
    await db.batch([
      db.prepare("INSERT INTO agent_artifacts (id, tenant_id, file_name, label, format, object_key, size_bytes, sha256, updater_signature, platform, architecture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'windows', 'x86_64', 'ready', ?)").bind(id, user.tenantId, file.name, label, extension === ".exe" ? "NSIS" : "MSI", objectKey, file.size, sha256, updaterSignature, now),
      db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, 'artifact.upload', 'agent_artifact', ?, ?, ?)").bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, id, JSON.stringify({ fileName: file.name, sizeBytes: file.size, sha256 }), now),
    ]);
  } catch (error) {
    await deleteArtifact(objectKey);
    throw error;
  }
  return Response.json({ ok: true, artifact: { id, fileName: file.name, label, format: extension === ".exe" ? "NSIS" : "MSI", sizeBytes: file.size, sha256, signed: true, platform: "windows", architecture: "x86_64" } });
}
