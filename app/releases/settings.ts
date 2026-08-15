import { authDatabase } from "../auth/core";
import { publicReleaseTenantSlug } from "./public";
import { validateUpdaterPublicKey } from "./signature";

export type ReleaseSigningSettings = {
  tenantId: string;
  publicKey: string;
  publicKeyId: string;
  source: "database" | "environment";
  updatedAt: number | null;
};

type ReleaseSettingsRow = {
  tenant_id: string;
  updater_public_key: string;
  updater_public_key_id: string;
  updated_at: number;
};

export async function tenantReleaseSigningSettings(tenantId: string): Promise<ReleaseSigningSettings | null> {
  const row = await authDatabase().prepare(`
    SELECT tenant_id, updater_public_key, updater_public_key_id, updated_at
    FROM release_settings WHERE tenant_id = ?
  `).bind(tenantId).first<ReleaseSettingsRow>();
  if (row) {
    return {
      tenantId: row.tenant_id,
      publicKey: row.updater_public_key,
      publicKeyId: row.updater_public_key_id,
      source: "database",
      updatedAt: Number(row.updated_at),
    };
  }

  const environmentKey = process.env.EVAL_UPDATER_PUBLIC_KEY?.trim();
  if (!environmentKey) return null;
  let validated: Awaited<ReturnType<typeof validateUpdaterPublicKey>>;
  try {
    validated = await validateUpdaterPublicKey(environmentKey);
  } catch {
    return null;
  }
  return {
    tenantId,
    publicKey: validated.publicKey,
    publicKeyId: validated.publicKeyId,
    source: "environment",
    updatedAt: null,
  };
}

export async function publicReleaseSigningSettings() {
  const tenant = await authDatabase().prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'active'")
    .bind(publicReleaseTenantSlug())
    .first<{ id: string }>();
  if (!tenant) return null;
  return tenantReleaseSigningSettings(tenant.id);
}

export async function requireTenantReleaseSigningSettings(tenantId: string) {
  const settings = await tenantReleaseSigningSettings(tenantId);
  if (!settings) throw new Error("请先在版本发布页面配置更新签名公钥。");
  return settings;
}

export async function saveTenantReleaseSigningSettings(tenantId: string, updatedBy: string, value: unknown) {
  const input = typeof value === "string" ? value : "";
  if (input.length > 8_192) throw new Error("更新签名公钥内容过长。");
  const validated = await validateUpdaterPublicKey(input);
  const now = Math.floor(Date.now() / 1000);
  await authDatabase().prepare(`
    INSERT INTO release_settings (
      tenant_id, updater_public_key, updater_public_key_id, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      updater_public_key=excluded.updater_public_key,
      updater_public_key_id=excluded.updater_public_key_id,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).bind(tenantId, validated.publicKey, validated.publicKeyId, updatedBy, now, now).run();
  return tenantReleaseSigningSettings(tenantId);
}

export function releaseSettingsSnapshot(settings: ReleaseSigningSettings | null, tenantSlug: string) {
  return {
    configured: Boolean(settings),
    updaterPublicKey: settings?.publicKey ?? "",
    updaterPublicKeyId: settings?.publicKeyId ?? "",
    source: settings?.source ?? "missing",
    updatedAt: settings?.updatedAt ?? null,
    publicReleaseTenant: tenantSlug === publicReleaseTenantSlug(),
  };
}
