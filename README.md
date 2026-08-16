# Eval Agent Web

Eval Web 是 Eval Agent 的产品网站与运营后台，提供公开落地页、中英文登录、桌面端账号绑定、用户工作台、管理员平台、论坛、博客、安装包下载和签名更新服务。

桌面客户端通过 `/api/v1/updates/{target}/{arch}/{current_version}` 检查管理员发布的真实安装包；未发布、未通过当前更新公钥验签或不属于公开发布租户的文件不会进入更新通道。

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
- `vben`：租户管理员用户名，通过 `/admin/auth/login` 登录
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

所有组织内查询都必须使用服务端登录会话或桌面端会话派生的 `tenant_id`，不接受客户端提交租户标识。

## 安装包文件

管理员上传真实 `.exe` 及其同名 `.sig`。安装包保存于 `ARTIFACT_STORAGE_PATH`，生产环境应将该目录放在独立云盘或共享文件系统中，并纳入备份。

管理员先在“版本发布”页面粘贴 `updater.pub` 公钥内容；未保存数据库配置时，服务器兼容使用 `EVAL_UPDATER_PUBLIC_KEY` 作为后备。系统使用该公钥对 EXE 和签名进行 Minisign 验证，并从 PE 元数据读取内部产品版本。同一租户的同一内部版本只保留一条产物记录和一个物理文件：重新上传会在验签后原位替换，SHA-256 未变化时不重复写盘。每个渠道只允许一个公开版本：已有同版本草稿会直接更新并发布，新版本发布后旧版本转为私有保留以支持审计和回滚；新用户只能下载最新稳定版 EXE，已安装客户端通过更新接口取得同一最新版本。

## 主要入口

- `/`：公开落地页与公开下载
- `/login`：中文支持手机号或 GitHub；英文支持 Google 或 GitHub
- `/blog`：公开团队博客，只显示指定公共内容租户中已发布的文章
- `/forum`：组织论坛，登录成员可发布主题和回复，内容按当前租户隔离
- `/console`：桌面端下载、社区、组织与账号工作台
- `/admin/auth/login`：管理员专用用户名密码登录
- `/admin`：用户、登录、内容、版本、套餐与审计管理平台
- `/docs`：安装、登录、桌面端授权、更新和社区使用指南
- `/api/v1/downloads`：公开版本目录与安装包下载
- `/api/v1/updates/{target}/{arch}/{current_version}`：Tauri 更新检查
- `/api/v1/health`：健康检查

## 生产安全

- PostgreSQL 只开放给应用安全组，不暴露公网端口，并启用 TLS、自动备份和时间点恢复。
- 登录 Cookie 使用 HttpOnly、SameSite，并在 HTTPS 下启用 Secure。
- 短信、Google 和 GitHub 登录只接受管理员已预置的组织成员，不在登录过程中创建账号、租户或角色。
- GitHub 只申请 `user:email`，用于匹配已验证邮箱，不申请仓库或代码权限。
- 论坛写入要求有效登录会话、通过同源校验并执行发布频率限制；主题、回复及治理操作始终使用服务端派生的 `tenant_id`。
- 博客和论坛正文按纯文本渲染，不接受或执行用户提交的 HTML。
- 桌面端令牌、设备码、密码、短信验证码和第三方登录凭据不得写入日志或仓库。
- 安装包目录禁止执行权限，Nginx 限制请求体大小。
