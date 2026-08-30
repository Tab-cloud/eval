# Eval Agent Web

Eval Web 是 Eval Agent 的产品网站与运营后台，提供公开落地页、中英文登录、桌面端账号绑定、用户工作台、管理员平台、论坛、博客、安装包下载和签名更新服务。

桌面客户端通过 `/api/v1/updates/{target}/{arch}/{current_version}` 检查管理员发布的真实安装包；未发布或未通过当前更新公钥验签的文件不会进入更新通道。

## 当前架构

项目采用原生 ECS 部署，不依赖 Cloudflare Workers、D1、R2、Vinext 或 Wrangler。

- Web：Next.js 16、Node.js 22，标准 Node Runtime
- 进程管理：systemd
- 数据库：PostgreSQL 16+ 或阿里云 RDS PostgreSQL
- 文件：ECS 独立云盘，目录由 `ARTIFACT_STORAGE_PATH` 指定
- 入口：Nginx 或阿里云 ALB 终止 HTTPS，转发到 `127.0.0.1:41738`
- 日志：systemd journal，可接入阿里云日志服务 SLS

生产拓扑、服务器初始化和发布步骤见 [ECS 原生部署说明](./docs/ECS_DEPLOYMENT.md)。

## 本地启动

需要 Node.js 22.13+ 和 PostgreSQL 16+：

```powershell
Copy-Item .env.example .env.local
npm ci
npm run db:migrate
npm run dev
```

默认开发地址为 `http://localhost:41738`。

## 本地账号

仅在 `EVAL_ENABLE_SEEDED_ACCOUNTS=true` 时创建：

- `user@eval.local`：普通开发者
- `vben`：管理员用户名，通过 `/admin/auth/login` 登录
- 管理员密码只保存 PBKDF2 哈希，不在仓库和页面中记录明文
- 普通开发者的旧本地密码为 `123456`，仅在启用旧密码接口时可用
- `EVAL_ENABLE_PASSWORD_LOGIN=true` 只用于启用普通用户的旧邮箱密码接口，不影响独立管理员登录入口

生产环境必须保持 `EVAL_ENABLE_SEEDED_ACCOUNTS=false` 和 `EVAL_ENABLE_PASSWORD_LOGIN=false`，并通过正式初始化流程创建具有密码凭据的管理员账号。

## 数据库

修改 [db/schema.ts](./db/schema.ts) 后生成并执行迁移：

```powershell
npm run db:generate
npm run db:migrate
```

站点使用单站点账号模型；所有角色和用户身份都必须由服务端登录会话或桌面端会话反查，不接受客户端提交角色。

## 安装包文件

管理员上传 Windows NSIS `.exe` 和一个 macOS `.dmg`。macOS DMG 没有 Apple Developer ID、没有 `.sig` 也可以直接上传和公开下载；管理端不接受其他 Mac 产物。Windows 更新包继续使用 Tauri 私钥签名。安装包保存于 `ARTIFACT_STORAGE_PATH`，生产环境应将该目录放在独立云盘或共享文件系统中，并纳入备份。

管理员在“版本发布”页面配置 Windows `updater.pub`；未保存数据库配置时，服务器兼容 `EVAL_UPDATER_PUBLIC_KEY` 环境变量后备。系统读取 Windows PE 内部版本并验签，macOS DMG 的版本和架构由上传表单声明。产物按“版本、平台、架构、格式”唯一保存；重新上传会原位替换，SHA-256 未变化时不重复写盘。macOS 当前通过官网下载新版 DMG 手动升级，不提供 Tauri 自动更新。未使用 Developer ID 签名和 Apple 公证的 DMG 可能被 Gatekeeper 拦截，用户首次打开时需要手动确认。

## 主要入口

- `/`：公开落地页与公开下载
- `/login`：中文支持手机号验证码、用户名密码、账号注册和 GitHub；英文仅支持 Google 或 GitHub
- `/blog`：公开博客，只显示全站已发布的文章
- `/forum`：用户论坛，登录用户可发布主题和回复
- `/console`：桌面端下载、社区、博客、活动与账号工作台；个人中心用于绑定同一用户的多种登录身份
- `/admin/auth/login`：管理员专用用户名密码登录
- `/admin`：用户、登录、内容、版本、套餐与审计管理平台
- `/docs`：安装、登录、桌面端授权、更新和社区使用指南
- `/api/v1/downloads`：公开版本目录与安装包下载
- `/api/v1/updates/{target}/{arch}/{current_version}`：Tauri 更新检查
- `/api/v1/health`：健康检查

## 生产安全

- PostgreSQL 只开放给应用安全组，不暴露公网端口，并启用 TLS、自动备份和时间点恢复。
- 登录 Cookie 使用 HttpOnly、SameSite，并在 HTTPS 下启用 Secure。
- 中文注册必须先验证中国大陆手机号，再创建用户名、PBKDF2 密码和普通用户身份；短信挑战按登录、注册、手机号绑定、密码修改四种用途隔离，不能跨用途复用。
- 中文账号可使用手机号验证码、用户名密码或已绑定 GitHub 登录；修改密码必须再次验证绑定手机号，并撤销其他网页登录会话。
- 英文账号仅开放 Google 与 GitHub。首次通过已验证第三方身份登录时创建普通用户；个人中心可显式绑定另一提供商。
- Google/GitHub 已验证邮箱与现有账号一致时会复用该账号；显式绑定还要求当前有效会话与 OAuth state 中的用户一致。公开登录不会创建管理员角色。
- GitHub 只申请 `user:email`，用于读取已验证邮箱，不申请仓库或代码权限；第三方 access token 不落库。
- 论坛写入要求有效登录会话、通过同源校验并执行按用户发布频率限制；治理操作仅允许管理员执行。
- 博客和论坛正文按纯文本渲染，不接受或执行用户提交的 HTML。
- 桌面端令牌、设备码、密码、短信验证码和第三方登录凭据不得写入日志或仓库。
- 安装包目录禁止执行权限，Nginx 限制请求体大小。
