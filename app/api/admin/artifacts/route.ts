import { authDatabase } from "../../../auth/core";
import { isAdminError, requireAdminRequest } from "../../../auth/admin";
import { ensureAdminSchema } from "../../../admin/store";
import { inspectWindowsInstaller } from "../../../releases/installer-metadata";
import { requireTenantReleaseSigningSettings } from "../../../releases/settings";
import { verifyUpdaterSignature } from "../../../releases/signature";
import { rejectCrossSiteWrite } from "../../../security/request";
import { artifactExists, stageArtifactReplacement, type StagedArtifactReplacement } from "../../../storage/artifacts";

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

type ExistingArtifact = {
  id: string;
  object_key: string;
  sha256: string;
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

  const now = Math.floor(Date.now() / 1000);
  const db = authDatabase();
  const existing = await db.prepare(`SELECT id, object_key, sha256
    FROM agent_artifacts
    WHERE tenant_id = ? AND embedded_version = ? AND format = 'NSIS' AND platform = 'windows' AND architecture = 'x86_64'
    ORDER BY created_at DESC LIMIT 1`)
    .bind(user.tenantId, artifact.embeddedVersion)
    .first<ExistingArtifact>();
  const storedArtifact = existing
    ? { ...artifact, id: existing.id, objectKey: existing.object_key }
    : artifact;
  const contentChanged = !existing || existing.sha256 !== artifact.sha256;
  const sourceMissing = existing ? !await artifactExists(existing.object_key) : true;
  let replacement: StagedArtifactReplacement | null = null;

  try {
    if (contentChanged || sourceMissing) {
      replacement = await stageArtifactReplacement(storedArtifact.objectKey, artifact.bytes);
    }
    await db.batch([
      existing
        ? db.prepare("UPDATE agent_artifacts SET file_name = ?, label = ?, size_bytes = ?, sha256 = ?, updater_signature = ?, signature_verified_at = ?, signature_key_id = ?, product_name = ?, version_source = ?, status = 'ready', created_at = ? WHERE id = ? AND tenant_id = ? AND embedded_version = ? AND format = 'NSIS'")
          .bind(artifact.file.name, label, artifact.file.size, artifact.sha256, artifact.updaterSignature, artifact.signatureVerifiedAt, artifact.signatureKeyId, artifact.productName, artifact.versionSource, now, existing.id, user.tenantId, artifact.embeddedVersion)
        : db.prepare("INSERT INTO agent_artifacts (id, tenant_id, file_name, label, format, object_key, size_bytes, sha256, updater_signature, signature_verified_at, signature_key_id, embedded_version, product_name, version_source, platform, architecture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'windows', 'x86_64', 'ready', ?)")
          .bind(storedArtifact.id, user.tenantId, artifact.file.name, label, artifact.format, storedArtifact.objectKey, artifact.file.size, artifact.sha256, artifact.updaterSignature, artifact.signatureVerifiedAt, artifact.signatureKeyId, artifact.embeddedVersion, artifact.productName, artifact.versionSource, now),
      db.prepare("INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, 'artifact.upload', 'agent_artifact', ?, ?, ?)")
        .bind(`audit_${crypto.randomUUID()}`, user.tenantId, user.id, storedArtifact.id, JSON.stringify({ fileName: artifact.file.name, format: artifact.format, sizeBytes: artifact.file.size, sha256: artifact.sha256, signatureKeyId: artifact.signatureKeyId, embeddedVersion: artifact.embeddedVersion, productName: artifact.productName, versionSource: artifact.versionSource, replaced: Boolean(existing), contentChanged, sourceRestored: sourceMissing }), now),
    ]);
    await replacement?.commit();
  } catch (error) {
    await replacement?.rollback().catch(() => undefined);
    throw error;
  }

  return Response.json({
    ok: true,
    replaced: Boolean(existing),
    contentChanged,
    artifacts: [{
      id: storedArtifact.id,
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
