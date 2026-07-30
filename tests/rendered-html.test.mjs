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
  assert.match(download, /env\.RELEASES\.get/);
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
