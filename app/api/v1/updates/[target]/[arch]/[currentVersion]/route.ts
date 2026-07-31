import { authDatabase } from "../../../../../../auth/core";
import { ensureAdminSchema } from "../../../../../../admin/store";
import {
  compareSemver,
  normalizeSemver,
  parseReleaseChannel,
  publicApplicationOrigin,
  publicReleaseTenantSlug,
} from "../../../../../../releases/public";

type UpdateRelease = {
  id: string;
  version: string;
  notes: string;
  mandatory: boolean;
  published_at: number;
  updater_signature: string;
  sha256: string;
  size_bytes: number;
};

export async function GET(request: Request, context: { params: Promise<{ target: string; arch: string; currentVersion: string }> }) {
  await ensureAdminSchema();
  const { target, arch, currentVersion } = await context.params;
  const current = normalizeSemver(currentVersion);
  const channel = parseReleaseChannel(new URL(request.url).searchParams.get("channel") ?? "stable");
  if (!current || !channel || channel === "internal") return Response.json({ error: "更新版本或公开渠道格式无效。" }, { status: 400 });
  if (target !== "windows" || arch !== "x86_64") return noUpdate();

  const result = await authDatabase().prepare(`
    SELECT r.id, r.version, r.notes, r.mandatory, r.published_at,
           a.updater_signature, a.sha256, a.size_bytes
    FROM release_versions r
    JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id
    JOIN tenants t ON t.id = r.tenant_id
    WHERE t.slug = ? AND r.status = 'published' AND r.channel = ?
      AND a.status = 'ready' AND a.platform = ? AND a.architecture = ?
      AND a.updater_signature IS NOT NULL
    ORDER BY r.published_at DESC
  `).bind(publicReleaseTenantSlug(), channel, target, arch).all<UpdateRelease>();

  const releases = result.results.filter(item => normalizeSemver(item.version));
  releases.sort((left, right) => compareSemver(right.version, left.version));
  const release = releases.find(item => compareSemver(item.version, current.version) > 0);
  if (!release) return noUpdate();

  const origin = publicApplicationOrigin(request);
  return Response.json({
    version: normalizeSemver(release.version)!.version,
    notes: release.notes,
    pub_date: new Date(release.published_at * 1000).toISOString(),
    url: `${origin}/api/v1/downloads/${encodeURIComponent(release.id)}`,
    signature: release.updater_signature,
    mandatory: Boolean(release.mandatory),
    sha256: release.sha256,
    size: Number(release.size_bytes),
    channel,
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function noUpdate() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
