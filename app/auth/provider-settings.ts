import { authDatabase, ensureAuthSchema } from "./core";
import { openSecret, sealSecret } from "./secret-store";

const ENV_REF = /^[A-Z][A-Z0-9_]{2,63}$/;

export type IdentityProviderSettings = {
  tenantId: string;
  tenantSlug: string;
  smsEnabled: boolean;
  aliyunSignName: string;
  aliyunTemplateCode: string;
  aliyunTemplateCodeKey: string;
  aliyunAccessKeyId: string;
  aliyunAccessKeySecret: string;
  smsCodePepper: string;
  googleEnabled: boolean;
  googleClientIdRef: string;
  googleClientSecretRef: string;
  googleAllowedHostedDomain: string;
  githubEnabled: boolean;
  githubClientIdRef: string;
  githubClientSecretRef: string;
  updatedAt: number | null;
};

type SettingsRow = {
  tenant_id: string;
  tenant_slug: string;
  sms_enabled: boolean;
  aliyun_sign_name: string | null;
  aliyun_template_code: string | null;
  aliyun_template_code_key: string;
  aliyun_access_key_id: string | null;
  aliyun_access_key_secret_encrypted: string | null;
  sms_code_pepper_encrypted: string | null;
  google_enabled: boolean;
  google_client_id_ref: string;
  google_client_secret_ref: string;
  google_allowed_hosted_domain: string | null;
  github_enabled: boolean;
  github_client_id_ref: string;
  github_client_secret_ref: string;
  updated_at: number;
};

export function identityTenantSlug() {
  return process.env.EVAL_IDENTITY_TENANT_SLUG?.trim()
    || process.env.EVAL_PUBLIC_RELEASE_TENANT_SLUG?.trim()
    || "connecting-hangzhou";
}

export async function identityProviderSettings() {
  await ensureAuthSchema();
  const tenant = await authDatabase().prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'active'")
    .bind(identityTenantSlug())
    .first<{ id: string }>();
  if (!tenant) throw new Error("登录身份租户不存在或已停用。");
  return tenantProviderSettings(tenant.id);
}

export async function tenantProviderSettings(tenantId: string): Promise<IdentityProviderSettings> {
  await ensureAuthSchema();
  const row = await authDatabase().prepare(`
    SELECT s.tenant_id, t.slug AS tenant_slug, s.sms_enabled, s.aliyun_sign_name,
           s.aliyun_template_code, s.aliyun_template_code_key, s.aliyun_access_key_id,
           s.aliyun_access_key_secret_encrypted, s.sms_code_pepper_encrypted, s.google_enabled,
           s.google_client_id_ref, s.google_client_secret_ref, s.google_allowed_hosted_domain,
           s.github_enabled, s.github_client_id_ref, s.github_client_secret_ref,
           s.updated_at
    FROM auth_provider_settings s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.tenant_id = ?
  `).bind(tenantId).first<SettingsRow>();
  if (row) return mapSettings(row);

  const tenant = await authDatabase().prepare("SELECT id, slug FROM tenants WHERE id = ?")
    .bind(tenantId)
    .first<{ id: string; slug: string }>();
  if (!tenant) throw new Error("组织不存在。");
  return {
    tenantId,
    tenantSlug: tenant.slug,
    smsEnabled: true,
    aliyunSignName: process.env.ALIYUN_SMS_SIGN_NAME?.trim() || "",
    aliyunTemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE?.trim() || "",
    aliyunTemplateCodeKey: process.env.ALIYUN_SMS_TEMPLATE_CODE_KEY?.trim() || "code",
    aliyunAccessKeyId: "",
    aliyunAccessKeySecret: "",
    smsCodePepper: "",
    googleEnabled: true,
    googleClientIdRef: "GOOGLE_OAUTH_CLIENT_ID",
    googleClientSecretRef: "GOOGLE_OAUTH_CLIENT_SECRET",
    googleAllowedHostedDomain: process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN?.trim().toLowerCase() || "",
    githubEnabled: false,
    githubClientIdRef: "GITHUB_OAUTH_CLIENT_ID",
    githubClientSecretRef: "GITHUB_OAUTH_CLIENT_SECRET",
    updatedAt: null,
  };
}

export async function saveTenantProviderSettings(tenantId: string, input: Record<string, unknown>) {
  const existing = await tenantProviderSettings(tenantId);
  const settings = validateSettings(tenantId, input, existing);
  const now = Math.floor(Date.now() / 1000);
  const accessKeySecretEncrypted = sealSecret(settings.aliyunAccessKeySecret, secretContext(tenantId, "aliyun-access-key-secret"));
  const smsCodePepperEncrypted = sealSecret(settings.smsCodePepper, secretContext(tenantId, "sms-code-pepper"));
  await authDatabase().prepare(`
    INSERT INTO auth_provider_settings (
      tenant_id, sms_enabled, aliyun_sign_name, aliyun_template_code,
      aliyun_template_code_key, aliyun_access_key_id, aliyun_access_key_secret_encrypted,
      sms_code_pepper_encrypted, google_enabled, google_client_id_ref,
      google_client_secret_ref, google_allowed_hosted_domain, github_enabled,
      github_client_id_ref, github_client_secret_ref, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      sms_enabled=excluded.sms_enabled,
      aliyun_sign_name=excluded.aliyun_sign_name,
      aliyun_template_code=excluded.aliyun_template_code,
      aliyun_template_code_key=excluded.aliyun_template_code_key,
      aliyun_access_key_id=excluded.aliyun_access_key_id,
      aliyun_access_key_secret_encrypted=excluded.aliyun_access_key_secret_encrypted,
      sms_code_pepper_encrypted=excluded.sms_code_pepper_encrypted,
      google_enabled=excluded.google_enabled,
      google_client_id_ref=excluded.google_client_id_ref,
      google_client_secret_ref=excluded.google_client_secret_ref,
      google_allowed_hosted_domain=excluded.google_allowed_hosted_domain,
      github_enabled=excluded.github_enabled,
      github_client_id_ref=excluded.github_client_id_ref,
      github_client_secret_ref=excluded.github_client_secret_ref,
      updated_at=excluded.updated_at
  `).bind(
    tenantId,
    settings.smsEnabled,
    settings.aliyunSignName || null,
    settings.aliyunTemplateCode || null,
    settings.aliyunTemplateCodeKey,
    settings.aliyunAccessKeyId,
    accessKeySecretEncrypted,
    smsCodePepperEncrypted,
    settings.googleEnabled,
    settings.googleClientIdRef,
    settings.googleClientSecretRef,
    settings.googleAllowedHostedDomain || null,
    settings.githubEnabled,
    settings.githubClientIdRef,
    settings.githubClientSecretRef,
    now,
    now,
  ).run();
  return tenantProviderSettings(tenantId);
}

export function providerSettingsSnapshot(settings: IdentityProviderSettings) {
  const { aliyunAccessKeyId, aliyunAccessKeySecret, smsCodePepper, ...safeSettings } = settings;
  const smsCredentials = {
    accessKeyId: Boolean(aliyunAccessKeyId),
    accessKeySecret: Boolean(aliyunAccessKeySecret),
    pepper: Boolean(smsCodePepper),
  };
  const googleEnvironment = {
    clientId: environmentConfigured(settings.googleClientIdRef),
    clientSecret: environmentConfigured(settings.googleClientSecretRef),
  };
  const githubEnvironment = {
    clientId: environmentConfigured(settings.githubClientIdRef),
    clientSecret: environmentConfigured(settings.githubClientSecretRef),
  };
  const origin = process.env.APP_ORIGIN?.trim() || "https://eval.zailink.space";
  return {
    ...safeSettings,
    aliyunAccessKeyIdConfigured: smsCredentials.accessKeyId,
    aliyunAccessKeySecretConfigured: smsCredentials.accessKeySecret,
    smsCodePepperConfigured: smsCredentials.pepper,
    identityTenant: settings.tenantSlug === identityTenantSlug(),
    callbackUrl: `${new URL(origin).origin}/api/auth/google/callback`,
    githubCallbackUrl: `${new URL(origin).origin}/api/auth/github/callback`,
    smsCredentials,
    googleEnvironment,
    githubEnvironment,
    smsConfigured: settings.smsEnabled
      && Boolean(settings.aliyunSignName && settings.aliyunTemplateCode)
      && Object.values(smsCredentials).every(Boolean),
    googleConfigured: settings.googleEnabled && Object.values(googleEnvironment).every(Boolean),
    githubConfigured: settings.githubEnabled && Object.values(githubEnvironment).every(Boolean),
  };
}

export function environmentValue(reference: string) {
  if (!ENV_REF.test(reference)) throw new Error("部署变量引用格式无效。");
  const value = process.env[reference]?.trim();
  if (!value) throw new Error(`部署环境尚未配置 ${reference}。`);
  return value;
}

function environmentConfigured(reference: string) {
  return ENV_REF.test(reference) && Boolean(process.env[reference]?.trim());
}

function validateSettings(tenantId: string, input: Record<string, unknown>, existing: IdentityProviderSettings): IdentityProviderSettings {
  const value = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  const reference = (key: string, fallback = "") => {
    const result = value(key) || fallback;
    if (!ENV_REF.test(result)) throw new Error(`${key} 必须是有效的部署环境变量名。`);
    return result;
  };
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
  const hostedDomain = value("googleAllowedHostedDomain").toLowerCase();
  if (hostedDomain && !/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostedDomain)) {
    throw new Error("Google Workspace 域格式无效。");
  }
  return {
    tenantId,
    tenantSlug: "",
    smsEnabled: input.smsEnabled === true,
    aliyunSignName: value("aliyunSignName").slice(0, 64),
    aliyunTemplateCode: templateCode,
    aliyunTemplateCodeKey: templateKey,
    aliyunAccessKeyId: accessKeyId,
    aliyunAccessKeySecret: accessKeySecret,
    smsCodePepper,
    googleEnabled: input.googleEnabled === true,
    googleClientIdRef: reference("googleClientIdRef"),
    googleClientSecretRef: reference("googleClientSecretRef"),
    googleAllowedHostedDomain: hostedDomain,
    githubEnabled: input.githubEnabled === true,
    githubClientIdRef: reference("githubClientIdRef"),
    githubClientSecretRef: reference("githubClientSecretRef"),
    updatedAt: null,
  };
}

function mapSettings(row: SettingsRow): IdentityProviderSettings {
  return {
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    smsEnabled: Boolean(row.sms_enabled),
    aliyunSignName: row.aliyun_sign_name || "",
    aliyunTemplateCode: row.aliyun_template_code || "",
    aliyunTemplateCodeKey: row.aliyun_template_code_key,
    aliyunAccessKeyId: row.aliyun_access_key_id || "",
    aliyunAccessKeySecret: openSecret(row.aliyun_access_key_secret_encrypted, secretContext(row.tenant_id, "aliyun-access-key-secret")),
    smsCodePepper: openSecret(row.sms_code_pepper_encrypted, secretContext(row.tenant_id, "sms-code-pepper")),
    googleEnabled: Boolean(row.google_enabled),
    googleClientIdRef: row.google_client_id_ref,
    googleClientSecretRef: row.google_client_secret_ref,
    googleAllowedHostedDomain: row.google_allowed_hosted_domain || "",
    githubEnabled: Boolean(row.github_enabled),
    githubClientIdRef: row.github_client_id_ref,
    githubClientSecretRef: row.github_client_secret_ref,
    updatedAt: Number(row.updated_at),
  };
}

function secretContext(tenantId: string, field: string) {
  return `auth-provider-settings:${tenantId}:${field}`;
}
