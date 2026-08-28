# macOS 发布与自动更新说明

## 目标

Eval Agent 的 macOS 发布同时支持：

- 使用 ad-hoc 签名构建并通过 DMG 提供首次安装，不强制要求 Apple Developer ID。
- 使用独立于 Windows 的 Tauri 更新密钥，对 macOS 自动更新包签名和验签。
- 按 Apple Silicon、Intel 或 Universal 架构发布安装包。
- 通过现有动态更新接口完成版本检查、下载、安装和重启。

Apple 代码签名与 Tauri 更新签名是两套独立机制。没有 Apple Developer ID 不影响生成免费的 Tauri 更新密钥，也不影响自动更新包签名。未经过 Developer ID 签名和 Apple 公证的 DMG 首次打开时，仍可能被 Gatekeeper 拦截。

## 密钥隔离

Windows 与 macOS 必须使用不同的 Tauri 更新密钥：

| 平台 | 服务端配置标识 | 环境变量后备 | 用途 |
| --- | --- | --- | --- |
| Windows | `windows` | `EVAL_UPDATER_PUBLIC_KEY` | 验证 NSIS `.exe.sig` |
| macOS | `darwin` | `EVAL_MACOS_UPDATER_PUBLIC_KEY` | 验证 `.app.tar.gz.sig` |

管理后台和数据库只保存公钥及其指纹。私钥不得上传到 Web 服务、数据库、DMG 或代码仓库，只能永久保存在构建机、密码管理系统或 CI Secret 中。

现有数据库中标识为 `global` 的历史公钥会自动迁移为 Windows 公钥，不会自动复制给 macOS。

## 首次生成 macOS 更新密钥

在受保护的 Mac 构建机上生成一次密钥：

```bash
npm run tauri signer generate -- -w ~/.tauri/eval-macos.key
```

生成后：

1. 永久备份私钥和私钥密码。
2. 将公钥内容写入 macOS 客户端的 Tauri updater `pubkey` 配置。
3. 在 Web 管理后台“版本发布”中保存同一个 macOS 公钥。
4. 不要为每个版本重新生成密钥。

如果首个公开版本内置的公钥与服务器配置不一致，自动更新包即使上传成功，客户端也无法安装。

## macOS 客户端打包配置

macOS 客户端需要启用更新产物：

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "MACOS_UPDATER_PUBLIC_KEY_CONTENT",
      "endpoints": [
        "https://eval.zailink.space/api/v1/updates/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

构建前只在构建进程环境中提供私钥：

```bash
export TAURI_SIGNING_PRIVATE_KEY="/secure/path/eval-macos.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-private-key-password"
npm run tauri build
```

不要把私钥变量放进前端可读取的 Vite 环境变量或提交到 `.env` 文件。

正常构建应至少生成：

```text
Eval.dmg
Eval.app.tar.gz
Eval.app.tar.gz.sig
```

DMG 用于首次安装；`.app.tar.gz` 和 `.sig` 用于 Tauri 自动更新。

## 管理后台发布流程

1. 在“macOS 更新签名公钥”区域保存 Mac 公钥。
2. 在“直接上传 macOS DMG”区域选择架构、填写版本并上传 DMG。
3. 在“上传 macOS 自动更新包”区域选择相同架构和版本，上传 `.app.tar.gz`。
4. 同时上传严格同名的 `.app.tar.gz.sig`，例如：

   ```text
   Eval.app.tar.gz
   Eval.app.tar.gz.sig
   ```

5. 确认 DMG、APP_TAR_GZ 的版本和架构一致后发布。

只上传 DMG 也可以公开下载，但不会向已安装的 Mac 客户端提供自动更新。上传签名更新包并重新应用同版本发布设置后，自动更新才会生效。

服务端会执行以下校验：

- DMG、更新包文件类型与大小。
- 更新包内 `CFBundleShortVersionString`。
- Mach-O 实际架构与上传时选择的架构。
- `.sig` 文件名、内容与 macOS 公钥验签结果。
- 发布版本与安装包内部版本一致。
- 更新包公钥指纹属于 `darwin`，不会使用 Windows 公钥兜底。

## 更新接口行为

macOS 客户端使用以下接口：

```text
GET /api/v1/updates/darwin/aarch64/{current_version}?channel=stable
GET /api/v1/updates/darwin/x86_64/{current_version}?channel=stable
```

存在更高版本且更新包由当前 Mac 公钥验签时，接口返回：

```json
{
  "version": "0.1.2",
  "url": "https://eval.zailink.space/api/v1/downloads/artifact_id",
  "signature": "contents-of-app-tar-gz-sig",
  "format": "app",
  "architecture": "aarch64"
}
```

没有更新、没有签名更新包、公钥未配置或指纹不匹配时返回 `204 No Content`。Universal 更新包可以作为 Apple Silicon 和 Intel 没有精确架构产物时的后备。

## 密钥变更与轮换

同一平台的 `updater.pub` 不能按版本随意更换。服务端虽然会按指纹阻止错误密钥产物发布，但旧客户端仍只信任其安装时内置的公钥。

需要轮换 Mac 密钥时：

1. 保留旧私钥 A。
2. 构建一个内置新公钥 B 的过渡版本。
3. 使用旧私钥 A 对该过渡更新包签名，使旧客户端能够安装。
4. 用户升级到过渡版本后，后续更新包改用新私钥 B 签名。
5. 确认迁移完成前，不得删除旧私钥 A。

如果旧私钥已经丢失，无法通过 Tauri 自动更新完成轮换；用户必须手动下载安装内置新公钥的 DMG。

Windows 与 macOS 密钥彼此隔离，轮换 Mac 密钥不会影响 Windows，反之亦然。

## 发布前验证

正式公开首个 Mac 版本前，至少完成一次真实的 `0.1.1 → 0.1.2` 验证：

1. 安装公开候选版 `0.1.1` DMG。
2. 使用同一 Mac 私钥构建 `0.1.2`。
3. 上传 `0.1.2` DMG、APP_TAR_GZ 和 SIG 并发布。
4. 确认 `0.1.1` 能检查到 `0.1.2`。
5. 确认下载进度、签名校验、安装和重启全部成功。
6. 确认应用重启后版本为 `0.1.2`，用户数据与登录状态未丢失。
7. 分别测试 Apple Silicon 和 Intel；Universal 包也要验证回退逻辑。

## 相关资料

- [Tauri Updater 官方说明](https://v2.tauri.app/plugin/updater/)
- [Tauri 配置文件与平台专用配置](https://v2.tauri.app/develop/configuration-files/)

