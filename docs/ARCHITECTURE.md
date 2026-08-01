# Eval Agent Web 技术架构

## 运行边界

Eval Agent Web 是一个由 systemd 管理的原生 Node.js 服务。Next.js 同时提供页面、认证接口、管理员接口和 OpenAI-compatible 网关，通过 Nginx 或阿里云 ALB 接入 HTTPS。

```text
Browser / Agent Client
        |
   HTTPS / WAF
        |
 ALB or Nginx
        |
127.0.0.1:41738
 Next.js Node Service
   |        |        |
PostgreSQL  Cloud Disk  LLM Providers
```

推荐在 ECS 上使用以下目录边界：

- 应用代码：`/opt/eval-web/current`
- 服务环境：`/etc/eval-web/eval-web.env`
- 安装包数据：`/srv/eval-web/artifacts`
- 服务定义：`/etc/systemd/system/eval-web.service`

## PostgreSQL

PostgreSQL 保存租户、用户、手机号、成员关系、短信挑战、OAuth 状态、OIDC 身份、密码凭据、会话、API Key、LLM 配置、调用记录、审计日志、安装包元数据、版本与套餐。

- Schema：`db/schema.ts`
- Migration：`drizzle/*.sql`
- 运行连接：`db/postgres.ts`
- 部署迁移：`db/migrate.mjs`

时间使用 Unix 秒并保存为 `bigint`，JSON 数据使用 `jsonb`。用户、模型、密钥、发布与用量查询必须在服务端附加 `tenant_id`。

## 连接池

每个 Node 进程维护一个 PostgreSQL Pool，默认最大连接数为 15，可通过 `DATABASE_POOL_MAX` 调整。横向扩容时应按“实例数 × 单实例连接池”核算 RDS 最大连接数；规模扩大后可增加 PgBouncer。

## 文件存储

`app/storage/artifacts.ts` 提供安装包存储边界，当前实现写入 `ARTIFACT_STORAGE_PATH`：

- 使用临时文件加原子重命名写入。
- 对象键经过根目录逃逸校验。
- 文件内容不进入 Git 或 PostgreSQL。
- 单 ECS 使用独立云盘并定期快照。
- 多实例部署前切换为 NAS、共享文件系统或 OSS 存储实现。

## 身份与权限

- 中文浏览器登录：管理员预绑定中国大陆手机号，阿里云短信发送 6 位一次性验证码；验证码只保存带部署 Pepper 的哈希，5 分钟过期并限制发送及验证频率。
- 英文浏览器登录：Google OpenID Connect 授权码流程，使用 state、nonce 和 PKCE；仅允许已存在且处于启用状态的组织邮箱完成身份绑定。
- 两种入口最终签发同一种服务端会话与 HttpOnly Cookie；登录流程不会自动创建租户、账号或角色。
- 管理员入口：`/admin/auth/login` 使用独立用户名密码认证，用户名存储在 `users.username` 并保持唯一；成功后仍在服务端校验 `tenant_admin` 或 `platform_admin`，未登录访问 `/admin` 不会进入普通用户登录页。
- 普通用户的旧邮箱密码接口默认关闭，仅可在受控本地环境显式设置 `EVAL_ENABLE_PASSWORD_LOGIN=true`；生产环境不得开启。
- 管理员密码入口具有同源写入保护、按用户名与来源组合的失败次数限制，并使用 HTTPS 感知的 HttpOnly 会话 Cookie；普通角色即使密码正确也不能建立管理员会话。管理员密码只保存 PBKDF2 哈希，创建租户管理员时必须同时设置唯一用户名与初始密码。
- API 调用：Bearer API Key，数据库只保存不可逆哈希。
- 租户：从登录会话或 API Key 反查，不信任请求头中的租户 ID。
- RBAC：`platform_admin`、`tenant_admin`、`developer`、`auditor`、`viewer`。
- 审计：管理员写操作、密码修改、密钥创建和撤销都记录租户与执行者。

管理员控制台的“登录与身份”模块保存短信签名、模板代码、Google Workspace 域和部署变量引用。AccessKey、Google Client Secret 与验证码 Pepper 只通过 ECS 环境变量注入；数据库和管理员接口仅返回变量是否已配置，不返回变量值。`EVAL_IDENTITY_TENANT_SLUG` 指定承载公开 Google 登录入口的租户。

## 网关

`/api/v1/chat/completions` 与 `/api/v1/responses`：

1. 校验 API Key、状态、有效期与 Scope。
2. 从 Key 派生租户。
3. 查询当前租户启用的 LLM 配置。
4. 执行数据库 RPM 限流。
5. 从 systemd 环境读取上游 Secret。
6. 流式转发上游响应。
7. 记录状态码、延迟、Token 和请求标识。

## 原生发布原则

构建和数据库迁移在服务启动前完成。systemd 的 `ExecStartPre` 执行迁移，迁移失败时主进程不会启动。迁移器使用 PostgreSQL advisory lock，多个 ECS 实例滚动启动时不会并发修改 Schema。

应用目录以只读方式运行；只有安装包云盘目录可写。Node 进程绑定 `127.0.0.1:41738`，不直接暴露公网。安装包云盘和 PostgreSQL/RDS 必须独立备份。

## Eval 桌面端自动升级

管理员上传 Windows NSIS（`.exe`）或 MSI（`.msi`）时，必须同时上传 Tauri 构建生成的同名 `.sig` 签名。数据库保存安装包 SHA-256、签名、平台和架构；签名私钥只存在于受保护的构建环境，不进入 Web 服务、数据库或 Git。

- `GET /api/v1/updates/{target}/{arch}/{current_version}?channel=stable`：Tauri 动态更新接口。有新版本时返回 `version`、`url`、`signature`、`notes`、`pub_date`；无更新返回 `204`。
- `GET /api/v1/downloads/{release_id}`：下载管理员实际上传并正式发布的安装包。
- `EVAL_PUBLIC_RELEASE_TENANT_SLUG`：唯一允许对公众发布安装包的租户。公开查询和下载都在服务端按此租户隔离。
- 发布前校验语义化版本、渠道重复和 `.sig` 是否存在；客户端仍会使用内置公钥再次验证签名。
