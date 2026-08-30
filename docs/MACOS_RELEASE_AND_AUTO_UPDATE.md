# macOS DMG 发布说明

## 当前发布策略

当前 Web 管理端只接受一个 macOS DMG，不接受 `.app.tar.gz`、`.sig` 或其他 Mac 发布文件。

公开下载页固定显示两个产品入口：

- Windows EXE
- macOS DMG

macOS 不再按 Apple Silicon 和 Intel 展示两个空槽位。如果数据库中存在多个架构的 DMG，公开页只选择一个：Universal 优先，其次 Apple Silicon，最后 Intel。

## Apple 签名

DMG 可以继续使用免费的 ad-hoc 签名，不强制要求 Apple Developer ID。没有 Developer ID 签名和 Apple 公证时，Gatekeeper 可能在首次打开时提示无法验证开发者，用户需要在系统设置中手动允许。

## 管理员上传流程

1. 在管理后台进入“版本发布”。
2. 找到“直接上传 macOS DMG”。
3. 填写显示名称和语义化版本号。
4. 选择 DMG 对应架构。
5. 只上传 `.dmg` 文件。
6. 保存并公开发布该版本。

DMG 不需要上传：

- Apple Developer ID
- Tauri `updater.pub`
- Tauri 私钥
- `.sig`
- `.app.tar.gz`

同一版本、平台、架构和格式的 DMG 再次上传时会替换原文件；内容未变化时复用现有文件。

## 用户升级方式

macOS 当前采用手动升级：

1. 用户从官网或控制台下载最新 DMG。
2. 打开 DMG。
3. 使用新版本应用替换旧版本。

Windows 的签名自动更新保持不变。

## 关于 Tauri 自动更新

标准 Tauri macOS 自动更新不能直接使用 DMG，必须提供 `.app.tar.gz` 和 `.app.tar.gz.sig`。由于当前管理员上传策略明确只接受 DMG，因此 macOS 自动更新暂时停用。

服务端数据模型仍保留未来扩展空间，但管理界面和管理员上传接口均不开放 Mac 更新归档。未来如果重新启用，需要同时恢复：

- Mac 独立 `updater.pub` 配置入口
- `.app.tar.gz` 与 `.sig` 上传入口
- Mac 更新产物验签与发布流程
- `0.1.1 → 0.1.2` 真机升级测试

私钥无论何时都不得上传到 Web 服务器或代码仓库。

