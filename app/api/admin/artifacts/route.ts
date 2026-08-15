import { authDatabase } from "../../../auth/core";
import { isAdminError, requireAdminRequest } from "../../../auth/admin";
import { ensureAdminSchema } from "../../../admin/store";
import { inspectWindowsInstaller } from "../../../releases/installer-metadata";
import { requireTenantReleaseSigningSettings } from "../../../releases/settings";
import { verifyUpdaterSignature } from "../../../releases/signature";
import { rejectCrossSiteWrite } from "../../../security/request";
import { deleteArtifact, putArtifact } from "../../../storage/artifacts";

const MAX_ARTIFACT_SIZE = 120 * 1024 * 1024;
const MAX_SIGNATURE_SIZE = 8 * 1024;

type ValidatedArtifact = {
  id: string;
  file: File;
  format: "NSIS";
  bytes: ArrayBuffer;
  updaterSignature: string;
  sha256: string;
  signatureVerifiedAt: number;
  signatureKeyId: string;
  embeddedVersion: string;
  productName: string | null;
  versionSource: string;
  objectKey: string;
};

export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request);
  if (rejected) return rejected;
  const user = await requireAdminRequest(request);
  if (isAdminError(user)) return user;
  await ensureAdminSchema();

  const form = await request.formData();
  const label = typeof form.get("label") === "string" ? String(form.get("label")).trim() : "";
  if (!label) return Response.json({ error: "请填写本次更新产物的显示名称。" }, { status: 400 });

  let artifact: ValidatedArtifact;
  try {
    const signingSettings = await requireTenantReleaseSigningSettings(user.tenantId);
    const fileValue = form.get("file");
    const signatureValue = form.get("signature");
    if (!(fileValue instanceof File) || !fileValue.name || !(signatureValue instanceof File) || !signatureValue.name) {
      throw new Error("请同时选择 EXE 安装包和对应的 .sig 签名文件。");
    }
    artifact = await validatePair(fileValue, signatureValue, user.tenantId, signingSettings.publicKey);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "安装包校验失败。" }, { status: 400 });
  }

  try {
    await putArtifact(artifact.objectKey, artifact.bytes);
    const now = Math.floor(Date.now() / 1000);
    const db = authDatabase();
    await db.batch([
      db.prepare("INSERT INTO agent_artifacts (id, tenant_id, file_name, label, format, object_key, size_bytes, sha256, updater_signature, signature_verified_at, signature_key_id, embedded_version, product_name, version_source, platform, architecture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'windows', 'x86_64', 'ready', ?)")
        .bind(artifact.id, user.tenantId, artifact.file.name, label, artifact.format, artifact.objectKey, artifact.file.size, artifact.sha256, artifact.updaterSignature, artifact.signatureVerifiedAt, artifact.signatureKeyId, artifact.embeddedVersion, artifact.productName, artifact.versionSource, now),
      db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, 'artifact.upload', 'agent_artifact', ?, ?, ?)")
        .bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, artifact.id, JSON.stringify({ fileName: artifact.file.name, format: artifact.format, sizeBytes: artifact.file.size, sha256: artifact.sha256, signatureKeyId: artifact.signatureKeyId, embeddedVersion: artifact.embeddedVersion, productName: artifact.productName, versionSource: artifact.versionSource }), now),
    ]);
  } catch (error) {
    await deleteArtifact(artifact.objectKey);
    throw error;
  }

  return Response.json({
    ok: true,
    artifacts: [{
      id: artifact.id,
      fileName: artifact.file.name,
      label,
      format: artifact.format,
      sizeBytes: artifact.file.size,
      sha256: artifact.sha256,
      signed: true,
      signatureVerifiedAt: artifact.signatureVerifiedAt,
      signatureKeyId: artifact.signatureKeyId,
      embeddedVersion: artifact.embeddedVersion,
      productName: artifact.productName,
      versionSource: artifact.versionSource,
      platform: "windows",
      architecture: "x86_64",
    }],
  });
}

async function validatePair(file: File, signatureFile: File, tenantId: string, publicKey: string): Promise<ValidatedArtifact> {
  if (!file.name.toLowerCase().endsWith(".exe")) throw new Error("只接受 .exe 安装包。");
  if (file.size <= 0 || file.size > MAX_ARTIFACT_SIZE) throw new Error("EXE 安装包必须大于 0 且不超过 120 MB。");
  if (signatureFile.name.toLowerCase() !== `${file.name}.sig`.toLowerCase()) {
    throw new Error(`签名文件必须命名为 ${file.name}.sig，确保与 EXE 一一对应。`);
  }
  if (signatureFile.size <= 0 || signatureFile.size > MAX_SIGNATURE_SIZE) throw new Error(".sig 文件必须大于 0 且不超过 8 KB。");

  const bytes = await file.arrayBuffer();
  assertWindowsInstallerMagic(new Uint8Array(bytes));
  const updaterSignature = (await signatureFile.text()).trim();
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(updaterSignature)) throw new Error(".sig 文件包含无效控制字符。");
  const verification = await verifyUpdaterSignature(new Uint8Array(bytes), updaterSignature, publicKey);
  const metadata = await inspectWindowsInstaller(file.name, bytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const id = `artifact_${crypto.randomUUID()}`;
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    id,
    file,
    format: "NSIS",
    bytes,
    updaterSignature,
    sha256,
    signatureVerifiedAt: verification.verifiedAt,
    signatureKeyId: verification.keyId,
    embeddedVersion: metadata.embeddedVersion,
    productName: metadata.productName,
    versionSource: metadata.versionSource,
    objectKey: `releases/${tenantId}/${id}/${safeFileName}`,
  };
}

function assertWindowsInstallerMagic(bytes: Uint8Array) {
  const expected = [0x4d, 0x5a];
  if (bytes.length < expected.length || expected.some((value, index) => bytes[index] !== value)) {
    throw new Error("EXE 文件头无效，文件内容与扩展名不一致。");
  }
}
