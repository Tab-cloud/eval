import { authDatabase, ensureAuthSchema } from "./core";

const ENV_REF = /^[A-Z][A-Z0-9_]{2,63}$/;

export type IdentityProviderSettings = {
  tenantId: string;
  tenantSlug: string;
  smsEnabled: boolean;
  aliyunSignName: string;
  aliyunTemplateCode: string;
  aliyunTemplateCodeKey: string;
  aliyunAccessKeyIdRef: string;
  aliyunAccessKeySecretRef: string;
  smsCodePepperRef: string;
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
  aliyun_access_key_id_ref: string;
  aliyun_access_key_secret_ref: string;
  sms_code_pepper_ref: string;
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
           s.aliyun_template_code, s.aliyun_template_code_key, s.aliyun_access_key_id_ref,
           s.aliyun_access_key_secret_ref, s.sms_code_pepper_ref, s.google_enabled,
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
    aliyunAccessKeyIdRef: "ALIBABA_CLOUD_ACCESS_KEY_ID",
    aliyunAccessKeySecretRef: "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
    smsCodePepperRef: "AUTH_SMS_CODE_PEPPER",
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
  const settings = validateSettings(tenantId, input);
  const now = Math.floor(Date.now() / 1000);
  await authDatabase().prepare(`
    INSERT INTO auth_provider_settings (
      tenant_id, sms_enabled, aliyun_sign_name, aliyun_template_code,
      aliyun_template_code_key, aliyun_access_key_id_ref, aliyun_access_key_secret_ref,
      sms_code_pepper_ref, google_enabled, google_client_id_ref,
      google_client_secret_ref, google_allowed_hosted_domain, github_enabled,
      github_client_id_ref, github_client_secret_ref, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      sms_enabled=excluded.sms_enabled,
      aliyun_sign_name=excluded.aliyun_sign_name,
      aliyun_template_code=excluded.aliyun_template_code,
      aliyun_template_code_key=excluded.aliyun_template_code_key,
      aliyun_access_key_id_ref=excluded.aliyun_access_key_id_ref,
      aliyun_access_key_secret_ref=excluded.aliyun_access_key_secret_ref,
      sms_code_pepper_ref=excluded.sms_code_pepper_ref,
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
    settings.aliyunAccessKeyIdRef,
    settings.aliyunAccessKeySecretRef,
    settings.smsCodePepperRef,
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
  const smsEnvironment = {
    accessKeyId: environmentConfigured(settings.aliyunAccessKeyIdRef),
    accessKeySecret: environmentConfigured(settings.aliyunAccessKeySecretRef),
    pepper: environmentConfigured(settings.smsCodePepperRef),
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
    ...settings,
    identityTenant: settings.tenantSlug === identityTenantSlug(),
    callbackUrl: `${new URL(origin).origin}/api/auth/google/callback`,
    githubCallbackUrl: `${new URL(origin).origin}/api/auth/github/callback`,
    smsEnvironment,
    googleEnvironment,
    githubEnvironment,
    smsConfigured: settings.smsEnabled
      && Boolean(settings.aliyunSignName && settings.aliyunTemplateCode)
      && Object.values(smsEnvironment).every(Boolean),
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

function validateSettings(tenantId: string, input: Record<string, unknown>): IdentityProviderSettings {
  const value = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  const reference = (key: string) => {
    const result = value(key);
    if (!ENV_REF.test(result)) throw new Error(`${key} 必须是有效的部署环境变量名。`);
    return result;
  };
  const templateKey = value("aliyunTemplateCodeKey") || "code";
  if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(templateKey)) throw new Error("短信模板变量名格式无效。");
  const templateCode = value("aliyunTemplateCode");
  if (templateCode && !/^[A-Za-z0-9_-]{2,64}$/.test(templateCode)) throw new Error("短信模板代码格式无效。");
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
    aliyunAccessKeyIdRef: reference("aliyunAccessKeyIdRef"),
    aliyunAccessKeySecretRef: reference("aliyunAccessKeySecretRef"),
    smsCodePepperRef: reference("smsCodePepperRef"),
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
    aliyunAccessKeyIdRef: row.aliyun_access_key_id_ref,
    aliyunAccessKeySecretRef: row.aliyun_access_key_secret_ref,
    smsCodePepperRef: row.sms_code_pepper_ref,
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
