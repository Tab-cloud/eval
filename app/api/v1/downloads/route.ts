import { authDatabase } from "../../../auth/core";
import { ensureAdminSchema } from "../../../admin/store";
import { publicReleaseTenantSlug } from "../../../releases/public";

type PublishedRelease = {
  id: string;
  version: string;
  format: "NSIS" | "MSI";
  file_name: string;
  size_bytes: number;
  sha256: string;
  published_at: number;
};

const placeholders = [
  { id: "eval-agent-win-x64-nsis", name: "Eval Agent Windows 安装程序", version: "0.1.0", platform: "Windows x64", format: "NSIS", fileExtension: ".exe", available: false, downloadUrl: null, size: null, sha256: null, public: true },
  { id: "eval-agent-win-x64-msi", name: "Eval Agent Windows 企业部署包", version: "0.1.0", platform: "Windows x64", format: "MSI", fileExtension: ".msi", available: false, downloadUrl: null, size: null, sha256: null, public: true },
] as const;

export async function GET() {
  await ensureAdminSchema();
  const result = await authDatabase().prepare(
    "SELECT r.id, r.version, a.format, a.file_name, a.size_bytes, a.sha256, r.published_at FROM release_versions r JOIN agent_artifacts a ON a.id = r.artifact_id AND a.tenant_id = r.tenant_id JOIN tenants t ON t.id = r.tenant_id WHERE t.slug = ? AND r.status = 'published' AND r.channel = 'stable' AND a.status = 'ready' ORDER BY r.published_at DESC",
  ).bind(publicReleaseTenantSlug()).all<PublishedRelease>();
  const latest = new Map<string, PublishedRelease>();
  for (const item of result.results) if (!latest.has(item.format)) latest.set(item.format, item);
  const data = placeholders.map(placeholder => {
    const published = latest.get(placeholder.format);
    return published ? {
      ...placeholder,
      id: published.id,
      version: published.version,
      available: true,
      downloadUrl: `/api/v1/downloads/${published.id}`,
      size: published.size_bytes,
      sha256: published.sha256,
      fileName: published.file_name,
    } : placeholder;
  });
  return Response.json({ data, meta: { authenticationRequired: false, managedBy: "administrator", note: "仅展示管理员已正式发布并绑定真实源文件的稳定版本。" } }, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
