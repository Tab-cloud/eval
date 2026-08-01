# Eval Agent Web

Eval Web 同时提供公开落地页、组织登录、AI/Agent 管理控制台和桌面端签名更新服务。桌面客户端通过 `/api/v1/updates/{target}/{arch}/{current_version}` 检查管理员发布的真实安装包；未发布、未签名或不属于公开发布租户的文件不会进入更新通道。

面向硬件研发团队的 Agent 工具、模型网关与可治理执行平台。项目包含公开落地页、中英文分流登录、用户控制台、管理员控制室、OpenAI-compatible API、安装包下载和开发者文档。

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
- 管理员密码仅以 PBKDF2 哈希保存，不在仓库和页面中明文记录
- 普通开发者的旧本地密码为 `123456`，仅在启用旧密码接口时可用
- `EVAL_ENABLE_PASSWORD_LOGIN=true` 只用于启用普通用户的旧邮箱密码接口，不影响独立管理员登录入口

生产环境必须保持 `EVAL_ENABLE_SEEDED_ACCOUNTS=false` 和 `EVAL_ENABLE_PASSWORD_LOGIN=false`，并通过正式初始化流程创建具有密码凭据的管理员账号，禁止继续使用示例账号和密码。

## 数据库

修改 [db/schema.ts](./db/schema.ts) 后生成并执行迁移：

```powershell
npm run db:generate
npm run db:migrate
```

所有服务端查询必须附加登录会话或 API Key 派生的 `tenant_id`，不接受客户端提交租户标识。

## 安装包文件

管理员上传的真实 `.exe` 和 `.msi` 文件保存于 `ARTIFACT_STORAGE_PATH`。生产环境应将该目录放在独立云盘或共享文件系统中，并纳入备份。

数据库只记录文件标识、大小、SHA-256、租户归属和发布状态。公开下载接口只返回已正式发布、属于稳定通道且源文件真实存在的版本。

## 主要入口

- `/`：公开落地页与公开下载
- `/login`：中文界面使用手机号与阿里云短信验证码；英文界面使用管理员预置邮箱的 Google 登录
- `/console`：用户控制台
- `/admin/auth/login`：管理员专用用户名密码登录
- `/admin`：租户管理员控制室；未登录时自动跳转到管理员专用登录页
- `/docs`：开发者接口文档
- `/api/v1/models`：模型目录
- `/api/v1/chat/completions`：Chat Completions 中转
- `/api/v1/responses`：Responses 中转
- `/api/v1/health`：健康检查

## 生产安全

- PostgreSQL 只开放给应用安全组，不暴露公网端口。
- 数据库启用 TLS、自动备份和时间点恢复。
- LLM 密钥只通过 ECS 环境文件或密钥管理服务注入。
- API Key 仅保存 SHA-256 哈希，完整密钥只在创建时显示一次。
- 登录 Cookie 使用 HttpOnly、SameSite，并在 HTTPS 下启用 Secure。
- 短信和 Google 登录都只接受管理员已预置的组织成员，不在登录过程中创建账号、租户或角色。
- 安装包目录禁止执行权限，Nginx 限制请求体大小。
