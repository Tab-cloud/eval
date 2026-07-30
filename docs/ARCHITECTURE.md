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

PostgreSQL 保存租户、用户、成员关系、密码凭据、会话、API Key、LLM 配置、调用记录、审计日志、安装包元数据、版本与套餐。

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

- 浏览器登录：邮箱、PBKDF2-SHA256、服务端会话、HttpOnly Cookie。
- API 调用：Bearer API Key，数据库只保存不可逆哈希。
- 租户：从登录会话或 API Key 反查，不信任请求头中的租户 ID。
- RBAC：`platform_admin`、`tenant_admin`、`developer`、`auditor`、`viewer`。
- 审计：管理员写操作、密码修改、密钥创建和撤销都记录租户与执行者。

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
