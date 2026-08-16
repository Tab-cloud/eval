# ECS 原生生产部署

本文采用 Node.js、systemd、Nginx 和 PostgreSQL/RDS 的原生部署方式。

## 推荐拓扑

- Nginx 或阿里云 ALB：HTTPS、证书、限流、安全响应头。
- 一个或多个 ECS：运行 systemd 管理的 Next.js Node 服务。
- PostgreSQL/RDS：私网访问、自动备份、时间点恢复、独立数据库账号。
- 安装包存储：单机使用独立云盘；多实例使用 NAS、共享文件系统或 OSS。
- 日志：systemd journal 接入阿里云日志服务 SLS。

## 服务器目录

```text
/opt/eval-web/current          应用代码
/etc/eval-web/eval-web.env    生产环境变量
/srv/eval-web/artifacts       Agent 安装包
/etc/systemd/system/eval-web.service
```

创建独立运行用户和目录：

```bash
sudo useradd --system --home /opt/eval-web --shell /usr/sbin/nologin eval-web
sudo install -d -o eval-web -g eval-web /opt/eval-web/current
sudo install -d -o root -g eval-web -m 0750 /etc/eval-web
sudo install -d -o eval-web -g eval-web -m 0750 /srv/eval-web/artifacts
```

服务器需要 Node.js 22.13+、npm、Nginx，以及访问私网 PostgreSQL/RDS 的网络权限。

## 环境变量

复制 `.env.example` 的生产字段到 `/etc/eval-web/eval-web.env`：

```text
DATABASE_URL=postgresql://eval_user:strong-password@private-rds-host:5432/eval
DATABASE_SSL=require
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_POOL_MAX=15
DATABASE_CONNECT_TIMEOUT_MS=5000
DATABASE_IDLE_TIMEOUT_MS=30000
APP_ORIGIN=https://eval.zailink.space
EVAL_PUBLIC_RELEASE_TENANT_SLUG=connecting-hangzhou
EVAL_UPDATER_PUBLIC_KEY=replace-with-tauri-minisign-public-key
EVAL_IDENTITY_TENANT_SLUG=connecting-hangzhou
EVAL_PUBLIC_CONTENT_TENANT_SLUG=connecting-hangzhou
ARTIFACT_STORAGE_PATH=/srv/eval-web/artifacts
EVAL_ENABLE_SEEDED_ACCOUNTS=false
EVAL_ENABLE_PASSWORD_LOGIN=false
ALIBABA_CLOUD_ACCESS_KEY_ID=replace-with-server-side-credential
ALIBABA_CLOUD_ACCESS_KEY_SECRET=replace-with-server-side-credential
ALIYUN_SMS_SIGN_NAME=已审核短信签名
ALIYUN_SMS_TEMPLATE_CODE=已审核验证码模板代码
ALIYUN_SMS_TEMPLATE_CODE_KEY=code
AUTH_SMS_CODE_PEPPER=至少32位随机字符串
GOOGLE_OAUTH_CLIENT_ID=replace-with-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=replace-with-web-client-secret
GITHUB_OAUTH_CLIENT_ID=replace-with-oauth-app-client-id
GITHUB_OAUTH_CLIENT_SECRET=replace-with-oauth-app-client-secret
```

`EVAL_ENABLE_PASSWORD_LOGIN` 仅控制普通用户的旧邮箱密码接口，不影响新的中文用户名密码登录。管理员专用入口固定为 `https://eval.zailink.space/admin/auth/login`，生产数据库必须提前创建具有唯一用户名、密码凭据以及 `tenant_admin` 或 `platform_admin` 角色的账号；公开注册和第三方首次登录只创建 `developer`，不会授予管理员角色。不要在生产环境启用示例账号，部署密码也不得写入仓库或 systemd 服务文件。

桌面账号绑定复用 `APP_ORIGIN` 指定的 HTTPS 站点，并通过 `/device` 完成浏览器确认。部署新版本前必须执行数据库迁移；当前账号体系还要求 `users.account_locale`、可空邮箱、大小写不敏感的唯一用户名，以及 OAuth `intent`/`link_user_id` 字段。不得将桌面令牌、设备码或会话明文写入日志。

保护环境文件：

```bash
sudo chown root:eval-web /etc/eval-web/eval-web.env
sudo chmod 0640 /etc/eval-web/eval-web.env
```

不要把数据库密码、证书、短信凭据或 OAuth Secret 提交到 Git。

阿里云短信签名和验证码模板必须先审核通过，RAM 身份只授予发送短信所需权限。Google Cloud 中将应用类型设为 Web application，并把授权回调 URI 精确配置为：

```text
https://eval.zailink.space/api/auth/google/callback
```

如仅允许一个 Google Workspace 域，可额外设置 `GOOGLE_ALLOWED_HOSTED_DOMAIN`。英文用户首次使用已验证的 Google 身份登录时，会在 `EVAL_IDENTITY_TENANT_SLUG` 指定的既有租户中创建普通成员；已登录英文用户可在个人中心显式绑定 Google。

在 GitHub 的 Developer settings 中创建 OAuth App，只申请 `user:email`，并把 Authorization callback URL 精确配置为：

```text
https://eval.zailink.space/api/auth/github/callback
```

GitHub 登录同时显示在中文和英文登录页。首次登录会在身份租户中创建普通成员；若已验证邮箱与现有用户一致则复用该用户。中文或英文用户也可在个人中心发起显式绑定，回调会校验当前会话与 OAuth state 中的用户一致性。

中文注册依赖已审核的阿里云短信模板。发送与校验必须保持 `login`、`register`、`phone_bind`、`password_change` 四种用途隔离；修改密码后服务端撤销该用户其他 Web 会话并为当前浏览器签发新会话。上线前应分别完成四条真实短信流程和 Google/GitHub 绑定冲突测试。

`EVAL_PUBLIC_CONTENT_TENANT_SLUG` 指定公开博客的唯一内容组织。论坛不使用这个变量，始终按登录成员的当前组织隔离。部署包含论坛/博客功能的版本前必须运行迁移，创建 `blog_posts`、`forum_topics` 与 `forum_replies`；上线后由该组织管理员在“内容中心”发布第一篇博客并治理论坛内容。

## 构建与首次启动

在 `/opt/eval-web/current` 中：

```bash
sudo -u eval-web npm ci
sudo -u eval-web npm run build
sudo cp deploy/systemd/eval-web.service /etc/systemd/system/eval-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now eval-web
```

systemd 会先执行 `db/migrate.mjs`，迁移成功后再启动 Next.js。迁移器使用 PostgreSQL advisory lock，可安全用于多 ECS 滚动发布。

检查服务：

```bash
sudo systemctl status eval-web
sudo journalctl -u eval-web -n 200 --no-pager
curl --fail http://127.0.0.1:41738/api/v1/health
```

## Nginx

仓库提供 `deploy/nginx/eval.zailink.space.conf`。将其中证书路径替换为 ECS 上真实的阿里云证书路径，然后：

```bash
sudo cp deploy/nginx/eval.zailink.space.conf /etc/nginx/conf.d/eval.zailink.space.conf
sudo nginx -t
sudo systemctl reload nginx
```

Nginx 模板已经包含：

- `eval.zailink.space` 的 HTTP 到 HTTPS 跳转。
- `Host`、`X-Forwarded-Proto` 与真实客户端 IP。
- 128 MB 上传上限。
- Node 服务只通过 `127.0.0.1:41738` 访问。

安全组只开放 80/443；41738 和 PostgreSQL 端口不向公网开放。

## 后续发布

推荐使用版本目录加原子软链接切换：

```text
/opt/eval-web/releases/20260730-120000
/opt/eval-web/current -> /opt/eval-web/releases/20260730-120000
```

每次发布：

1. 把代码同步到新的版本目录。
2. 以 `eval-web` 用户执行 `npm ci` 与 `npm run build`。
3. 将 `current` 原子切换到新版本。
4. 执行 `sudo systemctl restart eval-web`。
5. 检查健康接口和日志。
6. 健康检查失败时把 `current` 切回上一版本并重启服务。

多 ECS 环境应通过 ALB 摘除实例后逐台滚动更新，避免整体中断。

## 桌面端版本发布

桌面安装包在独立的可信构建机生成，不在 ECS 上签名。构建环境设置 `TAURI_SIGNING_PRIVATE_KEY`（以及密钥有密码时的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）和 `EVAL_UPDATER_PUBLIC_KEY`，执行 Tauri Windows 构建后会得到安装包及对应 `.sig`。同一个 `EVAL_UPDATER_PUBLIC_KEY` 必须写入 Web 服务环境并编译进桌面客户端，以便上传端和客户端验证同一把签名密钥；私钥不得复制到 ECS。

管理员先在统一的“版本发布”页面粘贴并保存 `updater.pub` 公钥，再提交 NSIS/EXE 与同名 `.sig`，验签通过后创建发布。数据库公钥优先于 `EVAL_UPDATER_PUBLIC_KEY` 环境变量后备；切勿上传私钥。Web 服务会读取安装包内部版本。同一租户、同一内部版本只保留一个 EXE：重复上传会替换原对象，相同 SHA-256 不重复写盘；不同版本的历史 EXE 才继续私有保留。每个渠道只保留一个公开版本，已有同版本草稿会直接转为正式发布，发布新版会把旧版转为私有草稿。官网固定入口只提供最新稳定版 EXE，桌面客户端也只收到该最新公开升级。Nginx 的 `client_max_body_size` 必须覆盖单个安装包，仓库示例配置为 `128m`。发布后可验证：

如果轮换 `EVAL_UPDATER_PUBLIC_KEY`，旧公钥验签的产物会立即退出公开下载与更新通道，也不能重新发布；必须用新私钥重新构建并上传安装包。公钥指纹只基于密钥内容，不受 `.pub` 注释或配置编码形式影响。

```bash
curl -i "https://eval.zailink.space/api/v1/updates/windows/x86_64/0.1.0?channel=stable"
```

有更新应返回 `200` 和签名更新清单；当前版本已是最新或平台不支持时应返回 `204`。

## 备份与扩容

- RDS 开启自动备份和时间点恢复。
- 独立云盘定期创建快照，并验证安装包恢复。
- Node 服务本身无会话内存依赖，可通过增加 ECS 实例扩容。
- 多实例必须使用共享文件存储或替换 `app/storage/artifacts.ts` 的实现。
