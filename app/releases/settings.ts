import { authDatabase } from "../auth/core";
import { validateUpdaterPublicKey } from "./signature";

const SETTINGS_ID = "global";

export type ReleaseSigningSettings = {
  publicKey: string;
  publicKeyId: string;
  source: "database" | "environment";
  updatedAt: number | null;
};

type ReleaseSettingsRow = {
  updater_public_key: string;
  updater_public_key_id: string;
  updated_at: number;
};

export async function releaseSigningSettings(): Promise<ReleaseSigningSettings | null> {
  const row = await authDatabase().prepare(`
    SELECT updater_public_key, updater_public_key_id, updated_at
    FROM release_settings WHERE id = ?
  `).bind(SETTINGS_ID).first<ReleaseSettingsRow>();
  if (row) {
    return {
      publicKey: row.updater_public_key,
      publicKeyId: row.updater_public_key_id,
      source: "database",
      updatedAt: Number(row.updated_at),
    };
  }

  const environmentKey = process.env.EVAL_UPDATER_PUBLIC_KEY?.trim();
  if (!environmentKey) return null;
  try {
    const validated = await validateUpdaterPublicKey(environmentKey);
    return {
      publicKey: validated.publicKey,
      publicKeyId: validated.publicKeyId,
      source: "environment",
      updatedAt: null,
    };
  } catch {
    return null;
  }
}

export const publicReleaseSigningSettings = releaseSigningSettings;

export async function requireReleaseSigningSettings() {
  const settings = await releaseSigningSettings();
  if (!settings) throw new Error("请先在版本发布页面配置更新签名公钥。");
  return settings;
}

export async function saveReleaseSigningSettings(updatedBy: string, value: unknown) {
  const input = typeof value === "string" ? value : "";
  if (input.length > 8_192) throw new Error("更新签名公钥内容过长。");
  const validated = await validateUpdaterPublicKey(input);
  const now = Math.floor(Date.now() / 1000);
  await authDatabase().prepare(`
    INSERT INTO release_settings (
      id, updater_public_key, updater_public_key_id, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updater_public_key=excluded.updater_public_key,
      updater_public_key_id=excluded.updater_public_key_id,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).bind(SETTINGS_ID, validated.publicKey, validated.publicKeyId, updatedBy, now, now).run();
  return releaseSigningSettings();
}

export function releaseSettingsSnapshot(settings: ReleaseSigningSettings | null) {
  return {
    configured: Boolean(settings),
    updaterPublicKey: settings?.publicKey ?? "",
    updaterPublicKeyId: settings?.publicKeyId ?? "",
    source: settings?.source ?? "missing",
    updatedAt: settings?.updatedAt ?? null,
  };
}
