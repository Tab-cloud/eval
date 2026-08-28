import { authDatabase } from "../auth/core";
import { validateUpdaterPublicKey } from "./signature";

export type UpdaterPlatform = "windows" | "darwin";

const SETTINGS_IDS: Record<UpdaterPlatform, UpdaterPlatform> = {
  windows: "windows",
  darwin: "darwin",
};
const LEGACY_WINDOWS_SETTINGS_ID = "global";
const ENVIRONMENT_KEYS: Record<UpdaterPlatform, string> = {
  windows: "EVAL_UPDATER_PUBLIC_KEY",
  darwin: "EVAL_MACOS_UPDATER_PUBLIC_KEY",
};

export type ReleaseSigningSettings = {
  platform: UpdaterPlatform;
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

export async function releaseSigningSettings(platform: UpdaterPlatform = "windows"): Promise<ReleaseSigningSettings | null> {
  const row = platform === "windows"
    ? await authDatabase().prepare(`
        SELECT updater_public_key, updater_public_key_id, updated_at
        FROM release_settings WHERE id IN (?, ?)
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1
      `).bind(SETTINGS_IDS.windows, LEGACY_WINDOWS_SETTINGS_ID, SETTINGS_IDS.windows).first<ReleaseSettingsRow>()
    : await authDatabase().prepare(`
        SELECT updater_public_key, updater_public_key_id, updated_at
        FROM release_settings WHERE id = ?
      `).bind(SETTINGS_IDS.darwin).first<ReleaseSettingsRow>();
  if (row) {
    return {
      platform,
      publicKey: row.updater_public_key,
      publicKeyId: row.updater_public_key_id,
      source: "database",
      updatedAt: Number(row.updated_at),
    };
  }

  const environmentKey = process.env[ENVIRONMENT_KEYS[platform]]?.trim();
  if (!environmentKey) return null;
  try {
    const validated = await validateUpdaterPublicKey(environmentKey);
    return {
      platform,
      publicKey: validated.publicKey,
      publicKeyId: validated.publicKeyId,
      source: "environment",
      updatedAt: null,
    };
  } catch {
    return null;
  }
}

export async function publicReleaseSigningSettings(platform: UpdaterPlatform = "windows") {
  return releaseSigningSettings(platform);
}

export async function requireReleaseSigningSettings(platform: UpdaterPlatform = "windows") {
  const settings = await releaseSigningSettings(platform);
  if (!settings) throw new Error(`请先在版本发布页面配置${platform === "darwin" ? "macOS" : "Windows"}更新签名公钥。`);
  return settings;
}

export async function saveReleaseSigningSettings(updatedBy: string, platform: UpdaterPlatform, value: unknown) {
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
  `).bind(SETTINGS_IDS[platform], validated.publicKey, validated.publicKeyId, updatedBy, now, now).run();
  return releaseSigningSettings(platform);
}

export function releaseSettingsSnapshot(settings: ReleaseSigningSettings | null) {
  return {
    platform: settings?.platform ?? null,
    configured: Boolean(settings),
    updaterPublicKey: settings?.publicKey ?? "",
    updaterPublicKeyId: settings?.publicKeyId ?? "",
    source: settings?.source ?? "missing",
    updatedAt: settings?.updatedAt ?? null,
  };
}
