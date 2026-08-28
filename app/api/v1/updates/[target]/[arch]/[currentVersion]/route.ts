import { authDatabase } from "../../../../../../auth/core";
import { ensureAdminSchema } from "../../../../../../admin/store";
import {
  compareSemver,
  normalizeSemver,
  parseReleaseChannel,
  publicApplicationOrigin,
} from "../../../../../../releases/public";
import { publicReleaseSigningSettings } from "../../../../../../releases/settings";

type UpdateRelease = {
  id: string;
  artifact_id: string;
  version: string;
  notes: string;
  mandatory: boolean;
  published_at: number;
  updater_signature: string;
  sha256: string;
  size_bytes: number;
  format: "NSIS" | "APP_TAR_GZ";
  architecture: string;
};

export async function GET(request: Request, context: { params: Promise<{ target: string; arch: string; currentVersion: string }> }) {
  await ensureAdminSchema();
  const { target, arch, currentVersion } = await context.params;
  const current = normalizeSemver(currentVersion);
  const channel = parseReleaseChannel(new URL(request.url).searchParams.get("channel") ?? "stable");
  if (!current || !channel || channel === "internal") return Response.json({ error: "更新版本或公开渠道格式无效。" }, { status: 400 });
  const supported = (target === "windows" && arch === "x86_64")
    || (target === "darwin" && (arch === "aarch64" || arch === "x86_64"));
  if (!supported) return noUpdate();
  const updaterPlatform = target === "windows" ? "windows" : "darwin";
  const format = updaterPlatform === "windows" ? "NSIS" : "APP_TAR_GZ";
  const signingSettings = await publicReleaseSigningSettings(updaterPlatform);
  if (!signingSettings) return noUpdate();

  const result = await authDatabase().prepare(`
    SELECT r.id, a.id AS artifact_id, r.version, r.notes, r.mandatory, r.published_at,
           a.updater_signature, a.sha256, a.size_bytes, a.format, a.architecture
    FROM release_versions r
    JOIN release_artifacts ra ON ra.release_id = r.id
    JOIN agent_artifacts a ON a.id = ra.artifact_id
    WHERE r.status = 'published' AND r.channel = ?
      AND r.id = (SELECT latest_r.id FROM release_versions latest_r
        WHERE latest_r.channel = r.channel AND latest_r.status = 'published'
        ORDER BY latest_r.published_at DESC, latest_r.created_at DESC LIMIT 1)
      AND a.status = 'ready' AND a.platform = ? AND a.format = ?
      AND (a.architecture = ? OR (a.platform = 'darwin' AND a.architecture = 'universal'))
      AND a.updater_signature IS NOT NULL AND a.signature_verified_at IS NOT NULL
      AND a.signature_key_id = ? AND a.embedded_version = r.version
    ORDER BY CASE WHEN a.architecture = ? THEN 0 ELSE 1 END, r.published_at DESC
  `).bind(channel, target, format, arch, signingSettings.publicKeyId, arch).all<UpdateRelease>();

  const releases = result.results.filter(item => normalizeSemver(item.version));
  releases.sort((left, right) => compareSemver(right.version, left.version));
  const release = releases.find(item => compareSemver(item.version, current.version) > 0);
  if (!release) return noUpdate();

  const origin = publicApplicationOrigin(request);
  return Response.json({
    version: normalizeSemver(release.version)!.version,
    notes: release.notes,
    pub_date: new Date(release.published_at * 1000).toISOString(),
    url: `${origin}/api/v1/downloads/${encodeURIComponent(release.artifact_id)}`,
    signature: release.updater_signature,
    mandatory: Boolean(release.mandatory),
    sha256: release.sha256,
    size: Number(release.size_bytes),
    channel,
    format: release.format === "NSIS" ? "nsis" : "app",
    architecture: release.architecture,
  }, { headers: updateHeaders() });
}

function noUpdate() {
  return new Response(null, { status: 204, headers: updateHeaders() });
}

function updateHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
