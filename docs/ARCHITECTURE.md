# Luban AI 云端平台规划

## 产品定位

Luban AI 是面向企业团队的 AI API 控制平面：向下连接多家模型供应商，向上提供统一、稳定、可治理的 OpenAI-compatible API。当前版本优先完成控制台体验、租户权限边界、模型目录、凭证与下载中心的基础契约。

## 信息架构

1. **公开落地页**：`/` 展示 Eval Agent 的产品定位、工程能力、商业优势和目标人群；可引导登录，也允许访客不登录直接获取管理员发布的工具包。
2. **登录与用户控制台**：`/login` 使用邮箱与密码登录，成功后创建服务端会话并进入受保护的 `/console`。
3. **总览**：请求、成本、延迟、成功率、模型流量与实时调用。
4. **模型广场**：供应商接入、能力标签、健康状态、租户授权和价格策略。
5. **路由策略**：按模型、成本、延迟与地域进行加权路由、故障转移和熔断。
6. **API 密钥**：创建、一次性展示、散列存储、最小权限 scope、轮换和撤销。
7. **用户与组织**：租户、成员、邀请、团队和生命周期管理。
8. **权限策略**：RBAC 为主，资源归属与租户边界为强制条件。
9. **用量分析**：调用、Token、成本、错误、团队和密钥维度分析。
10. **公开下载**：只登记项目已经实际生成的 Windows x64 NSIS（`.exe`）与 MSI（`.msi`）安装包。管理员上传正式源文件后发布；当前未上传项必须显示“待发布”，不得补造其他平台、文件大小、哈希或下载地址。
11. **管理员控制室**：`/admin` 采用独立横向信息架构，包含运营看板、用户管理、LLM 配置、Agent 源文件、升级版本和收费配置。只有 `tenant_admin` 与 `platform_admin` 可以访问。

## 权限与隔离

角色分为 `platform_admin`、`tenant_admin`、`developer`、`auditor`、`viewer`。任何数据查询必须在服务端由当前身份派生 `tenant_id`，禁止直接信任前端提交的租户 ID。平台管理员操作单独记录高敏审计日志；API Key 只存不可逆散列，并通过 scope 与租户模型授权的交集决定最终能力。

浏览器登录使用邮箱密码验证。密码以独立随机盐和 PBKDF2-SHA256 哈希保存，不保存明文；会话令牌只在浏览器 HttpOnly、SameSite Cookie 中传递，数据库只保存令牌哈希。生产 HTTPS 环境同时启用 Secure。控制台在服务端验证会话，不能依赖前端跳转保护。

## 后端边界

- **Control API**：租户、用户、角色、模型授权、账单、发布物。
- **Gateway API**：兼容 `/v1/chat/completions` 与 `/v1/responses`，负责鉴权、限流、路由、重试和流式转发。
- **Worker**：异步审计、账单聚合、模型健康探测与发布物扫描。
- **D1**：结构化控制面数据；所有核心表都有租户索引。
- **R2**：管理员上传的正式安装包与租户导出文件。公开安装包使用公开发布地址；租户私有导出仍使用短时签名 URL。

## 当前远端接口

- `POST /api/auth/login`：验证邮箱密码并创建会话。
- `POST /api/auth/logout`：撤销当前会话。
- `GET /api/auth/me`：返回当前登录用户、租户与角色。
- `GET /api/v1/health`：公开健康检查。
- `GET /api/v1/models`：需要具备 `models:read` 的 API Key；租户由服务端根据密钥反查。
- `POST /api/v1/chat/completions`：OpenAI-compatible Chat Completions 中转，支持透传流式响应。
- `POST /api/v1/responses`：OpenAI-compatible Responses 中转。
- `GET /api/console/snapshot`：返回当前登录组织的真实模型、密钥、请求、发布与审计摘要。
- `POST /api/console/api-keys`：创建只显示一次的 API Key。
- `DELETE /api/console/api-keys/:id`：撤销当前用户或管理员有权操作的 API Key。
- `POST /api/auth/password`：验证当前密码后更新密码、撤销所有会话并要求重新登录。
- `GET /api/v1/downloads`：无需登录，返回公开发布目录；只有管理员上传并标记可用的正式包才包含下载地址。
- `GET /api/v1/downloads/:id`：无需登录，只允许下载处于正式发布状态且绑定真实 R2 对象的稳定版本。
- `GET /api/admin/control`：管理员读取当前组织的用户、模型、源文件、版本、套餐与看板指标。
- `POST /api/admin/control`：管理员执行用户、模型、版本与套餐配置，服务端强制附加当前组织范围。
- `POST /api/admin/artifacts`：管理员上传真实 Windows `.exe` 或 `.msi` 安装包，计算 SHA-256 后保存到 R2。
- `GET /api/admin/artifacts/:id`：管理员下载当前组织已上传的源文件。

LLM 配置不接收或保存明文 API Key，只记录由部署环境提供的密钥变量名称。版本发布必须先选择已上传的实际安装包；落地页只展示 `published + stable` 的版本。收费配置目前是产品套餐元数据，不包含支付收单、自动续费或发票能力。

开发期凭证由 `LUBAN_GATEWAY_TOKEN` 提供。生产阶段应替换为 D1 中散列保存、支持轮换与过期时间的 API Key 校验，并从已校验凭证反查租户，取消客户端传入租户头。

## 视觉原则

采用 Apple-inspired Startup Minimalism：以深色影院质感、冷银文字、低饱和青紫高光、克制的玻璃材质和大尺度留白建立高级感。组件信息密度参考 Ant Design 的企业级结构，表单和快捷命令参考 shadcn/ui 的可组合方式；动效只服务于层级、状态和空间关系，遵守 `prefers-reduced-motion`。

Dark、Light、移动端和无障碍的具体实现要求属于项目级强制约束，详见 [前端主题与移动端约束](./UI_CONSTRAINTS.md)。

## 下一阶段

1. 增加密码修改、找回、登录限速和 MFA，并确认正式域名与部署区域。
2. 增加邀请邮件、密码重置和批量成员导入，并继续完善管理员审计日志。
3. 实现 OpenAI-compatible 网关、供应商适配器、限流和 SSE 流式代理。
4. 接入正式支付服务商、订阅状态同步、账单与发票；在此之前收费配置只作为套餐规则来源。
5. 增加契约测试、跨租户越权测试、速率限制测试与审计完整性测试。
