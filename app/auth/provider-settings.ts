import { authDatabase, ensureAuthSchema } from "./core";
import { openSecret, sealSecret } from "./secret-store";

const SETTINGS_ID = "global";
const GLOBAL_ENCRYPTION_CONTEXT = "global";

export type IdentityProviderSettings = {
  smsEnabled: boolean;
  aliyunSignName: string;
  aliyunTemplateCode: string;
  aliyunTemplateCodeKey: string;
  aliyunAccessKeyId: string;
  aliyunAccessKeySecret: string;
  smsCodePepper: string;
  googleEnabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleAllowedHostedDomain: string;
  githubEnabled: boolean;
  githubClientId: string;
  githubClientSecret: string;
  updatedAt: number | null;
};

type SettingsRow = {
  id: string;
  encryption_context: string;
  sms_enabled: boolean;
  aliyun_sign_name: string | null;
  aliyun_template_code: string | null;
  aliyun_template_code_key: string;
  aliyun_access_key_id: string | null;
  aliyun_access_key_secret_encrypted: string | null;
  sms_code_pepper_encrypted: string | null;
  google_enabled: boolean;
  google_client_id: string | null;
  google_client_secret_encrypted: string | null;
  google_allowed_hosted_domain: string | null;
  github_enabled: boolean;
  github_client_id: string | null;
  github_client_secret_encrypted: string | null;
  updated_at: number;
};

export async function identityProviderSettings(): Promise<IdentityProviderSettings> {
  await ensureAuthSchema();
  const row = await authDatabase().prepare(`
    SELECT id, encryption_context, sms_enabled, aliyun_sign_name,
           aliyun_template_code, aliyun_template_code_key, aliyun_access_key_id,
           aliyun_access_key_secret_encrypted, sms_code_pepper_encrypted, google_enabled,
           google_client_id, google_client_secret_encrypted, google_allowed_hosted_domain,
           github_enabled, github_client_id, github_client_secret_encrypted, updated_at
    FROM auth_provider_settings
    WHERE id = ?
  `).bind(SETTINGS_ID).first<SettingsRow>();
  return row ? mapSettings(row) : defaultSettings();
}

export async function saveProviderSettings(input: Record<string, unknown>) {
  const existing = await identityProviderSettings();
  const settings = validateSettings(input, existing);
  const now = Math.floor(Date.now() / 1000);
  const accessKeySecretEncrypted = sealSecret(settings.aliyunAccessKeySecret, secretContext("aliyun-access-key-secret"));
  const smsCodePepperEncrypted = sealSecret(settings.smsCodePepper, secretContext("sms-code-pepper"));
  const googleClientSecretEncrypted = sealSecret(settings.googleClientSecret, secretContext("google-client-secret"));
  const githubClientSecretEncrypted = sealSecret(settings.githubClientSecret, secretContext("github-client-secret"));
  await authDatabase().prepare(`
    INSERT INTO auth_provider_settings (
      id, encryption_context, sms_enabled, aliyun_sign_name, aliyun_template_code,
      aliyun_template_code_key, aliyun_access_key_id, aliyun_access_key_secret_encrypted,
      sms_code_pepper_encrypted, google_enabled, google_client_id,
      google_client_secret_encrypted, google_allowed_hosted_domain, github_enabled,
      github_client_id, github_client_secret_encrypted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      encryption_context=excluded.encryption_context,
      sms_enabled=excluded.sms_enabled,
      aliyun_sign_name=excluded.aliyun_sign_name,
      aliyun_template_code=excluded.aliyun_template_code,
      aliyun_template_code_key=excluded.aliyun_template_code_key,
      aliyun_access_key_id=excluded.aliyun_access_key_id,
      aliyun_access_key_secret_encrypted=excluded.aliyun_access_key_secret_encrypted,
      sms_code_pepper_encrypted=excluded.sms_code_pepper_encrypted,
      google_enabled=excluded.google_enabled,
      google_client_id=excluded.google_client_id,
      google_client_secret_encrypted=excluded.google_client_secret_encrypted,
      google_allowed_hosted_domain=excluded.google_allowed_hosted_domain,
      github_enabled=excluded.github_enabled,
      github_client_id=excluded.github_client_id,
      github_client_secret_encrypted=excluded.github_client_secret_encrypted,
      updated_at=excluded.updated_at
  `).bind(
    SETTINGS_ID,
    GLOBAL_ENCRYPTION_CONTEXT,
    settings.smsEnabled,
    settings.aliyunSignName || null,
    settings.aliyunTemplateCode || null,
    settings.aliyunTemplateCodeKey,
    settings.aliyunAccessKeyId,
    accessKeySecretEncrypted,
    smsCodePepperEncrypted,
    settings.googleEnabled,
    settings.googleClientId,
    googleClientSecretEncrypted,
    settings.googleAllowedHostedDomain || null,
    settings.githubEnabled,
    settings.githubClientId,
    githubClientSecretEncrypted,
    now,
    now,
  ).run();
  return identityProviderSettings();
}

export function providerSettingsSnapshot(settings: IdentityProviderSettings) {
  const { aliyunAccessKeyId, aliyunAccessKeySecret, smsCodePepper, googleClientId, googleClientSecret, githubClientId, githubClientSecret, ...safeSettings } = settings;
  const smsCredentials = {
    accessKeyId: Boolean(aliyunAccessKeyId),
    accessKeySecret: Boolean(aliyunAccessKeySecret),
    pepper: Boolean(smsCodePepper),
  };
  const googleCredentials = {
    clientId: Boolean(googleClientId),
    clientSecret: Boolean(googleClientSecret),
  };
  const githubCredentials = {
    clientId: Boolean(githubClientId),
    clientSecret: Boolean(githubClientSecret),
  };
  const smsReady = Boolean(settings.aliyunSignName && settings.aliyunTemplateCode)
    && Object.values(smsCredentials).every(Boolean);
  const googleReady = Object.values(googleCredentials).every(Boolean);
  const githubReady = Object.values(githubCredentials).every(Boolean);
  const smsEnabled = settings.smsEnabled && smsReady;
  const googleEnabled = settings.googleEnabled && googleReady;
  const githubEnabled = settings.githubEnabled && githubReady;
  const origin = process.env.APP_ORIGIN?.trim() || "https://eval.zailink.space";
  return {
    ...safeSettings,
    smsEnabled,
    googleEnabled,
    githubEnabled,
    aliyunAccessKeyIdConfigured: smsCredentials.accessKeyId,
    aliyunAccessKeySecretConfigured: smsCredentials.accessKeySecret,
    smsCodePepperConfigured: smsCredentials.pepper,
    googleClientIdConfigured: googleCredentials.clientId,
    googleClientSecretConfigured: googleCredentials.clientSecret,
    githubClientIdConfigured: githubCredentials.clientId,
    githubClientSecretConfigured: githubCredentials.clientSecret,
    callbackUrl: `${new URL(origin).origin}/api/auth/google/callback`,
    githubCallbackUrl: `${new URL(origin).origin}/api/auth/github/callback`,
    smsCredentials,
    smsConfigured: smsEnabled,
    googleConfigured: googleEnabled,
    githubConfigured: githubEnabled,
  };
}

function defaultSettings(): IdentityProviderSettings {
  return {
    smsEnabled: false,
    aliyunSignName: process.env.ALIYUN_SMS_SIGN_NAME?.trim() || "",
    aliyunTemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE?.trim() || "",
    aliyunTemplateCodeKey: process.env.ALIYUN_SMS_TEMPLATE_CODE_KEY?.trim() || "code",
    aliyunAccessKeyId: "",
    aliyunAccessKeySecret: "",
    smsCodePepper: "",
    googleEnabled: false,
    googleClientId: "",
    googleClientSecret: "",
    googleAllowedHostedDomain: process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN?.trim().toLowerCase() || "",
    githubEnabled: false,
    githubClientId: "",
    githubClientSecret: "",
    updatedAt: null,
  };
}

function validateSettings(input: Record<string, unknown>, existing: IdentityProviderSettings): IdentityProviderSettings {
  const value = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  const templateKey = value("aliyunTemplateCodeKey") || "code";
  if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(templateKey)) throw new Error("短信模板变量名格式无效。");
  const templateCode = value("aliyunTemplateCode");
  if (templateCode && !/^[A-Za-z0-9_-]{2,64}$/.test(templateCode)) throw new Error("短信模板代码格式无效。");
  const accessKeyId = value("aliyunAccessKeyId") || existing.aliyunAccessKeyId;
  if (accessKeyId && !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId)) throw new Error("请输入有效的阿里云 AccessKey ID。");
  const accessKeySecret = value("aliyunAccessKeySecret") || existing.aliyunAccessKeySecret;
  if (accessKeySecret.length > 512) throw new Error("阿里云 AccessKey Secret 长度无效。");
  const smsCodePepper = value("smsCodePepper") || existing.smsCodePepper;
  if (smsCodePepper && (smsCodePepper.length < 32 || smsCodePepper.length > 512)) throw new Error("验证码 Pepper 必须为 32 至 512 个字符。");
  if (input.smsEnabled === true && (!accessKeyId || !accessKeySecret || !smsCodePepper)) {
    throw new Error("启用短信登录前，请填写 AccessKey ID、AccessKey Secret 和验证码 Pepper。");
  }
  const googleClientId = value("googleClientId") || existing.googleClientId;
  if (googleClientId && (googleClientId.length > 512 || /[\s=]/.test(googleClientId))) {
    throw new Error("Google Client ID 只需填写真实值，不要包含变量名、等号或空格。");
  }
  const googleClientSecret = value("googleClientSecret") || existing.googleClientSecret;
  if (googleClientSecret && (googleClientSecret.length > 512 || /[\s=]/.test(googleClientSecret))) {
    throw new Error("Google Client Secret 只需填写真实值，不要包含变量名、等号或空格。");
  }
  if (input.googleEnabled === true && (!googleClientId || !googleClientSecret)) {
    throw new Error("启用 Google 登录前，请填写 Client ID 和 Client Secret。");
  }
  const hostedDomain = value("googleAllowedHostedDomain").toLowerCase();
  if (hostedDomain && !/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostedDomain)) {
    throw new Error("Google Workspace 域格式无效。");
  }
  const githubClientId = value("githubClientId") || existing.githubClientId;
  if (githubClientId && (githubClientId.length > 256 || /[\s=]/.test(githubClientId))) {
    throw new Error("GitHub Client ID 只需填写真实值，不要包含变量名、等号或空格。");
  }
  const githubClientSecret = value("githubClientSecret") || existing.githubClientSecret;
  if (githubClientSecret && (githubClientSecret.length > 512 || /[\s=]/.test(githubClientSecret))) {
    throw new Error("GitHub Client Secret 只需填写真实值，不要包含变量名、等号或空格。");
  }
  if (input.githubEnabled === true && (!githubClientId || !githubClientSecret)) {
    throw new Error("启用 GitHub 登录前，请填写 Client ID 和 Client Secret。");
  }
  return {
    smsEnabled: input.smsEnabled === true,
    aliyunSignName: value("aliyunSignName").slice(0, 64),
    aliyunTemplateCode: templateCode,
    aliyunTemplateCodeKey: templateKey,
    aliyunAccessKeyId: accessKeyId,
    aliyunAccessKeySecret: accessKeySecret,
    smsCodePepper,
    googleEnabled: input.googleEnabled === true,
    googleClientId,
    googleClientSecret,
    googleAllowedHostedDomain: hostedDomain,
    githubEnabled: input.githubEnabled === true,
    githubClientId,
    githubClientSecret,
    updatedAt: null,
  };
}

function mapSettings(row: SettingsRow): IdentityProviderSettings {
  const context = row.encryption_context || GLOBAL_ENCRYPTION_CONTEXT;
  return {
    smsEnabled: Boolean(row.sms_enabled),
    aliyunSignName: row.aliyun_sign_name || "",
    aliyunTemplateCode: row.aliyun_template_code || "",
    aliyunTemplateCodeKey: row.aliyun_template_code_key,
    aliyunAccessKeyId: row.aliyun_access_key_id || "",
    aliyunAccessKeySecret: openSecret(row.aliyun_access_key_secret_encrypted, secretContext("aliyun-access-key-secret", context)),
    smsCodePepper: openSecret(row.sms_code_pepper_encrypted, secretContext("sms-code-pepper", context)),
    googleEnabled: Boolean(row.google_enabled),
    googleClientId: row.google_client_id || "",
    googleClientSecret: openSecret(row.google_client_secret_encrypted, secretContext("google-client-secret", context)),
    googleAllowedHostedDomain: row.google_allowed_hosted_domain || "",
    githubEnabled: Boolean(row.github_enabled),
    githubClientId: row.github_client_id || "",
    githubClientSecret: openSecret(row.github_client_secret_encrypted, secretContext("github-client-secret", context)),
    updatedAt: Number(row.updated_at),
  };
}

function secretContext(field: string, context = GLOBAL_ENCRYPTION_CONTEXT) {
  return `auth-provider-settings:${context}:${field}`;
}
