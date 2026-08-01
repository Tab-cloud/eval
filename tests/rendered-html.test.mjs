import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("keeps the public landing page and protected consoles separated", async () => {
  const [home, consolePage, adminPage, authServer, adminLoginPage] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/console/page.tsx"),
    source("../app/admin/page.tsx"),
    source("../app/auth/server.ts"),
    source("../app/admin/auth/login/page.tsx"),
  ]);
  assert.match(home, /<AgentLanding\s*\/>/);
  assert.match(consolePage, /requireEmailSession/);
  assert.match(adminPage, /requireAdminSession/);
  assert.match(authServer, /tenant_admin/);
  assert.match(authServer, /platform_admin/);
  assert.match(authServer, /redirect\("\/console"\)/);
  assert.match(authServer, /redirect\("\/admin\/auth\/login"\)/);
  assert.match(adminLoginPage, /<AdminLogin\s*\/>/);
});

test("admin has a dedicated username login that never grants normal users control-plane access", async () => {
  const [page, client, route, core, store, schema, migration, css] = await Promise.all([
    source("../app/admin/auth/login/page.tsx"),
    source("../app/admin/auth/login/AdminLogin.tsx"),
    source("../app/api/admin/auth/login/route.ts"),
    source("../app/auth/core.ts"),
    source("../app/admin/store.ts"),
    source("../db/schema.ts"),
    source("../drizzle/0004_fluffy_lady_bullseye.sql"),
    source("../app/admin/auth/login/style.css"),
  ]);
  assert.match(page, /getSessionUser/);
  assert.match(client, /\/api\/admin\/auth\/login/);
  assert.match(client, /JSON\.stringify\(\{ username, password \}\)/);
  assert.match(client, /location\.href = "\/admin"/);
  assert.match(route, /authenticateUsername/);
  assert.doesNotMatch(route, /authenticateEmail/);
  assert.match(route, /tenant_admin/);
  assert.match(route, /platform_admin/);
  assert.match(route, /isLoginBlocked/);
  assert.match(route, /rejectCrossSiteWrite/);
  assert.match(route, /x-forwarded-proto/);
  assert.match(core, /WHERE u\.username = \?/);
  assert.match(core, /verifyPassword/);
  assert.match(store, /createPasswordHash/);
  assert.match(schema, /username: text\("username"\)/);
  assert.match(migration, /ADD COLUMN "username" text/);
  assert.match(migration, /users_username_uq/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("admin control room exposes governed modules and audit logs without a side navigation", async () => {
  const [consoleSource, store, css] = await Promise.all([
    source("../app/admin/AdminConsole.tsx"),
    source("../app/admin/store.ts"),
    source("../app/admin/style.css"),
  ]);
  for (const label of ["运营看板", "用户管理", "LLM 配置", "工具源文件", "版本升级", "收费配置"]) {
    assert.match(consoleSource, new RegExp(label));
  }
  assert.match(consoleSource, /审计日志/);
  assert.match(consoleSource, /真实网关流量/);
  assert.match(consoleSource, /上线清单/);
  assert.match(consoleSource, /模型运行质量/);
  assert.match(consoleSource, /最近调用/);
  assert.match(consoleSource, /data\.readiness/);
  assert.match(store, /FROM gateway_requests WHERE tenant_id = \?/);
  assert.match(store, /requests30d/);
  assert.match(store, /successRate/);
  assert.match(store, /averageLatency/);
  assert.match(store, /tokens30d/);
  assert.match(consoleSource, /<header className="admin-bar"/);
  assert.doesNotMatch(consoleSource, /sidebar|side-nav|sider/i);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /backdrop-filter:\s*blur/);
});

test("published downloads require a real stored artifact", async () => {
  const [catalog, download, upload] = await Promise.all([
    source("../app/api/v1/downloads/route.ts"),
    source("../app/api/v1/downloads/[id]/route.ts"),
    source("../app/api/admin/artifacts/route.ts"),
  ]);
  assert.match(catalog, /r\.status = 'published'/);
  assert.match(catalog, /r\.channel = 'stable'/);
  assert.match(download, /getArtifact/);
  assert.match(upload, /putArtifact/);
  assert.match(upload, /\.exe/);
  assert.match(upload, /\.msi/);
  assert.match(upload, /SHA-256/);
  assert.doesNotMatch(upload, /\.dmg|\.deb|\.rpm/);
});

test("API keys derive tenant identity on the server and never trust a tenant header", async () => {
  const [auth, store] = await Promise.all([
    source("../app/api/v1/_shared/auth.ts"),
    source("../app/console/store.ts"),
  ]);
  assert.match(auth, /secret_hash/);
  assert.match(auth, /tenant_id/);
  assert.match(auth, /revoked_at/);
  assert.match(auth, /expires_at/);
  assert.doesNotMatch(auth, /x-luban-tenant/i);
  assert.match(store, /SHA-256|sha256/);
  assert.match(store, /models:invoke/);
  assert.match(store, /api_key\.revoke/);
});

test("gateway exposes real OpenAI-compatible proxy routes and records requests", async () => {
  const [proxy, chat, responses, modelCatalog] = await Promise.all([
    source("../app/gateway/proxy.ts"),
    source("../app/api/v1/chat/completions/route.ts"),
    source("../app/api/v1/responses/route.ts"),
    source("../app/api/v1/models/route.ts"),
  ]);
  assert.match(chat, /chat\.completions/);
  assert.match(responses, /responses/);
  assert.match(proxy, /Authorization.*Bearer/);
  assert.match(proxy, /gateway_requests/);
  assert.match(proxy, /RATE_LIMITED/);
  assert.match(proxy, /X-Eval-Request-Id/);
  assert.match(modelCatalog, /llm_configs/);
  assert.doesNotMatch(modelCatalog, /const catalog/);
});

test("browser writes are same-origin protected and login attempts are limited", async () => {
  const [security, login, password] = await Promise.all([
    source("../app/security/request.ts"),
    source("../app/api/auth/login/route.ts"),
    source("../app/api/auth/password/route.ts"),
  ]);
  assert.match(security, /sec-fetch-site/);
  assert.match(security, /origin/);
  assert.match(login, /isLoginBlocked/);
  assert.match(login, /EVAL_ENABLE_PASSWORD_LOGIN/);
  assert.match(login, /Retry-After/);
  assert.match(password, /changePassword/);
  assert.match(password, /至少 10 位/);
});

test("console reads real snapshots and does not ship the former fixed metrics", async () => {
  const [dashboard, snapshot] = await Promise.all([
    source("../app/ui/Dashboard.tsx"),
    source("../app/console/store.ts"),
  ]);
  assert.match(dashboard, /\/api\/console\/snapshot/);
  assert.match(dashboard, /\/api\/console\/api-keys/);
  assert.match(snapshot, /gateway_requests/);
  assert.doesNotMatch(dashboard, /1\.84M|\$8,429|12\.6M/);
});

test("runs as a standard ECS Node service backed by PostgreSQL", async () => {
  const [packageJson, schema, database, migration, storage, service, nginx, hosting, deployment] = await Promise.all([
    source("../package.json"),
    source("../db/schema.ts"),
    source("../db/postgres.ts"),
    source("../db/migrate.mjs"),
    source("../app/storage/artifacts.ts"),
    source("../deploy/systemd/eval-web.service"),
    source("../deploy/nginx/eval.zailink.space.conf"),
    source("../docs/ARCHITECTURE.md"),
    source("../docs/ECS_DEPLOYMENT.md"),
  ]);
  assert.match(packageJson, /"build": "next build"/);
  assert.match(packageJson, /"pg":/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare/i);
  assert.match(schema, /drizzle-orm\/pg-core/);
  assert.match(schema, /jsonb/);
  assert.match(database, /DATABASE_URL/);
  assert.match(database, /Pool/);
  assert.match(migration, /pg_advisory_lock/);
  assert.match(storage, /ARTIFACT_STORAGE_PATH/);
  assert.match(service, /ExecStartPre=\/usr\/bin\/node db\/migrate\.mjs/);
  assert.match(service, /ExecStart=\/usr\/bin\/node node_modules\/next\/dist\/bin\/next start --hostname 127\.0\.0\.1 --port 41738/);
  assert.match(service, /User=eval-web/);
  assert.match(service, /ProtectSystem=strict/);
  assert.match(service, /ReadWritePaths=\/srv\/eval-web\/artifacts \/opt\/eval-web\/current\/\.next\/cache/);
  assert.match(nginx, /server_name eval\.zailink\.space/);
  assert.match(nginx, /X-Forwarded-Proto/);
  assert.match(nginx, /proxy_buffering off/);
  assert.match(hosting, /PostgreSQL/);
  assert.doesNotMatch(hosting, /\bD1\b|\bR2\b|Cloudflare Workers/);
  assert.match(deployment, /systemctl enable --now eval-web/);
  assert.doesNotMatch(deployment, /docker|container/i);
});

test("locale selects phone SMS for Chinese and Google identity for English", async () => {
  const login = await source("../app/login/page.tsx");
  assert.match(login, /\/api\/auth\/sms\/send/);
  assert.match(login, /\/api\/auth\/sms\/login/);
  assert.match(login, /\/api\/auth\/google\/start/);
  assert.match(login, /localStorage\.getItem\("eval-locale"\)/);
  assert.match(login, /locale === "zh"/);
  assert.match(login, /Continue with Google/);
  assert.match(login, /手机号验证/);
  assert.doesNotMatch(login, /\/api\/auth\/login/);
});

test("SMS login uses Alibaba Cloud, hashed one-time codes, and database rate limits", async () => {
  const [provider, settings, sms, schema, sendRoute] = await Promise.all([
    source("../app/auth/aliyun-sms.ts"),
    source("../app/auth/provider-settings.ts"),
    source("../app/auth/sms.ts"),
    source("../db/schema.ts"),
    source("../app/api/auth/sms/send/route.ts"),
  ]);
  assert.match(provider, /@alicloud\/dysmsapi20170525/);
  assert.match(provider, /dysmsapi\.aliyuncs\.com/);
  assert.match(provider, /environmentValue/);
  assert.match(provider, /tenantProviderSettings/);
  assert.match(settings, /ALIBABA_CLOUD_ACCESS_KEY_ID/);
  assert.match(settings, /AUTH_SMS_CODE_PEPPER/);
  assert.match(sms, /smsCodePepperRef/);
  assert.match(sms, /challengeCodeHash/);
  assert.match(sms, /sms:cooldown/);
  assert.match(sms, /sms:phone/);
  assert.match(sms, /sms:ip/);
  assert.match(schema, /authSmsChallenges/);
  assert.match(schema, /authSmsRateLimits/);
  assert.match(sendRoute, /如果该手机号已绑定账号/);
});

test("Google sign-in uses OIDC protections and only links pre-provisioned users", async () => {
  const [google, authCore, schema] = await Promise.all([
    source("../app/auth/google.ts"),
    source("../app/auth/core.ts"),
    source("../db/schema.ts"),
  ]);
  assert.match(google, /code_challenge_method:\s*"S256"/);
  assert.match(google, /state/);
  assert.match(google, /nonce/);
  assert.match(google, /verifyIdToken/);
  assert.match(google, /email_verified !== true/);
  assert.match(authCore, /findOrLinkGoogleUser/);
  assert.match(authCore, /WHERE lower\(u\.email\) = lower\(\?\)/);
  assert.doesNotMatch(google, /INSERT INTO users/);
  assert.match(schema, /authOauthStates/);
  assert.match(schema, /authOidcIdentities/);
});

test("admin identity settings store only deployment references and drive both login providers", async () => {
  const [consoleUi, identityUi, settings, store, google, sms, schema, config] = await Promise.all([
    source("../app/admin/AdminConsole.tsx"),
    source("../app/admin/AuthSettingsView.tsx"),
    source("../app/auth/provider-settings.ts"),
    source("../app/admin/store.ts"),
    source("../app/auth/google.ts"),
    source("../app/auth/aliyun-sms.ts"),
    source("../db/schema.ts"),
    source("../.env.example"),
  ]);
  assert.match(consoleUi, /登录与身份/);
  assert.match(consoleUi, /AuthSettingsView/);
  assert.match(identityUi, /aliyunAccessKeySecretRef/);
  assert.match(identityUi, /googleClientSecretRef/);
  assert.doesNotMatch(identityUi, /name="(?:accessKeySecret|clientSecret)"/);
  assert.match(settings, /process\.env\[reference\]/);
  assert.match(settings, /saveTenantProviderSettings/);
  assert.match(store, /auth\.providers\.save/);
  assert.match(google, /identityProviderSettings/);
  assert.match(sms, /tenantProviderSettings/);
  assert.match(schema, /authProviderSettings/);
  assert.match(config, /EVAL_IDENTITY_TENANT_SLUG/);
});

test("desktop updater exposes only signed releases from the public release tenant", async () => {
  const [updateRoute, catalog, download, releaseStore, upload, schema, config] = await Promise.all([
    source("../app/api/v1/updates/[target]/[arch]/[currentVersion]/route.ts"),
    source("../app/api/v1/downloads/route.ts"),
    source("../app/api/v1/downloads/[id]/route.ts"),
    source("../app/admin/store.ts"),
    source("../app/api/admin/artifacts/route.ts"),
    source("../db/schema.ts"),
    source("../.env.example"),
  ]);
  assert.match(updateRoute, /status:\s*204/);
  assert.match(updateRoute, /signature:\s*release\.updater_signature/);
  assert.match(updateRoute, /publicReleaseTenantSlug\(\)/);
  assert.match(updateRoute, /compareSemver/);
  assert.match(catalog, /JOIN tenants/);
  assert.match(catalog, /publicReleaseTenantSlug\(\)/);
  assert.match(download, /JOIN tenants/);
  assert.match(download, /publicReleaseTenantSlug\(\)/);
  assert.match(releaseStore, /缺少 Tauri \.sig 签名/);
  assert.match(upload, /form\.get\("signature"\)/);
  assert.match(upload, /updater_signature/);
  assert.match(schema, /updaterSignature/);
  assert.match(config, /EVAL_PUBLIC_RELEASE_TENANT_SLUG/);
});
