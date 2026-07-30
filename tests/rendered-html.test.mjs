import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("keeps the public landing page and protected consoles separated", async () => {
  const [home, consolePage, adminPage, authServer] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/console/page.tsx"),
    source("../app/admin/page.tsx"),
    source("../app/auth/server.ts"),
  ]);
  assert.match(home, /<AgentLanding\s*\/>/);
  assert.match(consolePage, /requireEmailSession/);
  assert.match(adminPage, /requireAdminSession/);
  assert.match(authServer, /tenant_admin/);
  assert.match(authServer, /platform_admin/);
  assert.match(authServer, /redirect\("\/console"\)/);
});

test("admin control room exposes governed modules and audit logs without a side navigation", async () => {
  const [consoleSource, css] = await Promise.all([
    source("../app/admin/AdminConsole.tsx"),
    source("../app/admin/style.css"),
  ]);
  for (const label of ["运营看板", "用户管理", "LLM 配置", "工具源文件", "版本升级", "收费配置"]) {
    assert.match(consoleSource, new RegExp(label));
  }
  assert.match(consoleSource, /审计日志/);
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
