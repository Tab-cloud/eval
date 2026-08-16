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

PostgreSQL 保存用户、手机号、短信挑战、OAuth 状态、外部身份绑定、密码凭据、浏览器与桌面端会话、审计日志、安装包元数据、版本、产品方案、论坛主题与回复，以及博客文章。

- Schema：`db/schema.ts`
- Migration：`drizzle/*.sql`
- 运行连接：`db/postgres.ts`
- 部署迁移：`db/migrate.mjs`

时间使用 Unix 秒并保存为 `bigint`，JSON 数据使用 `jsonb`。站点采用单站点账号模型，用户角色直接保存在 `users.role`，业务数据不再携带租户字段。

## 连接池与文件存储

每个 Node 进程维护一个 PostgreSQL Pool，默认最大连接数为 15，可通过 `DATABASE_POOL_MAX` 调整。横向扩容时应按“实例数 × 单实例连接池”核算 RDS 最大连接数。

`app/storage/artifacts.ts` 提供安装包存储边界：

- 使用临时文件加原子重命名写入。
- 对象键经过根目录逃逸校验。
- 文件内容不进入 Git 或 PostgreSQL。
- 单 ECS 使用独立云盘并定期快照。
- 多实例部署前切换为 NAS、共享文件系统或 OSS 存储实现。

## 身份与权限

- 中文登录：用户使用中国大陆手机号验证码完成注册，并同时设置唯一用户名与密码；之后可使用手机号验证码、用户名密码或绑定的 GitHub 登录。修改密码和补充本地身份都必须使用对应用途的短信验证码。
- 中文手机号输入完整后，登录页通过同源、限流且禁止缓存的状态接口判断本地账号是否完整；未绑定用户名与密码的号码会直接进入注册表单。短信登录接口仍会二次校验账号完整性，不能仅依赖前端状态。
- 英文登录：仅支持 Google 与 GitHub。首次登录创建普通用户账号，个人中心可将另一提供商显式绑定到同一用户。
- Google 使用 OpenID Connect 授权码流程以及 state、nonce、PKCE；GitHub 使用 OAuth Web Flow、state 和 PKCE，只申请 `user:email`。
- OAuth state 同时保存登录/绑定意图和待绑定用户；显式绑定回调必须仍有同一用户的有效会话。第三方 access token 只用于本次身份校验，不写入数据库、Cookie 或日志。
- 公开注册与第三方首次登录只创建 `member` 普通用户，不会授予管理员权限。相同的已验证邮箱可复用现有用户，提供商 subject 具有全局唯一约束。
- 短信验证码使用服务端 Pepper 哈希保存，按 `login`、`register`、`phone_bind`、`password_change` 和用户身份生成隔离键，并具有过期、尝试次数与手机号/IP 频率限制。
- 管理员入口 `/admin/auth/login` 使用独立用户名密码认证，并要求 `admin` 角色。
- 管理员密码保存 PBKDF2 哈希；登录入口具有同源保护和按用户名与来源组合的失败次数限制。
- 桌面端创建短期设备授权请求并打开系统浏览器，用户完成现有登录后明确批准设备；服务端只保存设备码、用户码和长期令牌的不可逆哈希。
- 桌面长期令牌可撤销、30 天过期，并只由 Windows 凭据管理器保存。
- 权限仅分为 `admin` 与 `member`，所有鉴权均从服务端会话反查，不信任客户端提交的角色。
- 账号注册、身份绑定、管理员写操作、密码修改和桌面端授权操作进入全站审计日志；审计元数据中的手机号只保留掩码。

管理员平台的“登录与身份”模块直接保存短信签名、模板代码和三项阿里云短信凭据。AccessKey ID 不在管理员响应中回显；AccessKey Secret 与验证码 Pepper 使用由 `AUTH_SETTINGS_ENCRYPTION_KEY` 派生的 AES-256-GCM 密钥加密，并绑定配置字段作为认证上下文。Google/GitHub OAuth Secret 仍只通过 ECS 环境变量注入。管理员接口和审计日志只返回敏感配置是否存在。

## 论坛与博客

- `/forum` 与 `/forum/[slug]` 需要普通 Web 会话。隐藏内容不返回给普通用户，锁定主题保留阅读但拒绝新回复。
- 论坛发布接口执行同源校验、长度校验及按用户统计的发布频率限制。正文仅作为纯文本由 React 转义渲染。
- `/blog` 与 `/blog/[slug]` 为公开页面，只读取全站已发布且发布时间生效的文章。
- 管理员“内容中心”可以创建、编辑和发布博客，也可以置顶、锁定、隐藏论坛主题及隐藏回复。治理操作写入审计日志，但审计元数据不保存正文。

## 桌面端下载与自动升级

管理员先在版本发布页配置 `updater.pub` 公钥，再上传 NSIS/EXE 及 Tauri 构建生成且与安装包同名的 `.sig`。`release_settings` 只保存一份全站公钥与指纹；数据库没有配置时才使用 `EVAL_UPDATER_PUBLIC_KEY` 后备。服务器从 PE `ProductVersion`/`FileVersion` 读取内部版本，并保存 SHA-256、签名、公钥指纹、验签时间、内部版本、产品名、版本来源、平台和架构；签名私钥只存在于受保护的构建环境，不能进入管理员平台。

`agent_artifacts` 对 `embedded_version` 设置全局唯一约束。同一内部版本重新上传时复用原产物 ID 和对象地址，验签成功后以临时文件加回滚备份完成原子替换；SHA-256 相同且源文件存在时只刷新元数据，不重复写盘。迁移会将历史重复记录的发布外键指向最新产物，并通过清理队列删除旧对象。

- `GET /api/v1/updates/{target}/{arch}/{current_version}?channel=stable`：有新版本返回更新清单，无更新返回 `204`。
- `GET /api/v1/downloads/{artifact_id}`：只下载当前公开版本中已验签的 EXE；传入当前版本 ID 时兼容下载该安装包，历史版本不再公开访问。
- `release_versions.artifact_id` 直接指向该版本唯一的 EXE 安装包。
- 创建与发布版本前均校验语义化版本、安装包内部版本是否完全一致、渠道重复、对象存在性和服务端验签记录；客户端仍使用内置公钥再次验证签名。旧产物没有可信内部版本时必须重新上传，不能继续发布。
- 管理员界面把安装包上传与版本发布合并为一个发布中心。每个渠道最多只有一个 `published` 版本；已有同版本草稿会更新原记录并转为正式发布，发布新版会把该渠道旧版转回私有草稿。公开目录、直接下载和桌面更新接口都额外限定该渠道最近发布的版本，不同版本的历史文件只供管理员审计和回滚。

## 原生发布原则

构建和数据库迁移在服务启动前完成。systemd 的 `ExecStartPre` 执行迁移，迁移失败时主进程不会启动。迁移器使用 PostgreSQL advisory lock，多个 ECS 实例滚动启动时不会并发修改 Schema。

应用目录以只读方式运行；只有安装包云盘目录可写。Node 进程绑定 `127.0.0.1:41738`，不直接暴露公网。安装包云盘和 PostgreSQL/RDS 必须独立备份。
