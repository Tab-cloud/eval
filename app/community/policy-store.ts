import { authDatabase, type AuthenticatedUser } from "../auth/core";
import { communityScopes, isCommunityWriteScope, roleAllowsCommunityScope, sanitizeCommunityScopes, scopeFlag, type CommunityScope } from "./permissions";
import { ensureAgentCommunitySchema } from "./schema";

export type AgentCommunityPolicy = {
  enabled: boolean;
  writesEnabled: boolean;
  allowForumRead: boolean;
  allowForumTopicCreate: boolean;
  allowForumReplyCreate: boolean;
  allowBlogDraftCreate: boolean;
  allowBlogPublish: boolean;
  forumTopicsPerHour: number;
  forumRepliesPerHour: number;
  blogDraftsPerDay: number;
  blogPublishesPerDay: number;
  policyVersion: number;
  updatedAt: number;
};

export type UserCommunitySettings = {
  enabled: boolean;
  allowForumRead: boolean;
  allowForumTopicCreate: boolean;
  allowForumReplyCreate: boolean;
  allowBlogDraftCreate: boolean;
  allowBlogPublish: boolean;
  updatedAt: number;
};

export type AgentCommunityContext = {
  user: AuthenticatedUser;
  session: {
    id: string;
    deviceName: string;
    clientVersion: string;
    grantedScopes: CommunityScope[];
  };
};

export class CommunityAuthorizationError extends Error {
  constructor(readonly code: "site_policy_denied" | "user_consent_denied" | "role_denied" | "scope_denied", message: string) {
    super(message);
    this.name = "CommunityAuthorizationError";
  }
}

export async function globalAgentCommunityPolicy(): Promise<AgentCommunityPolicy> {
  await ensureAgentCommunitySchema();
  const row = await authDatabase().prepare(`SELECT enabled, writes_enabled, allow_forum_read,
    allow_forum_topic_create, allow_forum_reply_create, allow_blog_draft_create, allow_blog_publish,
    forum_topics_per_hour, forum_replies_per_hour, blog_drafts_per_day, blog_publishes_per_day,
    policy_version, updated_at FROM agent_community_policy WHERE id = 'global' LIMIT 1`).first<Record<string, unknown>>();
  return mapPolicy(row ?? {});
}

export async function userAgentCommunitySettings(userId: string): Promise<UserCommunitySettings> {
  await ensureAgentCommunitySchema();
  const row = await authDatabase().prepare(`SELECT enabled, allow_forum_read, allow_forum_topic_create,
    allow_forum_reply_create, allow_blog_draft_create, allow_blog_publish, updated_at
    FROM user_agent_community_settings WHERE user_id = ? LIMIT 1`).bind(userId).first<Record<string, unknown>>();
  return mapUserSettings(row ?? {});
}

export async function approvableCommunityScopes(user: AuthenticatedUser) {
  const [policy, settings] = await Promise.all([globalAgentCommunityPolicy(), userAgentCommunitySettings(user.id)]);
  return communityScopes.filter(scope => policyAllows(policy, scope) && userAllows(settings, scope) && roleAllowsCommunityScope(user.role, scope));
}

export async function effectiveCommunityCapabilities(context: AgentCommunityContext) {
  const [policy, settings] = await Promise.all([globalAgentCommunityPolicy(), userAgentCommunitySettings(context.user.id)]);
  const granted = new Set(context.session.grantedScopes);
  const scopes = communityScopes.filter(scope => granted.has(scope) && policyAllows(policy, scope) && userAllows(settings, scope) && roleAllowsCommunityScope(context.user.role, scope));
  return {
    enabled: scopes.length > 0,
    scopes,
    limits: {
      forumTopicsPerHour: scopes.includes("community.forum.topic.create") ? policy.forumTopicsPerHour : 0,
      forumRepliesPerHour: scopes.includes("community.forum.reply.create") ? policy.forumRepliesPerHour : 0,
      blogDraftsPerDay: scopes.includes("community.blog.draft.create") ? policy.blogDraftsPerDay : 0,
      blogPublishesPerDay: scopes.includes("community.blog.publish") ? policy.blogPublishesPerDay : 0,
    },
    identity: {
      userId: context.user.id,
      displayName: context.user.displayName,
      deviceSessionId: context.session.id,
    },
    policyVersion: policy.policyVersion,
  };
}

export async function requireCommunityScope(context: AgentCommunityContext, scope: CommunityScope) {
  const [policy, settings] = await Promise.all([globalAgentCommunityPolicy(), userAgentCommunitySettings(context.user.id)]);
  if (!policyAllows(policy, scope)) throw new CommunityAuthorizationError("site_policy_denied", "管理员尚未允许此项 Eval 自动化能力。");
  if (!userAllows(settings, scope)) throw new CommunityAuthorizationError("user_consent_denied", "当前账号尚未开启此项 Eval 自动化能力。");
  if (!roleAllowsCommunityScope(context.user.role, scope)) throw new CommunityAuthorizationError("role_denied", "当前账号角色不允许执行此操作。");
  if (!context.session.grantedScopes.includes(scope)) throw new CommunityAuthorizationError("scope_denied", "当前设备未获得此项 Eval 自动化权限。");
  return policy;
}

export async function saveUserAgentCommunitySettings(user: AuthenticatedUser, input: Record<string, unknown>) {
  await ensureAgentCommunitySchema();
  const now = epochSeconds();
  const settings = {
    enabled: input.enabled === true,
    allowForumRead: input.allowForumRead === true,
    allowForumTopicCreate: input.allowForumTopicCreate === true,
    allowForumReplyCreate: input.allowForumReplyCreate === true,
    allowBlogDraftCreate: input.allowBlogDraftCreate === true,
    allowBlogPublish: user.role === "admin" && input.allowBlogPublish === true,
  };
  const db = authDatabase();
  await db.batch([
    db.prepare(`INSERT INTO user_agent_community_settings (user_id, enabled, allow_forum_read,
      allow_forum_topic_create, allow_forum_reply_create, allow_blog_draft_create, allow_blog_publish, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET enabled=excluded.enabled, allow_forum_read=excluded.allow_forum_read,
      allow_forum_topic_create=excluded.allow_forum_topic_create, allow_forum_reply_create=excluded.allow_forum_reply_create,
      allow_blog_draft_create=excluded.allow_blog_draft_create, allow_blog_publish=excluded.allow_blog_publish, updated_at=excluded.updated_at`)
      .bind(user.id, settings.enabled, settings.allowForumRead, settings.allowForumTopicCreate, settings.allowForumReplyCreate, settings.allowBlogDraftCreate, settings.allowBlogPublish, now),
    db.prepare(`INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
      VALUES (?, ?, 'agent.community.settings.save', 'user', ?, ?, ?)`)
      .bind(`audit_${crypto.randomUUID()}`, user.id, user.id, JSON.stringify(settings), now),
  ]);
  return userSettingsSnapshot(user);
}

export async function userSettingsSnapshot(user: AuthenticatedUser) {
  await ensureAgentCommunitySchema();
  const db = authDatabase();
  const [policy, settings, devices, actions] = await Promise.all([
    globalAgentCommunityPolicy(),
    userAgentCommunitySettings(user.id),
    db.prepare(`SELECT id, device_name AS "deviceName", client_version AS "clientVersion", granted_scopes AS "grantedScopes",
      permissions_updated_at AS "permissionsUpdatedAt", last_used_at AS "lastUsedAt", expires_at AS "expiresAt"
      FROM desktop_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_used_at DESC NULLS LAST`)
      .bind(user.id, epochSeconds()).all<Record<string, unknown>>(),
    db.prepare(`SELECT request_id AS "requestId", action, resource_type AS "resourceType", resource_id AS "resourceId",
      status, reason_code AS "reasonCode", created_at AS "createdAt" FROM agent_community_actions
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(user.id).all<Record<string, unknown>>(),
  ]);
  const roleScopes = communityScopes.filter(scope => roleAllowsCommunityScope(user.role, scope));
  return {
    settings,
    policy,
    roleScopes,
    effectiveUserScopes: communityScopes.filter(scope => policyAllows(policy, scope) && userAllows(settings, scope) && roleAllowsCommunityScope(user.role, scope)),
    devices: devices.results.map(item => ({ ...item, grantedScopes: sanitizeCommunityScopes(item.grantedScopes) })),
    recentActions: actions.results,
  };
}

export async function updateAgentCommunityDevice(user: AuthenticatedUser, sessionId: string, input: Record<string, unknown>) {
  await ensureAgentCommunitySchema();
  const requested = sanitizeCommunityScopes(input.grantedScopes);
  const allowed = new Set(await approvableCommunityScopes(user));
  const granted = requested.filter(scope => allowed.has(scope));
  const now = epochSeconds();
  const db = authDatabase();
  const result = await db.prepare(`UPDATE desktop_sessions SET granted_scopes = ?, permissions_updated_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?`)
    .bind(JSON.stringify(granted), now, now, sessionId, user.id, now).run();
  if (!result.meta.changes) return null;
  await db.prepare(`INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
    VALUES (?, ?, 'agent.community.device.permissions', 'desktop_session', ?, ?, ?)`)
    .bind(`audit_${crypto.randomUUID()}`, user.id, sessionId, JSON.stringify({ grantedScopes: granted }), now).run();
  return { id: sessionId, grantedScopes: granted, permissionsUpdatedAt: now };
}

export async function revokeAgentCommunityDevice(user: AuthenticatedUser, sessionId: string) {
  await ensureAgentCommunitySchema();
  const now = epochSeconds();
  const db = authDatabase();
  const result = await db.prepare("UPDATE desktop_sessions SET revoked_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .bind(now, now, sessionId, user.id).run();
  if (!result.meta.changes) return false;
  await db.prepare(`INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
    VALUES (?, ?, 'desktop.session.revoke', 'desktop_session', ?, '{}', ?)`)
    .bind(`audit_${crypto.randomUUID()}`, user.id, sessionId, now).run();
  return true;
}

export async function saveGlobalAgentCommunityPolicy(admin: AuthenticatedUser, input: Record<string, unknown>) {
  await ensureAgentCommunitySchema();
  if (admin.role !== "admin") throw new Error("仅管理员可以修改 Eval 自动化策略。");
  const now = epochSeconds();
  const values = {
    enabled: input.enabled === true,
    writesEnabled: input.writesEnabled === true,
    allowForumRead: input.allowForumRead === true,
    allowForumTopicCreate: input.allowForumTopicCreate === true,
    allowForumReplyCreate: input.allowForumReplyCreate === true,
    allowBlogDraftCreate: input.allowBlogDraftCreate === true,
    allowBlogPublish: input.allowBlogPublish === true,
    forumTopicsPerHour: boundedInteger(input.forumTopicsPerHour, 3, 0, 20),
    forumRepliesPerHour: boundedInteger(input.forumRepliesPerHour, 15, 0, 100),
    blogDraftsPerDay: boundedInteger(input.blogDraftsPerDay, 3, 0, 20),
    blogPublishesPerDay: boundedInteger(input.blogPublishesPerDay, 1, 0, 10),
  };
  const db = authDatabase();
  await db.batch([
    db.prepare(`UPDATE agent_community_policy SET enabled=?, writes_enabled=?, allow_forum_read=?,
      allow_forum_topic_create=?, allow_forum_reply_create=?, allow_blog_draft_create=?, allow_blog_publish=?,
      forum_topics_per_hour=?, forum_replies_per_hour=?, blog_drafts_per_day=?, blog_publishes_per_day=?,
      policy_version=policy_version+1, updated_by=?, updated_at=? WHERE id='global'`)
      .bind(values.enabled, values.writesEnabled, values.allowForumRead, values.allowForumTopicCreate, values.allowForumReplyCreate,
        values.allowBlogDraftCreate, values.allowBlogPublish, values.forumTopicsPerHour, values.forumRepliesPerHour,
        values.blogDraftsPerDay, values.blogPublishesPerDay, admin.id, now),
    db.prepare(`INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
      VALUES (?, ?, 'agent.community.policy.save', 'agent_community_policy', 'global', ?, ?)`)
      .bind(`audit_${crypto.randomUUID()}`, admin.id, JSON.stringify(values), now),
  ]);
  return globalAgentCommunityPolicy();
}

export async function disableAgentCommunityWrites(admin: AuthenticatedUser) {
  await ensureAgentCommunitySchema();
  if (admin.role !== "admin") throw new Error("仅管理员可以停止 Eval 自动写入。");
  const now = epochSeconds();
  const db = authDatabase();
  await db.batch([
    db.prepare("UPDATE agent_community_policy SET writes_enabled=false, policy_version=policy_version+1, updated_by=?, updated_at=? WHERE id='global'").bind(admin.id, now),
    db.prepare(`INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, metadata, created_at)
      VALUES (?, ?, 'agent.community.writes.disable', 'agent_community_policy', 'global', '{}', ?)`)
      .bind(`audit_${crypto.randomUUID()}`, admin.id, now),
  ]);
  return globalAgentCommunityPolicy();
}

function policyAllows(policy: AgentCommunityPolicy, scope: CommunityScope) {
  return policy.enabled && (!isCommunityWriteScope(scope) || policy.writesEnabled) && Boolean(policy[scopeFlag(scope)]);
}

function userAllows(settings: UserCommunitySettings, scope: CommunityScope) {
  return settings.enabled && Boolean(settings[scopeFlag(scope)]);
}

function mapPolicy(row: Record<string, unknown>): AgentCommunityPolicy {
  return {
    enabled: Boolean(row.enabled),
    writesEnabled: Boolean(row.writes_enabled),
    allowForumRead: Boolean(row.allow_forum_read),
    allowForumTopicCreate: Boolean(row.allow_forum_topic_create),
    allowForumReplyCreate: Boolean(row.allow_forum_reply_create),
    allowBlogDraftCreate: Boolean(row.allow_blog_draft_create),
    allowBlogPublish: Boolean(row.allow_blog_publish),
    forumTopicsPerHour: Number(row.forum_topics_per_hour ?? 3),
    forumRepliesPerHour: Number(row.forum_replies_per_hour ?? 15),
    blogDraftsPerDay: Number(row.blog_drafts_per_day ?? 3),
    blogPublishesPerDay: Number(row.blog_publishes_per_day ?? 1),
    policyVersion: Number(row.policy_version ?? 1),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

function mapUserSettings(row: Record<string, unknown>): UserCommunitySettings {
  return {
    enabled: Boolean(row.enabled),
    allowForumRead: Boolean(row.allow_forum_read),
    allowForumTopicCreate: Boolean(row.allow_forum_topic_create),
    allowForumReplyCreate: Boolean(row.allow_forum_reply_create),
    allowBlogDraftCreate: Boolean(row.allow_blog_draft_create),
    allowBlogPublish: Boolean(row.allow_blog_publish),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
}

function epochSeconds() { return Math.floor(Date.now() / 1000); }
