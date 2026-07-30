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
ARTIFACT_STORAGE_PATH=/srv/eval-web/artifacts
EVAL_ENABLE_SEEDED_ACCOUNTS=false
OPENAI_API_KEY=replace-with-real-secret
```

保护环境文件：

```bash
sudo chown root:eval-web /etc/eval-web/eval-web.env
sudo chmod 0640 /etc/eval-web/eval-web.env
```

不要把数据库密码、证书或 LLM 密钥提交到 Git。

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
- LLM 流式接口关闭响应缓冲。
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

## 备份与扩容

- RDS 开启自动备份和时间点恢复。
- 独立云盘定期创建快照，并验证安装包恢复。
- Node 服务本身无会话内存依赖，可通过增加 ECS 实例扩容。
- 多实例必须使用共享文件存储或替换 `app/storage/artifacts.ts` 的实现。
