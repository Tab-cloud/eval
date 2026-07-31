import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

const epoch = (name: string) => bigint(name, { mode: "number" });
const timestamps = {
  createdAt: epoch("created_at").notNull(),
  updatedAt: epoch("updated_at").notNull(),
};

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  plan: text("plan", { enum: ["starter", "team", "enterprise"] }).notNull().default("team"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  ...timestamps,
}, (table) => [uniqueIndex("tenants_slug_uq").on(table.slug)]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  phoneE164: text("phone_e164"),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  status: text("status", { enum: ["invited", "active", "disabled"] }).notNull(),
  lastLoginAt: epoch("last_login_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("users_email_uq").on(table.email),
  uniqueIndex("users_phone_uq").on(table.phoneE164),
]);

export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["platform_admin", "tenant_admin", "developer", "auditor", "viewer"] }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("membership_tenant_user_uq").on(table.tenantId, table.userId),
  index("membership_tenant_idx").on(table.tenantId),
]);

export const passwordCredentials = pgTable("password_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  iterations: integer("iterations").notNull(),
  updatedAt: epoch("updated_at").notNull(),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  expiresAt: epoch("expires_at").notNull(),
  createdAt: epoch("created_at").notNull(),
}, (table) => [
  uniqueIndex("auth_sessions_token_uq").on(table.tokenHash),
  index("auth_sessions_user_idx").on(table.userId),
]);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  secretHash: text("secret_hash").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  expiresAt: epoch("expires_at"),
  lastUsedAt: epoch("last_used_at"),
  revokedAt: epoch("revoked_at"),
  ...timestamps,
}, (table) => [
  index("api_keys_tenant_idx").on(table.tenantId),
  uniqueIndex("api_keys_hash_uq").on(table.secretHash),
]);

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  upstreamModel: text("upstream_model").notNull(),
  displayName: text("display_name").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  status: text("status", { enum: ["active", "maintenance", "disabled"] }).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("models_provider_name_uq").on(table.provider, table.upstreamModel)]);

export const tenantModelGrants = pgTable("tenant_model_grants", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  requestsPerMinute: integer("requests_per_minute").notNull().default(60),
  monthlyTokenLimit: bigint("monthly_token_limit", { mode: "number" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("tenant_model_grant_uq").on(table.tenantId, table.modelId),
  index("model_grants_tenant_idx").on(table.tenantId),
]);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  ipHash: text("ip_hash"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: epoch("created_at").notNull(),
}, (table) => [index("audit_tenant_time_idx").on(table.tenantId, table.createdAt)]);

export const releases = pgTable("releases", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: text("version").notNull(),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  visibility: text("visibility", { enum: ["public", "tenant", "internal"] }).notNull(),
  ...timestamps,
}, (table) => [index("releases_tenant_idx").on(table.tenantId)]);

export const llmConfigs = pgTable("llm_configs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  baseUrl: text("base_url").notNull(),
  secretRef: text("secret_ref").notNull(),
  status: text("status", { enum: ["active", "maintenance", "disabled"] }).notNull().default("active"),
  requestsPerMinute: integer("requests_per_minute").notNull().default(60),
  ...timestamps,
}, (table) => [index("llm_configs_tenant_idx").on(table.tenantId)]);

export const agentArtifacts = pgTable("agent_artifacts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  label: text("label").notNull(),
  format: text("format", { enum: ["NSIS", "MSI"] }).notNull(),
  objectKey: text("object_key").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  updaterSignature: text("updater_signature"),
  platform: text("platform").notNull().default("windows"),
  architecture: text("architecture").notNull().default("x86_64"),
  status: text("status", { enum: ["ready", "archived"] }).notNull().default("ready"),
  createdAt: epoch("created_at").notNull(),
}, (table) => [
  index("agent_artifacts_tenant_idx").on(table.tenantId),
  uniqueIndex("agent_artifacts_object_key_uq").on(table.objectKey),
]);

export const releaseVersions = pgTable("release_versions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  channel: text("channel", { enum: ["stable", "beta", "internal"] }).notNull(),
  artifactId: text("artifact_id").notNull().references(() => agentArtifacts.id),
  notes: text("notes").notNull(),
  mandatory: boolean("mandatory").notNull().default(false),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  publishedAt: epoch("published_at"),
  ...timestamps,
}, (table) => [
  index("release_versions_tenant_idx").on(table.tenantId),
  uniqueIndex("release_versions_tenant_version_uq").on(table.tenantId, table.version, table.channel),
]);

export const billingPlans = pgTable("billing_plans", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  currency: text("currency", { enum: ["CNY", "USD"] }).notNull().default("CNY"),
  requestLimit: bigint("request_limit", { mode: "number" }).notNull(),
  seatLimit: integer("seat_limit").notNull(),
  features: jsonb("features").$type<string[]>().notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  ...timestamps,
}, (table) => [index("billing_plans_tenant_idx").on(table.tenantId)]);

export const gatewayRequests = pgTable("gateway_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  modelConfigId: text("model_config_id").references(() => llmConfigs.id),
  endpoint: text("endpoint", { enum: ["chat.completions", "responses"] }).notNull(),
  statusCode: integer("status_code").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  errorCode: text("error_code"),
  createdAt: epoch("created_at").notNull(),
}, (table) => [
  index("gateway_requests_tenant_time_idx").on(table.tenantId, table.createdAt),
  index("gateway_requests_key_time_idx").on(table.apiKeyId, table.createdAt),
]);

export const authLoginAttempts = pgTable("auth_login_attempts", {
  keyHash: text("key_hash").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  firstFailedAt: epoch("first_failed_at").notNull(),
  blockedUntil: epoch("blocked_until"),
  updatedAt: epoch("updated_at").notNull(),
});

export const authSmsChallenges = pgTable("auth_sms_challenges", {
  keyHash: text("key_hash").primaryKey(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: epoch("expires_at").notNull(),
  consumedAt: epoch("consumed_at"),
  aliyunBizId: text("aliyun_biz_id"),
  ...timestamps,
});

export const authSmsRateLimits = pgTable("auth_sms_rate_limits", {
  keyHash: text("key_hash").primaryKey(),
  windowStartedAt: epoch("window_started_at").notNull(),
  sendCount: integer("send_count").notNull().default(0),
  blockedUntil: epoch("blocked_until"),
  updatedAt: epoch("updated_at").notNull(),
});

export const authOauthStates = pgTable("auth_oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: epoch("expires_at").notNull(),
  consumedAt: epoch("consumed_at"),
  createdAt: epoch("created_at").notNull(),
});

export const authOidcIdentities = pgTable("auth_oidc_identities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  subject: text("subject").notNull(),
  emailAtLink: text("email_at_link").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("auth_oidc_provider_subject_uq").on(table.provider, table.subject),
  uniqueIndex("auth_oidc_provider_user_uq").on(table.provider, table.userId),
  index("auth_oidc_user_idx").on(table.userId),
]);

export const authProviderSettings = pgTable("auth_provider_settings", {
  tenantId: text("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  aliyunSignName: text("aliyun_sign_name"),
  aliyunTemplateCode: text("aliyun_template_code"),
  aliyunTemplateCodeKey: text("aliyun_template_code_key").notNull().default("code"),
  aliyunAccessKeyIdRef: text("aliyun_access_key_id_ref").notNull().default("ALIBABA_CLOUD_ACCESS_KEY_ID"),
  aliyunAccessKeySecretRef: text("aliyun_access_key_secret_ref").notNull().default("ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
  smsCodePepperRef: text("sms_code_pepper_ref").notNull().default("AUTH_SMS_CODE_PEPPER"),
  googleEnabled: boolean("google_enabled").notNull().default(false),
  googleClientIdRef: text("google_client_id_ref").notNull().default("GOOGLE_OAUTH_CLIENT_ID"),
  googleClientSecretRef: text("google_client_secret_ref").notNull().default("GOOGLE_OAUTH_CLIENT_SECRET"),
  googleAllowedHostedDomain: text("google_allowed_hosted_domain"),
  ...timestamps,
});
