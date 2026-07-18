# Luban AI Cloud Console

`eval_web` 是 Luban 的云端 Web 与 API 控制面原型，覆盖企业登录、模型集合管理、路由策略、API 密钥、用户/组织、权限隔离、用量分析和下载中心。

## 本地启动

需要 Node.js 22.13 或更高版本。

```bash
npm ci
copy .env.example .env.local
npm run dev
```

默认首页为控制台总览，`/login` 为登录体验。健康检查位于 `/api/v1/health`；受保护接口需要 Bearer 凭证与租户上下文，详见 [架构说明](./docs/ARCHITECTURE.md)。

## 当前状态

- 已完成高保真响应式控制台与登录页。
- 已定义租户、用户、成员关系、API Key、模型授权、审计和发布物数据模型。
- 已提供模型目录、下载清单与健康检查接口骨架。
- 登录页当前为交互原型；生产登录必须连接正式 OIDC/企业 SSO。

## 重要安全约束

租户 ID 必须由后端从已验证身份中派生。当前开发接口中的 `X-Luban-Tenant` 只用于契约联调，生产网关必须从 API Key 反查租户，所有数据库访问同时附加租户条件，并保留跨租户越权测试。
