import { authDatabase } from "../../../auth/core";
import { isAdminError, requireAdminRequest } from "../../../auth/admin";
import { ensureAdminSchema } from "../../../admin/store";
import {
  inspectMacDmg,
  inspectMacUpdaterBundle,
  inspectWindowsInstaller,
  type MacArchitecture,
} from "../../../releases/installer-metadata";
import { normalizeSemver } from "../../../releases/public";
import { requireReleaseSigningSettings } from "../../../releases/settings";
import { verifyUpdaterSignature } from "../../../releases/signature";
import { rejectCrossSiteWrite } from "../../../security/request";
import { artifactExists, stageArtifactReplacement, type StagedArtifactReplacement } from "../../../storage/artifacts";

const MAX_ARTIFACT_SIZE = 320 * 1024 * 1024;
const MAX_SIGNATURE_SIZE = 8 * 1024;

type ArtifactFormat = "NSIS" | "DMG" | "APP_TAR_GZ";
type ArtifactPlatform = "windows" | "darwin";
type ArtifactArchitecture = "x86_64" | "aarch64" | "universal";

type ValidatedArtifact = {
  id: string;
  file: File;
  format: ArtifactFormat;
  platform: ArtifactPlatform;
  architecture: ArtifactArchitecture;
  bytes: ArrayBuffer;
  updaterSignature: string | null;
  sha256: string;
  signatureVerifiedAt: number | null;
  signatureKeyId: string | null;
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
  const label = formText(form, "label");
  if (!label) return Response.json({ error: "请填写本次更新产物的显示名称。" }, { status: 400 });

  let artifact: ValidatedArtifact;
  try {
    const fileValue = form.get("file");
    const signatureValue = form.get("signature");
    if (!(fileValue instanceof File) || !fileValue.name) throw new Error("请选择要上传的安装包。");
    const spec = artifactSpec(formText(form, "platform"), formText(form, "architecture"), formText(form, "format"));
    const signatureFile = signatureValue instanceof File && signatureValue.name ? signatureValue : null;
    if (spec.format !== "DMG" && !signatureFile) throw new Error("请同时选择安装包和对应的 .sig 签名文件。");
    const signingSettings = signatureFile || spec.format !== "DMG" ? await requireReleaseSigningSettings(spec.platform) : null;
    artifact = await validateArtifact(fileValue, signatureFile, signingSettings?.publicKey ?? null, spec, formText(form, "version"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "安装包校验失败。" }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const db = authDatabase();
  const existing = await db.prepare(`SELECT id, object_key, sha256
    FROM agent_artifacts
    WHERE embedded_version = ? AND format = ? AND platform = ? AND architecture = ?
    ORDER BY created_at DESC LIMIT 1`)
    .bind(artifact.embeddedVersion, artifact.format, artifact.platform, artifact.architecture)
    .first<ExistingArtifact>();
  const storedArtifact = existing
    ? { ...artifact, id: existing.id, objectKey: existing.object_key }
    : artifact;
  const contentChanged = !existing || existing.sha256 !== artifact.sha256;
  const sourceMissing = existing ? !await artifactExists(existing.object_key) : true;
  let replacement: StagedArtifactReplacement | null = null;

  try {
    if (contentChanged || sourceMissing) replacement = await stageArtifactReplacement(storedArtifact.objectKey, artifact.bytes);
    await db.batch([
      existing
        ? db.prepare("UPDATE agent_artifacts SET file_name = ?, label = ?, size_bytes = ?, sha256 = ?, updater_signature = ?, signature_verified_at = ?, signature_key_id = ?, product_name = ?, version_source = ?, status = 'ready', created_at = ? WHERE id = ? AND embedded_version = ? AND format = ? AND platform = ? AND architecture = ?")
          .bind(artifact.file.name, label, artifact.file.size, artifact.sha256, artifact.updaterSignature, artifact.signatureVerifiedAt, artifact.signatureKeyId, artifact.productName, artifact.versionSource, now, existing.id, artifact.embeddedVersion, artifact.format, artifact.platform, artifact.architecture)
        : db.prepare("INSERT INTO agent_artifacts (id, file_name, label, format, object_key, size_bytes, sha256, updater_signature, signature_verified_at, signature_key_id, embedded_version, product_name, version_source, platform, architecture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)")
          .bind(storedArtifact.id, artifact.file.name, label, artifact.format, storedArtifact.objectKey, artifact.file.size, artifact.sha256, artifact.updaterSignature, artifact.signatureVerifiedAt, artifact.signatureKeyId, artifact.embeddedVersion, artifact.productName, artifact.versionSource, artifact.platform, artifact.architecture, now),
      db.prepare("INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, 'artifact.upload', 'agent_artifact', ?, ?, ?)")
        .bind(`audit_${crypto.randomUUID()}`, user.id, storedArtifact.id, JSON.stringify({ fileName: artifact.file.name, format: artifact.format, platform: artifact.platform, architecture: artifact.architecture, sizeBytes: artifact.file.size, sha256: artifact.sha256, signed: Boolean(artifact.signatureVerifiedAt), signatureKeyId: artifact.signatureKeyId, embeddedVersion: artifact.embeddedVersion, productName: artifact.productName, versionSource: artifact.versionSource, replaced: Boolean(existing), contentChanged, sourceRestored: sourceMissing }), now),
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
      signed: Boolean(artifact.signatureVerifiedAt),
      signatureVerifiedAt: artifact.signatureVerifiedAt,
      signatureKeyId: artifact.signatureKeyId,
      embeddedVersion: artifact.embeddedVersion,
      productName: artifact.productName,
      versionSource: artifact.versionSource,
      platform: artifact.platform,
      architecture: artifact.architecture,
    }],
  });
}

async function validateArtifact(
  file: File,
  signatureFile: File | null,
  publicKey: string | null,
  spec: { format: ArtifactFormat; platform: ArtifactPlatform; architecture: ArtifactArchitecture },
  declaredVersion: string,
): Promise<ValidatedArtifact> {
  assertFileName(file, spec.format);
  if (file.size <= 0 || file.size > MAX_ARTIFACT_SIZE) throw new Error("安装包必须大于 0 且不超过 320 MB。");
  const bytes = await file.arrayBuffer();
  let updaterSignature: string | null = null;
  let signatureVerifiedAt: number | null = null;
  let signatureKeyId: string | null = null;
  if (signatureFile) {
    if (!publicKey) throw new Error("请先配置 Tauri 更新签名公钥。");
    if (signatureFile.name.toLowerCase() !== `${file.name}.sig`.toLowerCase()) {
      throw new Error(`签名文件必须命名为 ${file.name}.sig，确保与安装包一一对应。`);
    }
    if (signatureFile.size <= 0 || signatureFile.size > MAX_SIGNATURE_SIZE) throw new Error(".sig 文件必须大于 0 且不超过 8 KB。");
    updaterSignature = (await signatureFile.text()).trim();
    if (/[^\t\n\r\x20-\x7E]/.test(updaterSignature)) throw new Error(".sig 文件包含无效字符。");
    const verification = await verifyUpdaterSignature(new Uint8Array(bytes), updaterSignature, publicKey);
    signatureVerifiedAt = verification.verifiedAt;
    signatureKeyId = verification.keyId;
  }
  const metadata = spec.format === "NSIS"
    ? await inspectWindowsInstaller(file.name, bytes)
    : spec.format === "DMG"
      ? await inspectMacDmg(file.name, bytes, declaredVersion)
      : await inspectMacUpdaterBundle(file.name, bytes, spec.architecture as MacArchitecture);
  const normalizedDeclared = declaredVersion ? normalizeSemver(declaredVersion) : null;
  if (declaredVersion && (!normalizedDeclared || normalizedDeclared.version !== metadata.embeddedVersion)) {
    throw new Error(`填写版本 ${declaredVersion} 与安装包内部版本 ${metadata.embeddedVersion} 不一致。`);
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const id = `artifact_${crypto.randomUUID()}`;
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    id,
    file,
    ...spec,
    bytes,
    updaterSignature,
    sha256,
    signatureVerifiedAt,
    signatureKeyId,
    embeddedVersion: metadata.embeddedVersion,
    productName: metadata.productName,
    versionSource: metadata.versionSource,
    objectKey: `releases/${id}/${safeFileName}`,
  };
}

function artifactSpec(platform: string, architecture: string, format: string) {
  if (platform === "windows" && architecture === "x86_64" && format === "NSIS") {
    return { platform, architecture, format } as const;
  }
  if (platform === "darwin" && ["aarch64", "x86_64", "universal"].includes(architecture) && ["DMG", "APP_TAR_GZ"].includes(format)) {
    return { platform, architecture: architecture as ArtifactArchitecture, format: format as ArtifactFormat } as const;
  }
  throw new Error("安装包的平台、架构与格式组合无效。");
}

function assertFileName(file: File, format: ArtifactFormat) {
  const lower = file.name.toLowerCase();
  if (format === "NSIS" && !lower.endsWith(".exe")) throw new Error("Windows NSIS 只接受 .exe 安装包。");
  if (format === "DMG" && !lower.endsWith(".dmg")) throw new Error("macOS 首次安装包只接受 .dmg 文件。");
  if (format === "APP_TAR_GZ" && !lower.endsWith(".app.tar.gz")) throw new Error("macOS 自动更新包必须以 .app.tar.gz 结尾。");
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
