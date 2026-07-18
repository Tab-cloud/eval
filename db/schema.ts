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
