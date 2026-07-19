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

test("admin control room exposes the six governed modules without a side navigation", async () => {
  const [consoleSource, css] = await Promise.all([
    source("../app/admin/AdminConsole.tsx"),
    source("../app/admin/style.css"),
  ]);
  for (const label of ["运营看板", "用户管理", "LLM 配置", "工具源文件", "版本升级", "收费配置"]) {
    assert.match(consoleSource, new RegExp(label));
  }
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
