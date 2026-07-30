import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
};

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(),
  plan: text("plan", { enum: ["starter", "team", "enterprise"] }).notNull().default("team"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"), ...timestamps,
}, (t) => [uniqueIndex("tenants_slug_uq").on(t.slug)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull(), displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"), status: text("status", { enum: ["invited", "active", "disabled"] }).notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }), ...timestamps,
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["platform_admin", "tenant_admin", "developer", "auditor", "viewer"] }).notNull(), ...timestamps,
}, (t) => [uniqueIndex("membership_tenant_user_uq").on(t.tenantId, t.userId), index("membership_tenant_idx").on(t.tenantId)]);

export const passwordCredentials = sqliteTable("password_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(), passwordSalt: text("password_salt").notNull(),
  iterations: integer("iterations").notNull(), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(), tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(), createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [uniqueIndex("auth_sessions_token_uq").on(t.tokenHash), index("auth_sessions_user_idx").on(t.userId)]);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  ownerId: text("owner_id").notNull().references(() => users.id), name: text("name").notNull(),
  prefix: text("prefix").notNull(), secretHash: text("secret_hash").notNull(), scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }), lastUsedAt: integer("last_used_at", { mode: "timestamp" }), revokedAt: integer("revoked_at", { mode: "timestamp" }), ...timestamps,
}, (t) => [index("api_keys_tenant_idx").on(t.tenantId), uniqueIndex("api_keys_hash_uq").on(t.secretHash)]);

export const models = sqliteTable("models", {
  id: text("id").primaryKey(), provider: text("provider").notNull(), upstreamModel: text("upstream_model").notNull(),
  displayName: text("display_name").notNull(), capabilities: text("capabilities", { mode: "json" }).$type<string[]>().notNull(),
  status: text("status", { enum: ["active", "maintenance", "disabled"] }).notNull(), ...timestamps,
}, (t) => [uniqueIndex("models_provider_name_uq").on(t.provider, t.upstreamModel)]);

export const tenantModelGrants = sqliteTable("tenant_model_grants", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), modelId: text("model_id").notNull().references(() => models.id),
  requestsPerMinute: integer("requests_per_minute").notNull().default(60), monthlyTokenLimit: integer("monthly_token_limit"), ...timestamps,
}, (t) => [uniqueIndex("tenant_model_grant_uq").on(t.tenantId, t.modelId), index("model_grants_tenant_idx").on(t.tenantId)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), actorId: text("actor_id"),
  action: text("action").notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id"),
  ipHash: text("ip_hash"), metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(), createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [index("audit_tenant_time_idx").on(t.tenantId, t.createdAt)]);

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").references(() => tenants.id), name: text("name").notNull(),
  version: text("version").notNull(), objectKey: text("object_key").notNull(), sha256: text("sha256").notNull(),
  visibility: text("visibility", { enum: ["public", "tenant", "internal"] }).notNull(), ...timestamps,
}, (t) => [index("releases_tenant_idx").on(t.tenantId)]);

export const llmConfigs = sqliteTable("llm_configs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  displayName: text("display_name").notNull(), provider: text("provider").notNull(), modelId: text("model_id").notNull(),
  baseUrl: text("base_url").notNull(), secretRef: text("secret_ref").notNull(),
  status: text("status", { enum: ["active", "maintenance", "disabled"] }).notNull().default("active"),
  requestsPerMinute: integer("requests_per_minute").notNull().default(60), ...timestamps,
}, (t) => [index("llm_configs_tenant_idx").on(t.tenantId)]);

export const agentArtifacts = sqliteTable("agent_artifacts", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  fileName: text("file_name").notNull(), label: text("label").notNull(),
  format: text("format", { enum: ["NSIS", "MSI"] }).notNull(), objectKey: text("object_key").notNull(),
  sizeBytes: integer("size_bytes").notNull(), sha256: text("sha256").notNull(),
  status: text("status", { enum: ["ready", "archived"] }).notNull().default("ready"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [index("agent_artifacts_tenant_idx").on(t.tenantId), uniqueIndex("agent_artifacts_object_key_uq").on(t.objectKey)]);

export const releaseVersions = sqliteTable("release_versions", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  version: text("version").notNull(), channel: text("channel", { enum: ["stable", "beta", "internal"] }).notNull(),
  artifactId: text("artifact_id").notNull().references(() => agentArtifacts.id), notes: text("notes").notNull(),
  mandatory: integer("mandatory", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  publishedAt: integer("published_at", { mode: "timestamp" }), ...timestamps,
}, (t) => [index("release_versions_tenant_idx").on(t.tenantId), uniqueIndex("release_versions_tenant_version_uq").on(t.tenantId, t.version, t.channel)]);

export const billingPlans = sqliteTable("billing_plans", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(), monthlyPriceCents: integer("monthly_price_cents").notNull(),
  currency: text("currency", { enum: ["CNY", "USD"] }).notNull().default("CNY"),
  requestLimit: integer("request_limit").notNull(), seatLimit: integer("seat_limit").notNull(),
  features: text("features", { mode: "json" }).$type<string[]>().notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"), ...timestamps,
}, (t) => [index("billing_plans_tenant_idx").on(t.tenantId)]);

export const gatewayRequests = sqliteTable("gateway_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id),
  modelConfigId: text("model_config_id").references(() => llmConfigs.id),
  endpoint: text("endpoint", { enum: ["chat.completions", "responses"] }).notNull(),
  statusCode: integer("status_code").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  errorCode: text("error_code"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("gateway_requests_tenant_time_idx").on(t.tenantId, t.createdAt),
  index("gateway_requests_key_time_idx").on(t.apiKeyId, t.createdAt),
]);

export const authLoginAttempts = sqliteTable("auth_login_attempts", {
  keyHash: text("key_hash").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  firstFailedAt: integer("first_failed_at").notNull(),
  blockedUntil: integer("blocked_until"),
  updatedAt: integer("updated_at").notNull(),
});
