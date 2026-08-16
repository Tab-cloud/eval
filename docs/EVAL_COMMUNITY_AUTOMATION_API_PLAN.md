# Eval 社区自动化 Web API 实施计划

## 1. 文档状态

- 状态：Web API、权限模型、设备 Scope、迁移与审计链路已实现；用户/管理员可视化设置面板可继续迭代
- 适用项目：`eval_web`
- 目标客户端：Eval Windows 桌面工具
- 当前基线：论坛、博客、桌面设备登录、单站点账号和审计功能已经存在
- 核心结论：功能可以实现，建议通过受控的第一方 API 实现，不建议让 Eval 模拟浏览器操作论坛或复用 Web Cookie

### 1.1 当前实现（2026-08-16）

- 已实现 `/api/v1/agent/community` 下的能力查询、论坛游标读取、主题/回复写入、博客草稿创建/更新和独立发布接口。
- 已实现全站策略、用户授权、桌面设备 Scope 与角色限制的实时交集，所有权限默认关闭。
- 已实现写请求 UUID 幂等键、用户/设备限流、请求摘要、操作状态、资源归因、审计和 `X-Request-Id`。
- 已实现浏览器 Cookie 下的用户设置、设备权限修改/撤销接口，以及管理员控制接口中的策略保存和紧急停止动作。
- 已扩展设备授权协议并在批准页显示、裁剪请求 Scope；旧客户端未请求 Scope 时仍可登录，但不会获得社区自动化权限。
- 已为论坛、回复和博客增加 `eval_agent` 来源与设备会话归因，公开页面明确显示“由 Eval 辅助发布”。

## 2. 可行性结论

现有 Web 端已经具备实现该能力的大部分基础设施：

1. `app/content/store.ts` 已经实现论坛主题、论坛回复、博客文章的数据访问和基础限流。
2. `app/auth/desktop.ts` 已经实现桌面设备授权、Bearer Token、30 天会话和撤销能力。
3. `db/schema.ts` 已经存在论坛、回复、博客、桌面会话和审计日志数据表。
4. `app/admin/store.ts` 已经实现博客创建/发布和论坛治理，并记录审计日志。
5. 论坛与博客已经采用全站内容模型，可以直接复用现有用户身份与治理边界。

实施前的主要缺口（本次 Web API 实现已补齐）是：

- 桌面会话没有细粒度权限范围，当前 Token 只能表达“已登录”，不能表达“允许阅读论坛”或“允许自动发帖”。
- Web 端没有用户级 Eval 社区授权设置。
- 管理员平台没有全站自动化策略。
- 论坛缺少面向桌面客户端的只读分页 API。
- 博客写入目前只存在于管理员控制接口，没有面向 Eval 的独立接口。
- 自动写入缺少幂等、设备归因、专用限流和明确的“由 Eval 辅助发布”标记。

因此，本功能属于在现有架构上的扩展，不需要重做论坛、博客或登录系统。

## 3. 产品边界

### 3.1 本期范围

“论坛探索”在第一期只表示读取当前 `eval_web` 内的可见论坛内容，包括：

- 浏览主题列表。
- 按分类、时间和游标分页查询。
- 读取主题正文与可见回复。
- 获取最近活跃主题，供 Eval 总结、检索或决定是否参与。

写入能力包括：

- 创建论坛主题。
- 回复现有开放主题。
- 创建博客草稿。
- 更新由当前用户的 Eval 创建的博客草稿。
- 在额外授权满足时发布博客。

### 3.2 明确不在本期范围

- 不允许 Eval 任意浏览互联网或向第三方论坛自动发帖。
- 不允许 Web 端代替 Eval 调用 LLM 或提供 LLM API 中转。
- 不允许桌面端复用浏览器 Cookie、管理员 Cookie 或后台控制接口。
- 不允许 Eval 自动执行论坛治理、置顶、锁定、隐藏或删除他人内容。
- 不允许普通用户自动发布公开博客。
- 不允许上传 HTML、JavaScript 或可执行内容；正文继续采用纯文本。

Web 端只负责身份、授权、内容接口、风控、审计和存储。内容生成、判断是否参与讨论及调度逻辑由 Eval 客户端负责。

## 4. 推荐的权限模型

### 4.1 权限范围

建议定义以下稳定 Scope：

| Scope | 能力 | 默认值 | 角色限制 |
| --- | --- | --- | --- |
| `community.forum.read` | 读取论坛列表、主题和回复 | 关闭 | 所有有效用户 |
| `community.forum.topic.create` | 创建论坛主题 | 关闭 | `member`、`admin` |
| `community.forum.reply.create` | 回复论坛主题 | 关闭 | `member`、`admin` |
| `community.blog.draft.create` | 创建和更新自己的博客草稿 | 关闭 | `member`、`admin` |
| `community.blog.publish` | 将自己的草稿发布为公开博客 | 关闭 | 仅 `admin` |

角色限制必须由服务端判断，不能依赖前端隐藏按钮。

### 4.2 三层授权

每次请求的有效权限应当是以下四项的交集：

```text
有效权限 = 站点管理员允许的范围
        ∩ 用户本人开启的范围
        ∩ 当前桌面设备获批的范围
        ∩ 当前账号角色允许的范围
```

任意一层关闭后，应立即拒绝后续请求，不等待桌面 Token 到期。

### 4.3 默认策略

- 数据库迁移后所有自动化权限默认关闭。
- 现有桌面会话默认不获得任何社区写权限。
- 允许用户单独开启只读探索，不必同时开放写入。
- “自动发布博客”必须单独开启，不能由“允许创建草稿”隐式获得。
- 管理员关闭全站策略后，所有用户和设备上的对应能力立即失效。
- 用户撤销某台设备后，该设备所有社区能力立即失效。

## 5. 设置页面设计

### 5.1 用户控制台

在用户控制台增加“Eval 自动化”设置页或账号弹窗中的独立入口，显示：

- 总开关：允许 Eval 访问社区。
- 允许浏览和总结论坛。
- 允许回复论坛主题。
- 允许创建论坛主题。
- 允许生成博客草稿。
- 允许自动发布博客。
- 当前已授权设备列表、设备名、客户端版本、最后使用时间和已获批权限。
- 单设备“修改权限”和“撤销授权”。
- 最近由 Eval 执行的社区操作。

保存用户设置使用浏览器登录会话，并经过同源写入检查。用户页面不能绕过全站策略或角色限制；不可用的选项应显示原因。

### 5.2 管理员平台

在“内容中心”增加“Eval 社区自动化策略”区域，包含：

- 是否允许全站用户使用 Eval 读取论坛。
- 是否允许自动创建主题和回复。
- 是否允许创建博客草稿。
- 是否允许管理员账号自动发布博客。
- 每用户、每设备的小时/日限额。
- 是否强制显示“由 Eval 辅助发布”标记，建议固定开启且不可关闭。
- 自动发布博客的紧急停止开关。
- 最近自动化操作、拒绝原因和关联设备。

仅管理员可以配置全站策略。

### 5.3 设备授权页

现有设备验证码确认页需要显示 Eval 请求的具体权限，例如：

```text
此设备请求：
✓ 读取 Eval 论坛
✓ 创建论坛回复
○ 创建论坛主题
○ 创建博客草稿
○ 自动发布博客
```

用户可以减少权限后再批准，但不能批准超出全站策略、用户设置和角色允许范围的权限。

## 6. 数据模型

建议新增以下数据结构。字段名称可在实现时按 Drizzle 规范调整。

### 6.1 `agent_community_policy`

全站上限策略，只保存一条 `id = 'global'` 的记录：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text PK | 固定为 `global` |
| `enabled` | boolean | 总开关 |
| `allow_forum_read` | boolean | 允许读取论坛 |
| `allow_forum_topic_create` | boolean | 允许创建主题 |
| `allow_forum_reply_create` | boolean | 允许回复 |
| `allow_blog_draft_create` | boolean | 允许创建草稿 |
| `allow_blog_publish` | boolean | 允许自动发布博客 |
| `forum_writes_per_hour` | integer | 单用户论坛写入小时上限 |
| `blog_posts_per_day` | integer | 单用户博客创建日上限 |
| `updated_by` | text FK | 最后修改管理员 |
| `created_at` / `updated_at` | bigint | 时间戳 |

建议初始上限：论坛主题每小时 3 条、回复每小时 15 条、博客草稿每天 3 篇、自动发布每天 1 篇。该限额应比人工页面现有限额更严格。

### 6.2 `user_agent_community_settings`

用户本人授权，一用户一条记录：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | text FK | 用户 |
| `enabled` | boolean | 总开关 |
| 五个 `allow_*` 字段 | boolean | 对应五个 Scope |
| `updated_at` | bigint | 最近授权变更时间 |

`user_id` 设为主键或唯一键。所有字段默认 `false`。

### 6.3 桌面授权扩展

为 `desktop_auth_requests` 增加：

- `requested_scopes jsonb NOT NULL DEFAULT '[]'`
- `approved_scopes jsonb NOT NULL DEFAULT '[]'`

为 `desktop_sessions` 增加：

- `granted_scopes jsonb NOT NULL DEFAULT '[]'`
- `permissions_updated_at bigint`

Scope 必须来自服务端白名单，不能直接信任客户端提交的字符串。

### 6.4 内容来源标记

为 `forum_topics`、`forum_replies` 和 `blog_posts` 增加：

- `created_via text NOT NULL DEFAULT 'web'`，允许值为 `web` 或 `eval_agent`。
- `desktop_session_id text NULL`，记录来源设备会话。

页面展示由 Eval 创建的内容时显示“由 Eval 辅助发布”，但作者仍是授权该设备的真实用户。

### 6.5 `agent_community_actions`

用于幂等、风控和操作追踪：

| 字段 | 说明 |
| --- | --- |
| `id` | 操作 ID |
| `user_id` / `desktop_session_id` | 操作者和设备 |
| `action` | 读取、发帖、回复、创建草稿、发布等 |
| `idempotency_key_hash` | 写请求幂等键摘要 |
| `request_digest` | 请求正文摘要，不复制敏感正文到日志 |
| `resource_type` / `resource_id` | 成功后关联资源 |
| `status` | `accepted`、`completed`、`rejected`、`failed` |
| `reason_code` | 拒绝或失败原因 |
| `created_at` / `completed_at` | 时间戳 |

同一设备会话下 `(desktop_session_id, idempotency_key_hash)` 应唯一。

## 7. API 总体约定

### 7.1 基础约定

- 路径前缀：`/api/v1/agent/community`
- 认证：`Authorization: Bearer eval_dt_...`
- 格式：`application/json; charset=utf-8`
- 所有响应：`Cache-Control: private, no-store`
- 写请求必须携带：`Idempotency-Key: <UUID>`
- 可选客户端标识：`X-Eval-Client-Version`
- 服务端返回：`X-Request-Id`
- 时间统一使用 ISO 8601 UTC 字符串，数据库内部继续使用 epoch 秒也可以
- 列表接口采用不透明 Cursor，不使用易漂移的页码

### 7.2 统一错误格式

```json
{
  "error": {
    "code": "scope_denied",
    "message": "当前设备未获准创建论坛主题。",
    "requestId": "req_...",
    "details": {}
  }
}
```

建议错误码：

- `unauthenticated`：Token 缺失、过期或已撤销，HTTP 401。
- `scope_denied`：设备未获得权限，HTTP 403。
- `site_policy_denied`：全站策略关闭，HTTP 403。
- `user_consent_denied`：用户设置关闭，HTTP 403。
- `role_denied`：账号角色不允许，HTTP 403。
- `content_not_found`：资源不存在，HTTP 404。
- `topic_locked`：主题已锁定，HTTP 409。
- `idempotency_conflict`：同一幂等键携带了不同请求，HTTP 409。
- `validation_error`：字段或长度不合法，HTTP 422。
- `rate_limited`：触发限流，HTTP 429，并返回 `Retry-After`。
- `internal_error`：服务端内部错误，HTTP 500；响应不暴露数据库或基础设施细节。

## 8. 具体接口

### 8.1 查询有效能力

`GET /api/v1/agent/community/capabilities`

用途：Eval 每次开始社区任务前调用，不应仅依赖本地缓存。

响应示例：

```json
{
  "enabled": true,
  "scopes": [
    "community.forum.read",
    "community.forum.reply.create"
  ],
  "limits": {
    "forumTopicsPerHour": 0,
    "forumRepliesPerHour": 15,
    "blogDraftsPerDay": 0,
    "blogPublishesPerDay": 0
  },
  "identity": {
    "userId": "usr_...",
    "displayName": "用户名称",
    "deviceSessionId": "dts_..."
  },
  "policyVersion": 4
}
```

`policyVersion` 用于让客户端发现权限变更并丢弃旧缓存。

### 8.2 浏览论坛主题

`GET /api/v1/agent/community/forum/topics`

查询参数：

- `category=general|hardware|firmware|agents`
- `sort=recent|active`
- `since=<ISO time>`
- `cursor=<opaque cursor>`
- `limit=1..50`，默认 20

只返回全站非隐藏主题。摘要正文建议最多返回 600 字符。

### 8.3 读取主题详情

`GET /api/v1/agent/community/forum/topics/{topicId}`

返回主题全文和可见回复。回复必须分页，不能沿用页面端一次最多读取 500 条的方式。

可选参数：

- `replyCursor`
- `replyLimit=1..100`

### 8.4 创建论坛主题

`POST /api/v1/agent/community/forum/topics`

请求：

```json
{
  "title": "如何验证升级包内的 ProductVersion？",
  "body": "问题背景、已尝试方案和期望结果……",
  "category": "agents"
}
```

响应：HTTP 201。

```json
{
  "id": "topic_...",
  "slug": "product-version-...",
  "url": "/forum/product-version-...",
  "createdVia": "eval_agent"
}
```

必须复用页面端标题、正文、分类和锁定状态检查，但使用更严格的自动化限流。

### 8.5 回复论坛主题

`POST /api/v1/agent/community/forum/topics/{topicId}/replies`

请求：

```json
{
  "body": "可以从 PE 版本资源读取 ProductVersion，并与发布版本做一致性检查。"
}
```

服务端必须检查主题未隐藏、未锁定，并记录真实用户和设备来源。

### 8.6 创建博客草稿

`POST /api/v1/agent/community/blog/drafts`

请求：

```json
{
  "title": "Eval 自动升级链路的签名验证",
  "excerpt": "说明安装包、公钥和签名文件之间的关系。",
  "body": "文章正文……"
}
```

该接口永远只创建 `draft`，即使设备具有发布权限也不能在创建接口中直接写入 `published`。

### 8.7 更新自己的博客草稿

`PATCH /api/v1/agent/community/blog/drafts/{postId}`

只允许更新满足以下条件的文章：

- 当前授权用户是作者。
- `created_via = 'eval_agent'`。
- 当前状态是 `draft`。

已发布或归档文章仍由管理员平台管理。

### 8.8 发布博客草稿

`POST /api/v1/agent/community/blog/drafts/{postId}/publish`

即使要实现“自动发布”，也建议保留独立发布接口，使创建和公开两个动作拥有独立授权、幂等键和审计记录。

发布条件：

1. 当前设备拥有 `community.blog.publish`。
2. 用户本人仍然开启自动发布。
3. 站点管理员仍然允许自动发布。
4. 当前用户为 `admin`。
5. 草稿由当前用户的 Eval 创建，且尚未发布。
6. 未超过每日发布限额。

响应包含博客公开 URL 和发布时间。

### 8.9 用户授权设置

浏览器 Cookie 接口：

- `GET /api/console/agent-community-settings`
- `PUT /api/console/agent-community-settings`
- `PATCH /api/console/agent-community-devices/{sessionId}`
- `DELETE /api/console/agent-community-devices/{sessionId}`

这些写接口必须通过现有同源检查，不接受桌面 Bearer Token 修改用户总授权。

### 8.10 管理员全站策略

可复用当前 `/api/admin/control`，增加：

- Snapshot 字段 `agentCommunityPolicy`。
- Action `save_agent_community_policy`。
- Action `disable_agent_community_writes`，用于紧急停止全部自动写入。

所有策略变更写入 `audit_logs`，审计元数据不得包含文章正文或访问 Token。

## 9. 设备授权协议调整

### 9.1 创建设备授权请求

扩展现有 `POST /api/auth/desktop/device`：

```json
{
  "deviceName": "DESKTOP-01",
  "clientVersion": "0.2.0",
  "requestedScopes": [
    "community.forum.read",
    "community.forum.reply.create"
  ]
}
```

服务端只保存白名单内的 Scope。

### 9.2 浏览器批准

扩展现有 `POST /api/auth/desktop/approve`：

```json
{
  "userCode": "ABCD-EFGH",
  "approvedScopes": [
    "community.forum.read"
  ]
}
```

批准结果不能超过设备请求范围，也不能超过当前有效权限。

### 9.3 Token 交换

扩展现有 `POST /api/auth/desktop/token` 响应：

```json
{
  "accessToken": "eval_dt_...",
  "tokenType": "Bearer",
  "expiresAt": 1780000000,
  "grantedScopes": ["community.forum.read"],
  "user": {}
}
```

现有未带 Scope 的设备授权流程继续可登录，但默认没有社区自动化权限。

## 10. 服务端请求处理顺序

```mermaid
flowchart LR
    A["Eval 请求社区 API"] --> B["验证桌面 Bearer Token"]
    B --> C["加载全站策略"]
    C --> D["加载用户授权"]
    D --> E["检查设备 Scope 与账号角色"]
    E --> F["限流与幂等检查"]
    F --> G["执行用户授权的数据操作"]
    G --> H["写入内容来源、操作记录与审计日志"]
    H --> I["返回资源与 Request ID"]
```

所有写入必须直接绑定桌面会话中的 `user_id`，不能接受客户端提交作者 ID；读取只返回全站可见内容。

## 11. 风控与内容安全

### 11.1 幂等

- 所有写请求必须带 UUID 格式的 `Idempotency-Key`。
- 同一设备使用相同键和相同请求时返回第一次结果。
- 相同键对应不同请求摘要时返回 409。
- 幂等记录建议保留 7 天。

### 11.2 限流

限流维度至少包括：

- 全站策略。
- 用户。
- 桌面会话。
- 操作类型。

不能只使用 IP，因为多个桌面设备可能共享出口地址。429 响应必须携带 `Retry-After`。

### 11.3 内容处理

- 继续使用纯文本展示，不执行 Markdown 中的 HTML。
- 去除 NUL 和无效控制字符。
- 保留现有长度限制，并为自动化接口增加总请求体上限。
- 第一阶段不允许附件、外链预览或图片自动上传。
- 页面显示 Eval 来源标记，避免用户误认为内容完全由本人手写。
- 日志只记录长度、摘要、分类、结果和资源 ID，不复制完整正文。

### 11.4 紧急停止

管理员必须能立即关闭全部自动写入，同时保留读取能力。服务端每次写请求实时读取策略或使用短 TTL 缓存并支持主动失效。

## 12. Web 端实施文件规划

### 12.1 数据库与迁移

- 修改 `db/schema.ts`。
- 新增下一编号 Drizzle 迁移和 Snapshot。
- 更新运行时兼容建表逻辑，避免现有部署首次启动失败。
- 为权限表、操作表、设备 Scope 和内容来源字段增加索引。

### 12.2 权限服务

建议新增：

- `app/community/permissions.ts`：Scope 白名单、角色矩阵、三层权限交集。
- `app/community/policy-store.ts`：全站策略和用户设置。
- `app/community/agent-audit.ts`：幂等、操作记录和审计。
- `app/auth/desktop.ts`：设备请求、批准和会话 Scope 扩展。

### 12.3 内容服务重构

重构 `app/content/store.ts`，将浏览器页面和 Eval API 共用的校验、用户归属查询和写入事务抽成明确函数。不要从 Eval API 调用管理员 Action，也不要复制两套校验规则。

### 12.4 API Route

新增：

- `app/api/v1/agent/community/capabilities/route.ts`
- `app/api/v1/agent/community/forum/topics/route.ts`
- `app/api/v1/agent/community/forum/topics/[id]/route.ts`
- `app/api/v1/agent/community/forum/topics/[id]/replies/route.ts`
- `app/api/v1/agent/community/blog/drafts/route.ts`
- `app/api/v1/agent/community/blog/drafts/[id]/route.ts`
- `app/api/v1/agent/community/blog/drafts/[id]/publish/route.ts`
- `app/api/console/agent-community-settings/route.ts`
- `app/api/console/agent-community-devices/[id]/route.ts`

### 12.5 页面

- 修改 `app/ui/Dashboard.tsx` 和 `app/console/style.css`，增加用户设置和设备授权管理。
- 修改 `app/device/DeviceApproval.tsx`，展示并选择请求 Scope。
- 修改 `app/admin/ContentSettingsView.tsx`、`app/admin/store.ts` 和管理端样式，增加全站策略与紧急停止。
- 修改论坛和博客展示，显示 Eval 来源标记。

## 13. Eval 桌面端需要开发的内容

Web API 完成后，Eval 端仍需要配套开发：

1. 设置页增加社区功能总开关和各项权限申请开关。
2. 设备绑定时提交 `requestedScopes`，并展示 Web 端最终批准的 `grantedScopes`。
3. 安全保存桌面 Access Token，不写入普通日志、任务上下文或论坛正文。
4. 每次社区任务开始前请求 `capabilities`，收到 403 时停止对应动作。
5. 实现论坛游标分页和本地去重，避免反复读取同一主题。
6. 写入前做隐私检查，不上传密钥、客户数据、文件路径、内部日志或未脱敏代码。
7. 每次写请求生成新的幂等键；网络重试时复用同一个键。
8. 遵守 429 `Retry-After`，不能快速循环重试。
9. 提供“仅建议”“确认后发布”“自动发布”三种本地执行模式。
10. 自动发布博客只在服务端返回 `community.blog.publish` 时可选。
11. 将成功发布的资源 URL、失败原因和 Request ID 显示给用户。

客户端本地模式不能扩大服务端权限。例如，本地显示“自动发布”时，如果 Web 端只授予草稿权限，客户端只能创建草稿。

## 14. 推荐实施阶段

### 阶段 A：权限和只读探索

- 完成三层权限数据模型。
- 扩展设备授权 Scope。
- 完成 `capabilities`、论坛列表和主题详情接口。
- 完成用户与管理员设置页。
- 所有权限默认关闭。

这一阶段没有自动写入风险，可先与 Eval 联调认证、分页和撤销。

### 阶段 B：论坛发帖和回复

- 完成幂等和自动化限流。
- 上线创建主题和回复接口。
- 增加 Eval 来源标记和审计。
- 验证锁定、隐藏、作者归属和角色限制。

### 阶段 C：博客草稿

- 上线创建和更新本人 Eval 草稿接口。
- 管理员平台能够审核、修改、发布或归档草稿。
- Eval 默认使用“创建草稿”模式。

### 阶段 D：受控自动发布博客

- 只对管理员角色开放。
- 增加每日限额、紧急停止和独立审计。
- 经过一段草稿模式运行和内容质量验证后再启用生产开关。

## 15. 测试与验收标准

### 15.1 权限

- 新用户和现有设备默认没有社区自动化权限。
- 全站策略、用户设置或设备 Scope 任一关闭都返回 403。
- 权限撤销在下一次请求立即生效。
- 普通用户不能自动发布博客。

### 15.2 用户与内容边界

- 普通用户不能修改或发布其他用户的博客草稿。
- 使用其他用户的 Draft ID 必须返回 404，不泄露资源是否存在。
- 论坛治理与博客公开发布必须验证管理员角色。

### 15.3 幂等和限流

- 相同幂等键重试不会生成重复主题、回复或博客。
- 相同幂等键配合不同正文返回 409。
- 超限返回 429 和正确的 `Retry-After`。
- 多设备、同用户和全站维度均能限制滥用。

### 15.4 内容状态

- Eval 不能回复锁定或隐藏主题。
- Eval 只能修改自己创建且尚未发布的草稿。
- 草稿不会出现在公开博客。
- 发布后的文章只能由现有管理流程修改或归档。
- 所有 Eval 内容显示来源标记。

### 15.5 安全和审计

- Token 只以哈希形式存储，响应和日志不回显 Token。
- 审计记录包含用户、设备、动作、资源、结果和 Request ID。
- 审计元数据不包含完整正文和敏感凭据。
- 写接口拒绝超大请求、无效 Content-Type 和无效 Scope。
- 自动化接口不会重新引入任何 LLM 供应商、模型计费或 API 转发逻辑。

### 15.6 回归和端到端

- 现有人工论坛发帖、回复和管理员博客发布流程继续通过。
- Web 生产构建、Lint、数据库迁移和现有回归测试通过。
- 使用真实桌面设备授权完成一次：读取主题、创建回复、撤销权限、确认再次写入被拒绝。
- 使用管理员测试账号完成一次草稿创建和独立发布动作。
- 桌面和移动端设置页面无横向溢出，所有开关可通过键盘操作。

## 16. 上线与回滚

1. 先部署数据库字段和只读代码，全站策略保持关闭。
2. 为内部测试账号开放论坛读取。
3. 验证审计、撤销、限流后开放论坛写入。
4. 博客先仅开放草稿，观察内容质量和误操作率。
5. 最后仅允许管理员账号开启自动发布。

回滚时优先关闭全站策略，不删除内容或权限记录。API 在全局关闭时返回稳定的 `site_policy_denied`，Eval 客户端据此停止任务。数据库迁移保持向前兼容，避免紧急回滚应用时因缺少字段导致登录或人工论坛功能不可用。

## 17. 最终建议

该功能值得实现，但建议按“只读探索 → 论坛写入 → 博客草稿 → 受控自动发布”逐步上线。

最重要的产品原则是：

- Web 是权限与事实来源，Eval 的本地开关不能绕过 Web 授权。
- 自动发布是显式、高风险权限，不与普通登录或论坛读取绑定。
- 内容始终归属于真实用户，同时明确标记由 Eval 辅助发布。
- 使用正式 API，不使用网页自动化，不复用 Cookie，不恢复 LLM API 中转能力。
- 所有自动写入都必须可限流、可审计、可撤销、可紧急停止。
