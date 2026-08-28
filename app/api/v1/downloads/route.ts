import { authDatabase } from "../../../auth/core";
import { ensureAdminSchema } from "../../../admin/store";
import { publicReleaseSigningSettings } from "../../../releases/settings";

type PublishedArtifact = {
  artifact_id: string;
  version: string;
  format: "NSIS" | "DMG";
  platform: "windows" | "darwin";
  architecture: "x86_64" | "aarch64" | "universal";
  file_name: string;
  size_bytes: number;
  sha256: string;
};

type DownloadSlot = {
  id: string;
  name: string;
  nameEn: string;
  platform: string;
  format: "NSIS" | "DMG";
  fileExtension: ".exe" | ".dmg";
  architecture: string;
};

const windowsSlot: DownloadSlot = { id: "eval-agent-win-x64-nsis", name: "Eval Agent Windows 安装程序", nameEn: "Eval Agent Windows Installer", platform: "Windows x64", architecture: "x86_64", format: "NSIS", fileExtension: ".exe" };
const macAppleSlot: DownloadSlot = { id: "eval-agent-mac-arm64-dmg", name: "Eval Agent Mac 安装程序", nameEn: "Eval Agent Mac Installer", platform: "macOS Apple Silicon", architecture: "aarch64", format: "DMG", fileExtension: ".dmg" };
const macIntelSlot: DownloadSlot = { id: "eval-agent-mac-x64-dmg", name: "Eval Agent Mac 安装程序", nameEn: "Eval Agent Mac Installer", platform: "macOS Intel", architecture: "x86_64", format: "DMG", fileExtension: ".dmg" };
const macUniversalSlot: DownloadSlot = { id: "eval-agent-mac-universal-dmg", name: "Eval Agent Mac 通用安装程序", nameEn: "Eval Agent Mac Universal Installer", platform: "macOS Universal", architecture: "universal", format: "DMG", fileExtension: ".dmg" };

export async function GET() {
  await ensureAdminSchema();
  const signingSettings = await publicReleaseSigningSettings("windows");
  const publicKeyId = signingSettings?.publicKeyId ?? "__not_configured__";
  const result = await authDatabase().prepare(`
    SELECT a.id AS artifact_id, r.version, a.format, a.platform, a.architecture,
           a.file_name, a.size_bytes, a.sha256
    FROM release_versions r
    JOIN release_artifacts ra ON ra.release_id = r.id
    JOIN agent_artifacts a ON a.id = ra.artifact_id AND a.format IN ('NSIS', 'DMG')
    WHERE r.status = 'published' AND r.channel = 'stable'
      AND r.id = (SELECT latest_r.id FROM release_versions latest_r
        WHERE latest_r.channel = r.channel AND latest_r.status = 'published'
        ORDER BY latest_r.published_at DESC, latest_r.created_at DESC LIMIT 1)
      AND a.status = 'ready'
      AND (a.format = 'DMG' OR (a.signature_verified_at IS NOT NULL AND a.signature_key_id = ?))
      AND a.embedded_version = r.version
    ORDER BY a.platform, a.architecture, a.format
  `).bind(publicKeyId).all<PublishedArtifact>();
  const published = new Map(result.results.map(item => [`${item.platform}:${item.architecture}:${item.format}`, item]));
  const universalMac = published.get("darwin:universal:DMG");
  const slots = [windowsSlot, ...(universalMac ? [macUniversalSlot] : [macAppleSlot, macIntelSlot])];
  const data = slots.map(slot => {
    const item = published.get(`${slot.format === "NSIS" ? "windows" : "darwin"}:${slot.architecture}:${slot.format}`);
    return item ? {
      ...slot,
      id: item.artifact_id,
      version: item.version,
      available: true,
      downloadUrl: `/api/v1/downloads/${item.artifact_id}`,
      size: Number(item.size_bytes),
      sha256: item.sha256,
      fileName: item.file_name,
      public: true,
    } : {
      ...slot,
      version: "0.1.0",
      available: false,
      downloadUrl: null,
      size: null,
      sha256: null,
      public: true,
    };
  });
  return Response.json({ data, meta: { authenticationRequired: false, managedBy: "administrator", note: "仅展示最新稳定版本中可公开下载的 Windows 安装包与 macOS DMG。" } }, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
