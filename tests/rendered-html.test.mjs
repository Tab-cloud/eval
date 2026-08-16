import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("encrypted admin secrets round-trip only with the matching context and reject tampering", async () => {
  const previousKey = process.env.AUTH_SETTINGS_ENCRYPTION_KEY;
  process.env.AUTH_SETTINGS_ENCRYPTION_KEY = "test-only-master-key-with-more-than-32-characters";
  try {
    const { openSecret, sealSecret } = await import("../app/auth/secret-crypto.ts");
    const context = "auth-provider-settings:global:sms-code-pepper";
    const plaintext = "test-only-pepper-value-with-32-characters";
    const encrypted = sealSecret(plaintext, context);
    assert.equal(typeof encrypted, "string");
    assert.doesNotMatch(encrypted, new RegExp(plaintext));
    assert.equal(openSecret(encrypted, context), plaintext);
    assert.throws(() => openSecret(encrypted, "auth-provider-settings:other:sms-code-pepper"), /无法解密/);
    const parts = encrypted.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    assert.throws(() => openSecret(parts.join("."), context), /无法解密/);
  } finally {
    if (previousKey === undefined) delete process.env.AUTH_SETTINGS_ENCRYPTION_KEY;
    else process.env.AUTH_SETTINGS_ENCRYPTION_KEY = previousKey;
  }
});

test("keeps the public landing page and protected consoles separated", async () => {
  const [home, consolePage, adminPage, authServer, adminLoginPage] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/console/page.tsx"),
    source("../app/admin/page.tsx"),
    source("../app/auth/server.ts"),
    source("../app/admin/auth/login/page.tsx"),
  ]);
  assert.match(home, /<AgentLanding\s*\/>/);
  assert.match(consolePage, /requireUserSession/);
  assert.match(adminPage, /requireAdminSession/);
  assert.match(authServer, /user\.role !== "admin"/);
  assert.doesNotMatch(authServer, /tenant_admin|platform_admin|tenantId/);
  assert.match(authServer, /redirect\("\/console"\)/);
  assert.match(authServer, /redirect\("\/admin\/auth\/login"\)/);
  assert.match(adminLoginPage, /<AdminLogin\s*\/>/);
});

test("keeps public download metadata readable across responsive layouts", async () => {
  const [landing, css] = await Promise.all([
    source("../app/agent/AgentLanding.tsx"),
    source("../app/agent/landing.css"),
  ]);
  assert.match(css, /\.release-spec span \{[^}]*font:\s*600 12px/);
  assert.match(css, /\.release-action \{[^}]*font-size:\s*13px/);
  assert.match(css, /\.release-truth p \{[^}]*font-size:\s*14px/);
  assert.match(css, /\.download-heading > p \{[^}]*font-size:\s*16px/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.release-truth \{ grid-template-columns:\s*1fr/);
  assert.match(landing, /href="https:\/\/beian\.miit\.gov\.cn\/"[^>]*>浙ICP备2024097468号-10<\/a>/);
  assert.doesNotMatch(landing, /正在连接（杭州）科技有限公司|Connecting \(Hangzhou\) Technology|© 2026 CONNECTING TECHNOLOGY/);
  assert.match(css, /\.closing-scene footer \{[^}]*justify-content:\s*center/);
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
  assert.match(route, /user\.role !== "admin"/);
  assert.doesNotMatch(route, /tenant_admin|platform_admin/);
  assert.match(route, /isLoginBlocked/);
  assert.match(route, /rejectCrossSiteWrite/);
  assert.match(route, /x-forwarded-proto/);
  assert.match(core, /WHERE lower\(u\.username\) = lower\(\?\)/);
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
  for (const label of ["运营看板", "用户管理", "登录与身份", "内容中心", "版本发布", "产品方案"]) {
    assert.match(consoleSource, new RegExp(label));
  }
  assert.doesNotMatch(consoleSource, /id: "artifacts"/);
  assert.match(consoleSource, /ReleaseCenterView/);
  assert.match(consoleSource, /审计日志/);
  assert.match(consoleSource, /公开内容运营/);
  assert.match(consoleSource, /上线清单/);
  assert.match(consoleSource, /data\.readiness/);
  assert.match(store, /FROM blog_posts/);
  assert.match(store, /FROM forum_topics/);
  assert.match(store, /FROM release_versions/);
  assert.doesNotMatch(store, /llm_configs|gateway_requests|api_keys/);
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
  assert.match(upload, /stageArtifactReplacement/);
  assert.match(upload, /\.exe/);
  assert.doesNotMatch(upload, /\.msi/i);
  assert.match(upload, /SHA-256/);
  assert.doesNotMatch(upload, /\.dmg|\.deb|\.rpm/);
});

test("LLM API relay routes, storage, settings, and sales copy are structurally removed", async () => {
  const deleted = [
    "../app/gateway/proxy.ts",
    "../app/api/v1/_shared/auth.ts",
    "../app/api/v1/chat/completions/route.ts",
    "../app/api/v1/responses/route.ts",
    "../app/api/v1/models/route.ts",
    "../app/api/console/api-keys/route.ts",
    "../app/api/console/api-keys/[id]/route.ts",
  ];
  await Promise.all(deleted.map(path => assert.rejects(source(path), error => error?.code === "ENOENT")));
  const [schema, adminStore, consoleStore, adminUi, dashboard, docs, config, nginx, migration] = await Promise.all([
    source("../db/schema.ts"), source("../app/admin/store.ts"), source("../app/console/store.ts"),
    source("../app/admin/AdminConsole.tsx"), source("../app/ui/Dashboard.tsx"), source("../app/docs/page.tsx"),
    source("../.env.example"), source("../deploy/nginx/eval.zailink.space.conf"), source("../drizzle/0008_mushy_songbird.sql"),
  ]);
  const activeProduct = [schema, adminStore, consoleStore, adminUi, dashboard, docs, config, nginx].join("\n");
  assert.doesNotMatch(activeProduct, /llm_configs|gateway_requests|api_keys|OPENAI_API_KEY|OpenAI-compatible|chat\/completions/);
  assert.doesNotMatch(schema, /requestLimit|request_limit|tenantModelGrants|gatewayRequests/);
  for (const table of ["gateway_requests", "tenant_model_grants", "api_keys", "llm_configs", "models"]) assert.match(migration, new RegExp(`DROP TABLE "${table}"`));
  assert.match(migration, /DROP COLUMN "request_limit"/);
  assert.match(dashboard, /publishedReleases/);
  assert.match(adminUi, /产品套餐/);
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
  assert.match(password, /verifySmsCode\("password_change"/);
  assert.match(password, /replacePassword/);
  assert.match(password, /至少 10 位/);
});

test("console reads real snapshots, keeps five useful destinations, and removes organization UI", async () => {
  const [dashboard, snapshot, css] = await Promise.all([
    source("../app/ui/Dashboard.tsx"),
    source("../app/console/store.ts"),
    source("../app/console/style.css"),
  ]);
  assert.match(dashboard, /\/api\/console\/snapshot/);
  assert.match(dashboard, /\/forum/);
  assert.match(dashboard, /\/blog/);
  assert.match(dashboard, /id: "blog", label: "博客", icon: "spark", href: "\/blog"/);
  assert.match(dashboard, /<Link key=\{item\.id\} href=\{item\.href\}>/);
  assert.match(dashboard, /className="workspace-mobile-nav"/);
  assert.doesNotMatch(dashboard + snapshot, /tenantId|tenantName|organization|Organization|activeMembers|totalMembers/);
  assert.match(css, /grid-template-columns:repeat\(5,1fr\)/);
  assert.match(snapshot, /release_versions/);
  assert.match(snapshot, /forum_topics/);
  assert.match(snapshot, /blog_posts/);
  assert.doesNotMatch(dashboard + snapshot, /api-keys|gateway_requests|llm_configs/);
  assert.doesNotMatch(dashboard, /1\.84M|\$8,429|12\.6M/);
});

test("single-site migration preserves users and settings before removing tenant structures", async () => {
  const [schema, migration, authCore, adminStore, contentStore] = await Promise.all([
    source("../db/schema.ts"),
    source("../drizzle/0015_workable_lightspeed.sql"),
    source("../app/auth/core.ts"),
    source("../app/admin/store.ts"),
    source("../app/content/store.ts"),
  ]);
  assert.match(migration, /COUNT\(\*\) FROM "tenants"\) > 1/);
  assert.match(migration, /SET "role" = 'admin'/);
  assert.match(migration, /RENAME COLUMN "tenant_id" TO "encryption_context"/);
  assert.match(migration, /UPDATE "release_settings" SET "id" = 'global'/);
  assert.match(migration, /DROP TABLE "memberships"/);
  assert.match(migration, /DROP TABLE "tenants"/);
  assert.match(schema, /role: text\("role", \{ enum: \["admin", "member"\] \}\)/);
  assert.doesNotMatch(schema, /export const tenants|export const memberships|tenantId: text\("tenant_id"\)/);
  assert.doesNotMatch(authCore + adminStore + contentStore, /tenant_id|tenantId|tenantName|memberships|JOIN tenants/);
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
  assert.match(nginx, /client_max_body_size 128m/);
  assert.doesNotMatch(nginx, /chat\/completions|responses|proxy_buffering off/);
  assert.match(hosting, /PostgreSQL/);
  assert.doesNotMatch(hosting, /\bD1\b|\bR2\b|Cloudflare Workers/);
  assert.match(deployment, /systemctl enable --now eval-web/);
  assert.doesNotMatch(deployment, /docker|container/i);
});

test("locale selects phone SMS and the configured external identity entry points", async () => {
  const [login, loginCss] = await Promise.all([
    source("../app/login/page.tsx"),
    source("../app/login/style.css"),
  ]);
  assert.match(login, /\/api\/auth\/sms\/send/);
  assert.match(login, /\/api\/auth\/sms\/login/);
  assert.match(login, /\/api\/auth\/username\/login/);
  assert.match(login, /\/api\/auth\/register/);
  assert.match(login, /`\/api\/auth\/\$\{provider\}\/start/);
  assert.match(login, /oauthHref\("google"\)/);
  assert.match(login, /oauthHref\("github"\)/);
  assert.match(login, /localStorage\.getItem\("eval-locale"\)/);
  assert.match(login, /locale === "zh"/);
  assert.match(login, /Continue with Google/);
  assert.match(login, /Continue with GitHub/);
  assert.match(login, /使用 GitHub 登录/);
  assert.match(login, /手机号验证/);
  assert.match(login, /注册账号/);
  assert.match(login, /账号密码/);
  assert.match(login, /id="login-password"/);
  assert.match(login, /id="register-password"/);
  assert.match(login, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(login, /aria-label=\{passwordVisible \? "隐藏密码" : "显示密码"\}/);
  assert.match(login, /name=\{passwordVisible \? "eyeOff" : "eye"\}/);
  assert.match(loginCss, /\.password-toggle \{[^}]*width: 46px;[^}]*height: 46px/);
  assert.match(login, /Only Google and GitHub are available for English accounts/);
  assert.match(login, /fetch\("\/api\/auth\/phone\/status"/);
  assert.match(login, /payload\.status === "registration_required"/);
  assert.match(login, /setChineseMethod\("register"\)/);
  assert.match(login, /该手机号尚未完成账号绑定，请设置账号和密码完成注册/);
  assert.match(login, /payload\.code === "ACCOUNT_SETUP_REQUIRED"/);
  assert.match(login, /href="https:\/\/beian\.miit\.gov\.cn\/"[^>]*>浙ICP备2024097468号-10<\/a>/);
  assert.doesNotMatch(login, /正在连接（杭州）科技有限公司|CONNECTING \(HANGZHOU\) TECHNOLOGY|© 2026/);
  assert.match(loginCss, /\.trust span \{[^}]*font: 560 11px\/1\.4/);
  assert.match(loginCss, /\.login-copy-foot p \{[^}]*font-size: 12px/);
  assert.match(loginCss, /\.login-page > footer \{[^}]*font: 550 9px/);
  assert.doesNotMatch(login + loginCss, /ORGANIZATION|团队空间|租户|组织/);
  assert.doesNotMatch(login, /\/api\/auth\/login/);
});

test("SMS verification uses Alibaba Cloud, purpose-bound codes, completed accounts, and database rate limits", async () => {
  const [provider, settings, sms, authCore, schema, phoneStatusRoute, sendRoute, loginRoute, passwordRoute, registrationRoute] = await Promise.all([
    source("../app/auth/aliyun-sms.ts"),
    source("../app/auth/provider-settings.ts"),
    source("../app/auth/sms.ts"),
    source("../app/auth/core.ts"),
    source("../db/schema.ts"),
    source("../app/api/auth/phone/status/route.ts"),
    source("../app/api/auth/sms/send/route.ts"),
    source("../app/api/auth/sms/login/route.ts"),
    source("../app/api/auth/password/route.ts"),
    source("../app/api/auth/register/route.ts"),
  ]);
  assert.match(provider, /@alicloud\/dysmsapi20170525/);
  assert.match(provider, /dysmsapi\.aliyuncs\.com/);
  assert.match(provider, /identityProviderSettings/);
  assert.match(settings, /aliyunAccessKeyId/);
  assert.doesNotMatch(settings, /ALIBABA_CLOUD_ACCESS_KEY_ID/);
  assert.doesNotMatch(settings, /AUTH_SMS_CODE_PEPPER/);
  assert.match(sms, /settings\.smsCodePepper/);
  assert.match(sms, /challengeCodeHash/);
  assert.match(sms, /sms:cooldown/);
  assert.match(sms, /sms:phone/);
  assert.match(sms, /sms:ip/);
  assert.match(sms, /sms:account-status/);
  assert.match(sms, /"login" \| "register" \| "phone_bind" \| "password_change"/);
  assert.match(sms, /hasCompleteChineseLocalIdentity/);
  assert.match(sms, /status: "registration_required"/);
  assert.match(sms, /promoteVerifiedLoginCodeToRegistration/);
  assert.doesNotMatch(sms, /purpose === "login" && \(!user/);
  assert.match(sms, /user\.accountLocale !== "zh"/);
  assert.match(sms, /`\$\{purpose\}:\$\{userId \?\? "public"\}:\$\{phoneE164\}`/);
  assert.match(schema, /authSmsChallenges/);
  assert.match(schema, /authSmsRateLimits/);
  assert.match(phoneStatusRoute, /rejectCrossSiteWrite/);
  assert.match(phoneStatusRoute, /phoneAccountStatus/);
  assert.match(phoneStatusRoute, /Cache-Control": "no-store/);
  assert.match(phoneStatusRoute, /status: 429/);
  assert.match(sendRoute, /purpose === "password_change"/);
  assert.match(sendRoute, /sessionUser\.accountLocale !== "zh"/);
  assert.match(loginRoute, /ACCOUNT_SETUP_REQUIRED/);
  assert.match(loginRoute, /status: 409/);
  assert.match(loginRoute, /authenticateSmsCode\(phone, code\)/);
  assert.doesNotMatch(loginRoute, /tenantId/);
  assert.match(authCore, /hasCompleteChineseLocalIdentity/);
  assert.match(authCore, /auth\.account\.complete/);
  assert.match(authCore, /phoneOwner\.username && phoneOwner\.credential_user_id/);
  assert.match(passwordRoute, /verifySmsCode\("password_change"/);
  assert.match(passwordRoute, /replacePassword/);
  assert.doesNotMatch(passwordRoute, /currentPassword|authenticateUsername/);
  assert.match(registrationRoute, /verifySmsCode\("register"/);
  assert.match(registrationRoute, /registerChineseAccount/);
});

test("Google sign-in uses OIDC protections, creates English accounts, and supports explicit linking", async () => {
  const [google, authCore, schema, migration] = await Promise.all([
    source("../app/auth/google.ts"),
    source("../app/auth/core.ts"),
    source("../db/schema.ts"),
    source("../drizzle/0012_illegal_machine_man.sql"),
  ]);
  assert.match(google, /code_challenge_method:\s*"S256"/);
  assert.match(google, /state/);
  assert.match(google, /nonce/);
  assert.match(google, /verifyIdToken/);
  assert.match(google, /email_verified !== true/);
  assert.match(google, /loginOrCreateExternalUser/);
  assert.match(google, /linkExternalIdentity/);
  assert.match(google, /stored\.intent === "link"/);
  assert.match(google, /current\.accountLocale !== "en"/);
  assert.match(google, /intent === "login" && locale !== "en"/);
  assert.match(google, /ExternalIdentityPolicyError/);
  assert.match(authCore, /loginOrCreateExternalUser/);
  assert.match(authCore, /WHERE lower\(u\.email\) = lower\(\?\)/);
  assert.match(authCore, /INSERT INTO users/);
  assert.match(schema, /authOauthStates/);
  assert.match(schema, /authOidcIdentities/);
  assert.match(schema, /accountLocale/);
  assert.match(schema, /intent:/);
  assert.match(schema, /linkUserId/);
  assert.match(migration, /DROP NOT NULL/);
  assert.match(migration, /account_locale/);
  assert.match(migration, /link_user_id/);
});

test("GitHub sign-in uses state, PKCE, verified emails, account creation, and explicit linking", async () => {
  const [github, start, callback, authCore, schema, config] = await Promise.all([
    source("../app/auth/github.ts"),
    source("../app/api/auth/github/start/route.ts"),
    source("../app/api/auth/github/callback/route.ts"),
    source("../app/auth/core.ts"),
    source("../db/schema.ts"),
    source("../.env.example"),
  ]);
  assert.match(github, /https:\/\/github\.com\/login\/oauth\/authorize/);
  assert.match(github, /https:\/\/github\.com\/login\/oauth\/access_token/);
  assert.match(github, /code_challenge_method:\s*"S256"/);
  assert.match(github, /scope:\s*"user:email"/);
  assert.match(github, /api\.github\.com\/user\/emails/);
  assert.match(github, /item\.verified === true/);
  assert.doesNotMatch(github, /(?:^|[\s"'])repo(?=$|[\s"'])|write:org/);
  assert.match(start, /beginGitHubAuthorization/);
  assert.match(callback, /finishGitHubAuthorization/);
  assert.match(github, /stored\.intent === "link"/);
  assert.match(github, /linkExternalIdentity/);
  assert.match(github, /loginOrCreateExternalUser/);
  assert.match(authCore, /INSERT INTO users/);
  assert.match(authCore, /auth\.identity\.link/);
  assert.match(schema, /githubEnabled/);
  assert.match(config, /GITHUB_OAUTH_CLIENT_ID/);
  assert.match(config, /GITHUB_OAUTH_CLIENT_SECRET/);
});

test("personal center exposes locale-specific identities and binds them to one user", async () => {
  const [dashboard, accountRoute, localRoute, usernameRoute, authCore, css] = await Promise.all([
    source("../app/ui/Dashboard.tsx"),
    source("../app/api/auth/account/route.ts"),
    source("../app/api/auth/account/local/route.ts"),
    source("../app/api/auth/username/login/route.ts"),
    source("../app/auth/core.ts"),
    source("../app/console/style.css"),
  ]);
  assert.match(dashboard, /个人中心/);
  assert.match(dashboard, /One account\. Two verified identities/);
  assert.match(dashboard, /账号、手机号与密码/);
  assert.match(dashboard, /intent:\s*"link"/);
  assert.match(dashboard, /currentUser\.accountLocale === "zh"/);
  assert.match(dashboard, /providerHref\("google"\)/);
  assert.match(dashboard, /providerHref\("github"\)/);
  assert.match(accountRoute, /accountIdentitySnapshot/);
  assert.match(localRoute, /verifySmsCode\("phone_bind"/);
  assert.match(localRoute, /bindChineseLocalIdentity/);
  assert.match(usernameRoute, /authenticateUsername/);
  assert.match(usernameRoute, /user\.accountLocale !== "zh"/);
  assert.match(authCore, /auth\.local_identity\.bind/);
  assert.match(authCore, /DELETE FROM auth_sessions WHERE user_id = \?/);
  assert.match(css, /\.identity-status-grid/);
  assert.match(css, /\.identity-form-panel/);
});

test("admin identity settings accept protected SMS credentials and encrypt secret values at rest", async () => {
  const [consoleUi, identityUi, settings, secretBoundary, secretCrypto, store, google, github, sms, schema, config, idMigration, secretMigration, css] = await Promise.all([
    source("../app/admin/AdminConsole.tsx"),
    source("../app/admin/AuthSettingsView.tsx"),
    source("../app/auth/provider-settings.ts"),
    source("../app/auth/secret-store.ts"),
    source("../app/auth/secret-crypto.ts"),
    source("../app/admin/store.ts"),
    source("../app/auth/google.ts"),
    source("../app/auth/github.ts"),
    source("../app/auth/aliyun-sms.ts"),
    source("../db/schema.ts"),
    source("../.env.example"),
    source("../drizzle/0013_fluffy_punisher.sql"),
    source("../drizzle/0014_brief_mandrill.sql"),
    source("../app/admin/style.css"),
  ]);
  assert.match(consoleUi, /登录与身份/);
  assert.match(consoleUi, /AuthSettingsView/);
  assert.match(identityUi, /name="aliyunAccessKeyId"/);
  assert.match(identityUi, /type="password"/);
  assert.match(identityUi, /defaultValue=""/);
  assert.match(identityUi, /name="aliyunAccessKeySecret"/);
  assert.match(identityUi, /name="smsCodePepper"/);
  assert.match(identityUi, /只填写 LTAI\.\.\. 的真实 ID/);
  assert.match(identityUi, /填写真实 AccessKey Secret/);
  assert.match(identityUi, /填写至少 32 位随机值/);
  assert.match(identityUi, /真实值不会回显；留空将保留当前配置/);
  assert.match(identityUi, /querySelectorAll<HTMLInputElement>\('input\[type="password"\]'\)/);
  assert.doesNotMatch(identityUi, /AccessKey ID 变量/);
  assert.doesNotMatch(identityUi, /AccessKey Secret 变量|验证码 Pepper 变量/);
  assert.match(identityUi, /googleClientSecretRef/);
  assert.match(identityUi, /githubClientSecretRef/);
  assert.match(identityUi, /githubCallbackUrl/);
  assert.doesNotMatch(identityUi, /name="clientSecret"/);
  assert.match(settings, /process\.env\[reference\]/);
  assert.match(settings, /const \{ aliyunAccessKeyId, aliyunAccessKeySecret, smsCodePepper, \.\.\.safeSettings \} = settings/);
  assert.match(settings, /sealSecret/);
  assert.match(settings, /openSecret/);
  assert.doesNotMatch(settings, /ALIBABA_CLOUD_ACCESS_KEY_ID/);
  assert.doesNotMatch(settings, /ALIBABA_CLOUD_ACCESS_KEY_SECRET|AUTH_SMS_CODE_PEPPER/);
  assert.match(settings, /saveProviderSettings/);
  assert.match(secretBoundary, /import "server-only"/);
  assert.match(secretCrypto, /aes-256-gcm/);
  assert.match(secretCrypto, /randomBytes\(12\)/);
  assert.match(secretCrypto, /setAAD/);
  assert.match(secretCrypto, /getAuthTag/);
  assert.match(secretCrypto, /AUTH_SETTINGS_ENCRYPTION_KEY/);
  assert.match(store, /auth\.providers\.save/);
  assert.match(store, /aliyunAccessKeyIdConfigured/);
  assert.match(store, /aliyunAccessKeySecretConfigured/);
  assert.match(store, /smsCodePepperConfigured/);
  assert.doesNotMatch(store, /aliyunAccessKeyId:\s*settings\.aliyunAccessKeyId/);
  assert.doesNotMatch(store, /aliyunAccessKeySecret:\s*settings\.aliyunAccessKeySecret/);
  assert.doesNotMatch(store, /smsCodePepper:\s*settings\.smsCodePepper/);
  assert.match(google, /identityProviderSettings/);
  assert.match(github, /identityProviderSettings/);
  assert.match(sms, /identityProviderSettings/);
  assert.match(sms, /accessKeyId = settings\.aliyunAccessKeyId/);
  assert.match(schema, /authProviderSettings/);
  assert.match(schema, /aliyunAccessKeyId/);
  assert.doesNotMatch(schema, /aliyunAccessKeyIdRef/);
  assert.match(schema, /aliyunAccessKeySecretEncrypted/);
  assert.match(schema, /smsCodePepperEncrypted/);
  assert.doesNotMatch(schema, /aliyunAccessKeySecretRef|smsCodePepperRef/);
  assert.match(idMigration, /ADD COLUMN "aliyun_access_key_id" text/);
  assert.match(idMigration, /DROP COLUMN "aliyun_access_key_id_ref"/);
  assert.match(secretMigration, /ADD COLUMN "aliyun_access_key_secret_encrypted" text/);
  assert.match(secretMigration, /ADD COLUMN "sms_code_pepper_encrypted" text/);
  assert.match(secretMigration, /DROP COLUMN "aliyun_access_key_secret_ref"/);
  assert.match(secretMigration, /DROP COLUMN "sms_code_pepper_ref"/);
  assert.match(css, /grid-template-rows: minmax\(14px, auto\) 45px minmax\(12px, auto\)/);
  assert.match(css, /height: 45px; min-height: 45px/);
  assert.doesNotMatch(config, /EVAL_IDENTITY_TENANT_SLUG|EVAL_PUBLIC_CONTENT_TENANT_SLUG|EVAL_PUBLIC_RELEASE_TENANT_SLUG/);
  assert.match(config, /GITHUB_OAUTH_CLIENT_ID/);
  assert.match(config, /AUTH_SETTINGS_ENCRYPTION_KEY/);
  assert.doesNotMatch(config, /ALIBABA_CLOUD_ACCESS_KEY_ID/);
  assert.doesNotMatch(config, /ALIBABA_CLOUD_ACCESS_KEY_SECRET|AUTH_SMS_CODE_PEPPER/);
});

test("public blog exposes only globally published posts", async () => {
  const [indexPage, articlePage, contentStore, schema, migration, config] = await Promise.all([
    source("../app/blog/page.tsx"),
    source("../app/blog/[slug]/page.tsx"),
    source("../app/content/store.ts"),
    source("../db/schema.ts"),
    source("../drizzle/0007_curved_echo.sql"),
    source("../.env.example"),
  ]);
  assert.match(indexPage, /publishedBlogPosts/);
  assert.match(articlePage, /publishedBlogPost/);
  assert.match(contentStore, /p\.status = 'published'/);
  assert.match(contentStore, /p\.published_at IS NOT NULL/);
  assert.doesNotMatch(contentStore, /tenant_id|JOIN tenants|publicContentTenantSlug/);
  assert.doesNotMatch(indexPage + articlePage, /dangerouslySetInnerHTML/);
  assert.match(schema, /blogPosts/);
  assert.match(migration, /CREATE TABLE "blog_posts"/);
  assert.doesNotMatch(config, /EVAL_PUBLIC_CONTENT_TENANT_SLUG/);
});

test("blog and forum preserve the public landing navigation on desktop and mobile", async () => {
  const [header, landing, css] = await Promise.all([
    source("../app/content/ContentHeader.tsx"),
    source("../app/agent/AgentLanding.tsx"),
    source("../app/content/style.css"),
  ]);
  for (const href of ["/#difference", "/#system", "/#audience", "/#downloads", "/blog", "/forum"]) {
    assert.match(header, new RegExp(`href=["']${href.replace("/", "\\/")}["']`));
  }
  assert.match(header, /Eval<\/b><small>Agent System/);
  assert.match(header, /language-switch/);
  assert.match(header, /theme-switch/);
  assert.match(header, /content-mobile-content/);
  assert.match(landing, /agent-mobile-content/);
  assert.match(css, /\.content-header \{ position: fixed/);
  assert.match(css, /@media \(max-width: 1024px\)/);
});

test("forum is session-protected, globally visible, rate-limited, and same-origin written", async () => {
  const [forumPage, topicPage, contentStore, topicRoute, replyRoute, schema, migration, css] = await Promise.all([
    source("../app/forum/page.tsx"),
    source("../app/forum/[slug]/page.tsx"),
    source("../app/content/store.ts"),
    source("../app/api/forum/topics/route.ts"),
    source("../app/api/forum/topics/[id]/replies/route.ts"),
    source("../db/schema.ts"),
    source("../drizzle/0007_curved_echo.sql"),
    source("../app/content/style.css"),
  ]);
  assert.match(forumPage, /requireUserSession/);
  assert.match(topicPage, /requireUserSession/);
  assert.doesNotMatch(contentStore, /tenant_id|JOIN tenants/);
  assert.match(contentStore, /WHERE t\.status <> 'hidden'/);
  assert.match(contentStore, /每小时最多发布 5 个主题/);
  assert.match(contentStore, /每小时最多发布 30 条回复/);
  assert.match(topicRoute, /rejectCrossSiteWrite/);
  assert.match(replyRoute, /rejectCrossSiteWrite/);
  assert.match(topicRoute + replyRoute, /getSessionUser/);
  assert.doesNotMatch(forumPage + topicPage, /dangerouslySetInnerHTML/);
  assert.match(schema, /forumTopics/);
  assert.match(schema, /forumReplies/);
  assert.match(migration, /CREATE TABLE "forum_topics"/);
  assert.match(migration, /CREATE TABLE "forum_replies"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("admin content center publishes blogs and moderates global forum content with audits", async () => {
  const [consoleUi, contentUi, store, landing] = await Promise.all([
    source("../app/admin/AdminConsole.tsx"),
    source("../app/admin/ContentSettingsView.tsx"),
    source("../app/admin/store.ts"),
    source("../app/agent/AgentLanding.tsx"),
  ]);
  assert.match(consoleUi, /内容中心/);
  assert.match(consoleUi, /ContentSettingsView/);
  assert.match(contentUi, /save_blog_post/);
  assert.match(contentUi, /moderate_forum_topic/);
  assert.match(contentUi, /moderate_forum_reply/);
  assert.doesNotMatch(store, /tenant_id|JOIN tenants|memberships/);
  assert.match(store, /UPDATE forum_topics SET status/);
  assert.match(store, /UPDATE forum_replies SET status/);
  assert.match(store, /blog\.post\.(?:create|update)/);
  assert.match(store, /forum\.topic\.moderate/);
  assert.match(store, /forum\.reply\.moderate/);
  assert.match(landing, /href="\/blog"/);
  assert.match(landing, /href="\/forum"/);
  assert.match(landing, /agent-mobile-content/);
});

test("desktop updater exposes only the global verified, version-matched EXE", async () => {
  const [updateRoute, catalog, download, releaseStore, consoleStore, adminUi, landing, upload, artifactStorage, metadata, signature, signingSettings, schema, releaseMigration, settingsMigration, replacementMigration, config, packageJson] = await Promise.all([
    source("../app/api/v1/updates/[target]/[arch]/[currentVersion]/route.ts"),
    source("../app/api/v1/downloads/route.ts"),
    source("../app/api/v1/downloads/[id]/route.ts"),
    source("../app/admin/store.ts"),
    source("../app/console/store.ts"),
    source("../app/admin/AdminConsole.tsx"),
    source("../app/agent/AgentLanding.tsx"),
    source("../app/api/admin/artifacts/route.ts"),
    source("../app/storage/artifacts.ts"),
    source("../app/releases/installer-metadata.ts"),
    source("../app/releases/signature.ts"),
    source("../app/releases/settings.ts"),
    source("../db/schema.ts"),
    source("../drizzle/0009_faulty_lady_deathstrike.sql"),
    source("../drizzle/0010_empty_diamondback.sql"),
    source("../drizzle/0011_peaceful_sebastian_shaw.sql"),
    source("../.env.example"),
    source("../package.json"),
  ]);
  assert.match(updateRoute, /status:\s*204/);
  assert.match(updateRoute, /signature:\s*release\.updater_signature/);
  assert.doesNotMatch(updateRoute, /publicReleaseTenantSlug|tenant_id|JOIN tenants/);
  assert.match(updateRoute, /compareSemver/);
  assert.match(updateRoute, /signature_verified_at IS NOT NULL/);
  assert.match(updateRoute, /signature_key_id = \?/);
  assert.match(updateRoute, /a\.embedded_version = r\.version/);
  assert.match(updateRoute, /a\.format = 'NSIS'/);
  assert.match(updateRoute, /publicReleaseSigningSettings/);
  assert.match(updateRoute, /format:\s*"nsis"/);
  assert.doesNotMatch(updateRoute, /x-eval-installer-format|release_artifacts|MSI/i);
  assert.match(updateRoute, /SELECT latest_r\.id/);
  assert.doesNotMatch(catalog, /JOIN tenants|tenant_id/);
  assert.match(catalog, /latestReleaseId/);
  assert.match(catalog, /a\.format = 'NSIS'/);
  assert.doesNotMatch(catalog, /release_artifacts|MSI|\.msi/i);
  assert.match(catalog, /publicReleaseSigningSettings/);
  assert.match(catalog, /a\.embedded_version = r\.version/);
  assert.match(catalog, /SELECT latest_r\.id/);
  assert.doesNotMatch(download, /JOIN tenants|tenant_id|publicReleaseTenantSlug/);
  assert.match(download, /publicReleaseSigningSettings/);
  assert.match(download, /a\.embedded_version = r\.version/);
  assert.match(download, /a\.format = 'NSIS'/);
  assert.doesNotMatch(download, /release_artifacts|MSI|\.msi/i);
  assert.match(download, /SELECT latest_r\.id/);
  assert.match(releaseStore, /尚未通过当前 Tauri 更新公钥验签/);
  assert.match(releaseStore, /旧的 Tauri 更新公钥验签/);
  assert.match(adminUi, /name="file"/);
  assert.match(adminUi, /name="signature"/);
  assert.match(upload, /verifyUpdaterSignature/);
  assert.match(upload, /requireReleaseSigningSettings/);
  assert.match(upload, /inspectWindowsInstaller/);
  assert.match(upload, /WHERE embedded_version = \?/);
  assert.doesNotMatch(upload, /tenant_id|tenantId/);
  assert.match(upload, /stageArtifactReplacement/);
  assert.match(upload, /UPDATE agent_artifacts SET file_name/);
  assert.match(upload, /replaced: Boolean\(existing\)/);
  assert.match(artifactStorage, /stageArtifactReplacement/);
  assert.match(artifactStorage, /commit:/);
  assert.match(artifactStorage, /rollback:/);
  assert.doesNotMatch(upload, /MSI|\.msi/i);
  assert.match(upload, /signatureFile\.name\.toLowerCase\(\) !== `\$\{file\.name\}\.sig`/);
  assert.match(upload, /updater_signature/);
  assert.match(signature, /@threema\/wasm-minisign-verify/);
  assert.match(signature, /EVAL_UPDATER_PUBLIC_KEY/);
  assert.match(signature, /decodeWrappedSignature/);
  assert.match(signature, /validateUpdaterPublicKey/);
  assert.match(signingSettings, /release_settings/);
  assert.match(signingSettings, /saveReleaseSigningSettings/);
  assert.match(signingSettings, /EVAL_UPDATER_PUBLIC_KEY/);
  assert.match(signingSettings, /source:\s*"database"/);
  assert.match(metadata, /AppInfoParser/);
  assert.match(metadata, /PE\.ProductVersion/);
  assert.doesNotMatch(metadata, /MSI|\.msi/i);
  assert.match(metadata, /mkdtemp/);
  assert.match(schema, /updaterSignature/);
  assert.match(schema, /signatureVerifiedAt/);
  assert.match(schema, /embeddedVersion/);
  assert.match(schema, /releaseSettings/);
  assert.match(schema, /agent_artifacts_embedded_version_uq/);
  assert.match(schema, /artifactCleanupQueue/);
  assert.doesNotMatch(schema, /releaseArtifacts|MSI/);
  assert.match(releaseMigration, /ADD COLUMN "embedded_version" text/);
  assert.match(releaseMigration, /ROW_NUMBER\(\) OVER/);
  assert.match(releaseMigration, /release_versions_one_published_channel_uq/);
  assert.match(settingsMigration, /CREATE TABLE "release_settings"/);
  assert.match(settingsMigration, /updater_public_key_id/);
  assert.match(replacementMigration, /CREATE TABLE "artifact_cleanup_queue"/);
  assert.match(replacementMigration, /ROW_NUMBER\(\) OVER/);
  assert.match(replacementMigration, /UPDATE "release_versions"/);
  assert.match(replacementMigration, /DELETE FROM "agent_artifacts"/);
  assert.match(replacementMigration, /agent_artifacts_tenant_embedded_version_uq/);
  assert.match(releaseStore, /ensureArtifactVersionMatchesRelease/);
  assert.match(releaseStore, /save_release_settings/);
  assert.match(releaseStore, /release\.settings\.save/);
  assert.match(releaseStore, /reusedDraft/);
  assert.doesNotMatch(releaseStore, /当前渠道已存在相同版本号/);
  assert.match(releaseStore, /内部版本.*与发布版本.*不一致/);
  assert.match(releaseStore, /SET status = 'draft'.*channel = \?.*status = 'published'/);
  assert.match(schema, /release_versions_one_published_channel_uq/);
  assert.doesNotMatch(releaseStore, /release_artifacts|STRING_AGG|MSI/i);
  assert.match(consoleStore, /r\.status = 'published' AND r\.channel = 'stable'/);
  assert.match(consoleStore, /LIMIT 1/);
  assert.match(adminUi, /CURRENT DISTRIBUTION/);
  assert.match(adminUi, /更新签名公钥/);
  assert.match(adminUi, /name="updaterPublicKey"/);
  assert.match(adminUi, /save_release_settings/);
  assert.match(adminUi, /不要在这里填写签名私钥/);
  assert.match(adminUi, /官网直接下载/);
  assert.match(adminUi, /客户端直接升级/);
  assert.match(adminUi, /历史版本转为私有/);
  assert.match(adminUi, /已有同版本草稿会直接更新并转为正式发布/);
  assert.match(adminUi, /保存并应用发布设置/);
  assert.doesNotMatch(adminUi, /MSI|\.msi/i);
  assert.doesNotMatch(landing, /MSI|\.msi/i);
  assert.doesNotMatch(adminUi, /function ArtifactsView|function ReleasesView/);
  assert.match(packageJson, /@h-t-m\/app-inspect/);
  assert.doesNotMatch(config, /EVAL_PUBLIC_RELEASE_TENANT_SLUG/);
  assert.match(config, /EVAL_UPDATER_PUBLIC_KEY/);
});

test("minisign verifier accepts authentic bytes and rejects modified bytes", async () => {
  const minisign = await import("@threema/wasm-minisign-verify");
  const keyText = "untrusted comment: minisign public key 60DF2F3B621B4533\nRWQzRRtiOy/fYNCli5tW96CO6R+FnO92LceeIoWlCLj+BTVe+6q8T69M";
  const signatureText = "untrusted comment: signature from minisign secret key\nRWQzRRtiOy/fYEU/vGHUEfBg+lSmrdpViX3l9fX1Ps6FMBrBcsMw9uxsLPFr9pAMdKy1NVEX3MsHsuCKlSVNYc4C5/pCnU/Kugk=\ntrusted comment: timestamp:1634045550\tfile:test.txt\nzEHzYWS0L/lFlN3hfMdAJA0MsVfazBXbwSw9XihxQ0msFQPlC30F6Ajvxi67KEFNd1GUhdi3DcslssTW8MUECQ==";
  const publicKey = minisign.PublicKey.decode(keyText);
  const signature = minisign.Signature.decode(signatureText);
  try {
    assert.equal(publicKey.verify(new TextEncoder().encode("test\n"), signature), true);
  } finally {
    signature.free();
    publicKey.free();
  }
  const invalidPublicKey = minisign.PublicKey.decode(keyText);
  const invalidSignature = minisign.Signature.decode(signatureText);
  assert.throws(() => invalidPublicKey.verify(new TextEncoder().encode("modified\n"), invalidSignature));

  const wrappedSignatureText = Buffer.from(signatureText, "utf8").toString("base64");
  const wrappedPublicKey = minisign.PublicKey.decode(keyText);
  const wrappedSignature = minisign.Signature.decode(Buffer.from(wrappedSignatureText, "base64").toString("utf8"));
  try {
    assert.equal(wrappedPublicKey.verify(new TextEncoder().encode("test\n"), wrappedSignature), true);
  } finally {
    wrappedSignature.free();
    wrappedPublicKey.free();
  }
});

test("desktop account binding uses browser approval and hashed revocable device sessions", async () => {
  const [desktop, schema, approve, token, me, devicePage, login, google] = await Promise.all([
    source("../app/auth/desktop.ts"),
    source("../db/schema.ts"),
    source("../app/api/auth/desktop/approve/route.ts"),
    source("../app/api/auth/desktop/token/route.ts"),
    source("../app/api/auth/desktop/me/route.ts"),
    source("../app/device/page.tsx"),
    source("../app/login/page.tsx"),
    source("../app/auth/google.ts"),
  ]);
  assert.match(desktop, /device_code_hash/);
  assert.match(desktop, /user_code_hash/);
  assert.match(desktop, /token_hash/);
  assert.match(desktop, /MAX_REQUESTS_PER_HOUR/);
  assert.match(desktop, /eval_dt_/);
  assert.doesNotMatch(desktop, /password/i);
  assert.match(schema, /desktopAuthRequests/);
  assert.match(schema, /desktopSessions/);
  assert.match(approve, /rejectCrossSiteWrite/);
  assert.match(approve, /cookieToken/);
  assert.match(token, /exchangeDesktopAuthorization/);
  assert.match(me, /bearerToken/);
  assert.match(devicePage, /getSessionUser/);
  assert.match(login, /returnTo/);
  assert.match(google, /return_path/);
});
