import type { AuthenticatedUser } from "../auth/core";

export const communityScopes = [
  "community.forum.read",
  "community.forum.topic.create",
  "community.forum.reply.create",
  "community.blog.draft.create",
  "community.blog.publish",
] as const;

export type CommunityScope = typeof communityScopes[number];

export const communityScopeLabels: Record<CommunityScope, string> = {
  "community.forum.read": "读取和总结论坛",
  "community.forum.topic.create": "创建论坛主题",
  "community.forum.reply.create": "回复论坛主题",
  "community.blog.draft.create": "创建和更新博客草稿",
  "community.blog.publish": "自动发布博客",
};

export function sanitizeCommunityScopes(value: unknown): CommunityScope[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<CommunityScope>(communityScopes);
  return [...new Set(value.filter((item): item is CommunityScope => typeof item === "string" && allowed.has(item as CommunityScope)))];
}
export function roleAllowsCommunityScope(role: AuthenticatedUser["role"], scope: CommunityScope) {
  return scope !== "community.blog.publish" || role === "admin";
}

export function isCommunityWriteScope(scope: CommunityScope) {
  return scope !== "community.forum.read";
}

export function scopeFlag(scope: CommunityScope) {
  return ({
    "community.forum.read": "allowForumRead",
    "community.forum.topic.create": "allowForumTopicCreate",
    "community.forum.reply.create": "allowForumReplyCreate",
    "community.blog.draft.create": "allowBlogDraftCreate",
    "community.blog.publish": "allowBlogPublish",
  } as const)[scope];
}
