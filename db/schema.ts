import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

const epoch = (name: string) => bigint(name, { mode: "number" });
const timestamps = {
  createdAt: epoch("created_at").notNull(),
  updatedAt: epoch("updated_at").notNull(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username"),
  email: text("email"),
  phoneE164: text("phone_e164"),
  accountLocale: text("account_locale", { enum: ["zh", "en"] }).notNull().default("zh"),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  status: text("status", { enum: ["invited", "active", "disabled"] }).notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  lastLoginAt: epoch("last_login_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("users_username_uq").on(table.username),
  uniqueIndex("users_username_ci_uq").on(sql`lower(${table.username})`).where(sql`${table.username} IS NOT NULL`),
  uniqueIndex("users_email_uq").on(table.email),
  uniqueIndex("users_phone_uq").on(table.phoneE164),
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
  expiresAt: epoch("expires_at").notNull(),
  createdAt: epoch("created_at").notNull(),
}, (table) => [
  uniqueIndex("auth_sessions_token_uq").on(table.tokenHash),
  index("auth_sessions_user_idx").on(table.userId),
]);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  ipHash: text("ip_hash"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: epoch("created_at").notNull(),
}, (table) => [index("audit_time_idx").on(table.createdAt)]);

export const releases = pgTable("releases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  visibility: text("visibility", { enum: ["public", "internal"] }).notNull(),
  ...timestamps,
});

export const agentArtifacts = pgTable("agent_artifacts", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  label: text("label").notNull(),
  format: text("format", { enum: ["NSIS"] }).notNull(),
  objectKey: text("object_key").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  updaterSignature: text("updater_signature"),
  signatureVerifiedAt: epoch("signature_verified_at"),
  signatureKeyId: text("signature_key_id"),
  embeddedVersion: text("embedded_version"),
  productName: text("product_name"),
  versionSource: text("version_source"),
  platform: text("platform").notNull().default("windows"),
  architecture: text("architecture").notNull().default("x86_64"),
  status: text("status", { enum: ["ready", "archived"] }).notNull().default("ready"),
  createdAt: epoch("created_at").notNull(),
}, (table) => [
  uniqueIndex("agent_artifacts_object_key_uq").on(table.objectKey),
  uniqueIndex("agent_artifacts_embedded_version_uq").on(table.embeddedVersion),
]);

export const artifactCleanupQueue = pgTable("artifact_cleanup_queue", {
  objectKey: text("object_key").primaryKey(),
  createdAt: epoch("created_at").notNull(),
});

export const releaseVersions = pgTable("release_versions", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  channel: text("channel", { enum: ["stable", "beta", "internal"] }).notNull(),
  artifactId: text("artifact_id").notNull().references(() => agentArtifacts.id),
  notes: text("notes").notNull(),
  mandatory: boolean("mandatory").notNull().default(false),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  publishedAt: epoch("published_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("release_versions_version_uq").on(table.version, table.channel),
  uniqueIndex("release_versions_one_published_channel_uq").on(table.channel).where(sql`${table.status} = 'published'`),
]);

export const releaseSettings = pgTable("release_settings", {
  id: text("id").primaryKey().default("global"),
  updaterPublicKey: text("updater_public_key").notNull(),
  updaterPublicKeyId: text("updater_public_key_id").notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const billingPlans = pgTable("billing_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  currency: text("currency", { enum: ["CNY", "USD"] }).notNull().default("CNY"),
  features: jsonb("features").$type<string[]>().notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  ...timestamps,
});

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
  provider: text("provider", { enum: ["google", "github"] }).notNull().default("google"),
  locale: text("locale", { enum: ["zh", "en"] }).notNull().default("en"),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  returnPath: text("return_path").notNull().default("/console"),
  intent: text("intent", { enum: ["login", "link"] }).notNull().default("login"),
  linkUserId: text("link_user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: epoch("expires_at").notNull(),
  consumedAt: epoch("consumed_at"),
  createdAt: epoch("created_at").notNull(),
});

export const desktopAuthRequests = pgTable("desktop_auth_requests", {
  id: text("id").primaryKey(),
  deviceCodeHash: text("device_code_hash").notNull(),
  userCodeHash: text("user_code_hash").notNull(),
  sourceHash: text("source_hash").notNull(),
  deviceName: text("device_name").notNull(),
  clientVersion: text("client_version").notNull(),
  requestedScopes: jsonb("requested_scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  approvedScopes: jsonb("approved_scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: text("status", { enum: ["pending", "approved", "denied"] }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: epoch("expires_at").notNull(),
  approvedAt: epoch("approved_at"),
  consumedAt: epoch("consumed_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("desktop_auth_device_code_uq").on(table.deviceCodeHash),
  uniqueIndex("desktop_auth_user_code_uq").on(table.userCodeHash),
  index("desktop_auth_source_time_idx").on(table.sourceHash, table.createdAt),
]);

export const desktopSessions = pgTable("desktop_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  clientVersion: text("client_version").notNull(),
  grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  permissionsUpdatedAt: epoch("permissions_updated_at").notNull().default(0),
  expiresAt: epoch("expires_at").notNull(),
  revokedAt: epoch("revoked_at"),
  lastUsedAt: epoch("last_used_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("desktop_sessions_token_uq").on(table.tokenHash),
  index("desktop_sessions_user_idx").on(table.userId),
]);

export const agentCommunityPolicy = pgTable("agent_community_policy", {
  id: text("id").primaryKey().default("global"),
  enabled: boolean("enabled").notNull().default(false),
  writesEnabled: boolean("writes_enabled").notNull().default(false),
  allowForumRead: boolean("allow_forum_read").notNull().default(false),
  allowForumTopicCreate: boolean("allow_forum_topic_create").notNull().default(false),
  allowForumReplyCreate: boolean("allow_forum_reply_create").notNull().default(false),
  allowBlogDraftCreate: boolean("allow_blog_draft_create").notNull().default(false),
  allowBlogPublish: boolean("allow_blog_publish").notNull().default(false),
  forumTopicsPerHour: integer("forum_topics_per_hour").notNull().default(3),
  forumRepliesPerHour: integer("forum_replies_per_hour").notNull().default(15),
  blogDraftsPerDay: integer("blog_drafts_per_day").notNull().default(3),
  blogPublishesPerDay: integer("blog_publishes_per_day").notNull().default(1),
  policyVersion: integer("policy_version").notNull().default(1),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const userAgentCommunitySettings = pgTable("user_agent_community_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  allowForumRead: boolean("allow_forum_read").notNull().default(false),
  allowForumTopicCreate: boolean("allow_forum_topic_create").notNull().default(false),
  allowForumReplyCreate: boolean("allow_forum_reply_create").notNull().default(false),
  allowBlogDraftCreate: boolean("allow_blog_draft_create").notNull().default(false),
  allowBlogPublish: boolean("allow_blog_publish").notNull().default(false),
  updatedAt: epoch("updated_at").notNull(),
});

export const agentCommunityActions = pgTable("agent_community_actions", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  desktopSessionId: text("desktop_session_id").notNull().references(() => desktopSessions.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  idempotencyKeyHash: text("idempotency_key_hash").notNull(),
  requestDigest: text("request_digest").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  status: text("status", { enum: ["accepted", "completed", "rejected", "failed"] }).notNull(),
  reasonCode: text("reason_code"),
  response: jsonb("response").$type<Record<string, unknown>>(),
  createdAt: epoch("created_at").notNull(),
  completedAt: epoch("completed_at"),
}, (table) => [
  uniqueIndex("agent_community_actions_session_key_uq").on(table.desktopSessionId, table.idempotencyKeyHash),
  index("agent_community_actions_user_time_idx").on(table.userId, table.createdAt),
  index("agent_community_actions_session_time_idx").on(table.desktopSessionId, table.createdAt),
]);

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
  id: text("id").primaryKey().default("global"),
  encryptionContext: text("encryption_context").notNull().default("global"),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  aliyunSignName: text("aliyun_sign_name"),
  aliyunTemplateCode: text("aliyun_template_code"),
  aliyunTemplateCodeKey: text("aliyun_template_code_key").notNull().default("code"),
  aliyunAccessKeyId: text("aliyun_access_key_id"),
  aliyunAccessKeySecretEncrypted: text("aliyun_access_key_secret_encrypted"),
  smsCodePepperEncrypted: text("sms_code_pepper_encrypted"),
  googleEnabled: boolean("google_enabled").notNull().default(false),
  googleClientIdRef: text("google_client_id_ref").notNull().default("GOOGLE_OAUTH_CLIENT_ID"),
  googleClientSecretRef: text("google_client_secret_ref").notNull().default("GOOGLE_OAUTH_CLIENT_SECRET"),
  googleAllowedHostedDomain: text("google_allowed_hosted_domain"),
  githubEnabled: boolean("github_enabled").notNull().default(false),
  githubClientIdRef: text("github_client_id_ref").notNull().default("GITHUB_OAUTH_CLIENT_ID"),
  githubClientSecretRef: text("github_client_secret_ref").notNull().default("GITHUB_OAUTH_CLIENT_SECRET"),
  ...timestamps,
});

export const forumTopics = pgTable("forum_topics", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body").notNull(),
  category: text("category", { enum: ["general", "hardware", "firmware", "agents"] }).notNull().default("general"),
  status: text("status", { enum: ["open", "locked", "hidden"] }).notNull().default("open"),
  pinned: boolean("pinned").notNull().default(false),
  createdVia: text("created_via", { enum: ["web", "eval_agent"] }).notNull().default("web"),
  desktopSessionId: text("desktop_session_id").references(() => desktopSessions.id, { onDelete: "set null" }),
  lastActivityAt: epoch("last_activity_at").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("forum_topics_slug_uq").on(table.slug),
  index("forum_topics_activity_idx").on(table.lastActivityAt),
  index("forum_topics_author_time_idx").on(table.authorId, table.createdAt),
  index("forum_topics_agent_time_idx").on(table.createdVia, table.createdAt),
]);

export const forumReplies = pgTable("forum_replies", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull().references(() => forumTopics.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  status: text("status", { enum: ["visible", "hidden"] }).notNull().default("visible"),
  createdVia: text("created_via", { enum: ["web", "eval_agent"] }).notNull().default("web"),
  desktopSessionId: text("desktop_session_id").references(() => desktopSessions.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  index("forum_replies_topic_time_idx").on(table.topicId, table.createdAt),
  index("forum_replies_author_time_idx").on(table.authorId, table.createdAt),
  index("forum_replies_agent_time_idx").on(table.createdVia, table.createdAt),
]);

export const blogPosts = pgTable("blog_posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  publishedAt: epoch("published_at"),
  createdVia: text("created_via", { enum: ["web", "eval_agent"] }).notNull().default("web"),
  desktopSessionId: text("desktop_session_id").references(() => desktopSessions.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("blog_posts_slug_uq").on(table.slug),
  index("blog_posts_status_time_idx").on(table.status, table.publishedAt),
  index("blog_posts_agent_time_idx").on(table.createdVia, table.createdAt),
]);
