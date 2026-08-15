# Eval Agent Web 技术架构

## 运行边界

Eval Agent Web 是由 systemd 管理的原生 Node.js 服务。Next.js 提供页面、认证、桌面端授权、管理员操作、社区内容、下载和更新接口，通过 Nginx 或阿里云 ALB 接入 HTTPS。

```text
Browser / Eval Desktop
        |
   HTTPS / WAF
        |
 ALB or Nginx
        |
127.0.0.1:41738
 Next.js Node Service
        |        |
 PostgreSQL  Cloud Disk
```

推荐目录边界：

- 应用代码：`/opt/eval-web/current`
- 服务环境：`/etc/eval-web/eval-web.env`
- 安装包数据：`/srv/eval-web/artifacts`
- 服务定义：`/etc/systemd/system/eval-web.service`

## PostgreSQL

PostgreSQL 保存租户、用户、手机号、成员关系、短信挑战、OAuth 状态、外部身份绑定、密码凭据、浏览器与桌面端会话、审计日志、安装包元数据、版本、产品套餐、论坛主题与回复，以及博客文章。

- Schema：`db/schema.ts`
- Migration：`drizzle/*.sql`
- 运行连接：`db/postgres.ts`
- 部署迁移：`db/migrate.mjs`

时间使用 Unix 秒并保存为 `bigint`，JSON 数据使用 `jsonb`。用户、发布、论坛、博客与套餐查询必须在服务端附加 `tenant_id`。

## 连接池与文件存储

每个 Node 进程维护一个 PostgreSQL Pool，默认最大连接数为 15，可通过 `DATABASE_POOL_MAX` 调整。横向扩容时应按“实例数 × 单实例连接池”核算 RDS 最大连接数。

`app/storage/artifacts.ts` 提供安装包存储边界：

- 使用临时文件加原子重命名写入。
- 对象键经过根目录逃逸校验。
- 文件内容不进入 Git 或 PostgreSQL。
- 单 ECS 使用独立云盘并定期快照。
- 多实例部署前切换为 NAS、共享文件系统或 OSS 存储实现。

## 身份与权限

- 中文登录：管理员预绑定中国大陆手机号，阿里云短信发送一次性验证码；也可以使用 Google、GitHub 或已启用的账号密码。
- 英文登录：Google、GitHub 或已启用的账号密码。
- Google 使用 OpenID Connect 授权码流程以及 state、nonce、PKCE；GitHub 使用 OAuth Web Flow、state 和 PKCE，只申请 `user:email`。
- 第三方 access token 只用于本次身份校验，不写入数据库、Cookie 或日志。登录流程不会自动创建租户、账号或角色。
- 管理员入口 `/admin/auth/login` 使用独立用户名密码认证，并要求 `tenant_admin` 或 `platform_admin` 角色。
- 管理员密码保存 PBKDF2 哈希；登录入口具有同源保护和按用户名与来源组合的失败次数限制。
- 桌面端创建短期设备授权请求并打开系统浏览器，用户完成现有登录后明确批准设备；服务端只保存设备码、用户码和长期令牌的不可逆哈希。
- 桌面长期令牌可撤销、30 天过期，并只由 Windows 凭据管理器保存。
- 租户从服务端会话反查，不信任请求头或表单中的租户 ID。
- RBAC：`platform_admin`、`tenant_admin`、`developer`、`auditor`、`viewer`。
- 管理员写操作、密码修改和桌面端授权操作进入租户审计日志。

管理员平台的“登录与身份”模块保存短信签名、模板代码、Google Workspace 域，以及 Google/GitHub OAuth 部署变量引用。AccessKey、OAuth Client Secret 与验证码 Pepper 只通过 ECS 环境变量注入；数据库和管理员接口只返回变量是否已配置。

## 论坛与博客

- `/forum` 与 `/forum/[slug]` 需要普通 Web 会话。主题和回复只使用会话中的 `tenant_id`；隐藏内容不返回给普通成员，锁定主题保留阅读但拒绝新回复。
- 论坛发布接口执行同源校验、长度校验及按用户/租户统计的发布频率限制。正文仅作为纯文本由 React 转义渲染。
- `/blog` 与 `/blog/[slug]` 为公开页面，只读取 `EVAL_PUBLIC_CONTENT_TENANT_SLUG` 指定组织中已发布且发布时间生效的文章。
- 管理员“内容中心”可以创建、编辑和发布博客，也可以置顶、锁定、隐藏论坛主题及隐藏回复。治理操作写入审计日志，但审计元数据不保存正文。

## 桌面端下载与自动升级

管理员上传 NSIS/EXE 时必须同时提供 Tauri 构建生成且与安装包同名的 `.sig`。服务器使用 `EVAL_UPDATER_PUBLIC_KEY` 真实验签，并从 PE `ProductVersion`/`FileVersion` 读取内部版本。数据库保存 SHA-256、签名、公钥指纹、验签时间、内部版本、产品名、版本来源、平台和架构；签名私钥只存在于受保护的构建环境。

- `GET /api/v1/updates/{target}/{arch}/{current_version}?channel=stable`：有新版本返回更新清单，无更新返回 `204`。
- `GET /api/v1/downloads/{artifact_id}`：只下载当前公开版本中已验签的 EXE；传入当前版本 ID 时兼容下载该安装包，历史版本不再公开访问。
- `EVAL_PUBLIC_RELEASE_TENANT_SLUG`：唯一允许公开发布安装包的租户。
- `release_versions.artifact_id` 直接指向该版本唯一的 EXE 安装包。
- 创建与发布版本前均校验语义化版本、安装包内部版本是否完全一致、渠道重复、对象存在性和服务端验签记录；客户端仍使用内置公钥再次验证签名。旧产物没有可信内部版本时必须重新上传，不能继续发布。
- 管理员界面把安装包上传与版本发布合并为一个发布中心。每个渠道最多只有一个 `published` 版本；发布新版会把该渠道旧版转回私有草稿。公开目录、直接下载和桌面更新接口都额外限定该渠道最近发布的版本，历史文件只供管理员审计和回滚。

## 原生发布原则

构建和数据库迁移在服务启动前完成。systemd 的 `ExecStartPre` 执行迁移，迁移失败时主进程不会启动。迁移器使用 PostgreSQL advisory lock，多个 ECS 实例滚动启动时不会并发修改 Schema。

应用目录以只读方式运行；只有安装包云盘目录可写。Node 进程绑定 `127.0.0.1:41738`，不直接暴露公网。安装包云盘和 PostgreSQL/RDS 必须独立备份。
