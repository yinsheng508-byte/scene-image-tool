# macOS Release Signing Runbook

> 当前状态：发布准备已落地；真实 signed + notarized dmg/zip 需要 Apple Developer 证书和 notarization secrets。

## Required Secrets

GitHub Actions 需要配置以下两组之一的 notarization 凭据，以及签名证书：

```text
MAC_CSC_LINK
MAC_CSC_KEY_PASSWORD
APPLE_TEAM_ID
```

Notarization 推荐使用 App Store Connect API key：

```text
APPLE_API_KEY
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

也可使用 Apple ID app-specific password：

```text
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
```

不要把上述值写进 Git、文档正文、issue、PR 描述或日志。

## Local Preflight

```bash
cd ~/dev/scene-image-tool
npm --prefix code/desktop run signing:mac:check
```

当前本机如果没有 Developer ID 证书和 Apple notarization 环境变量，预检应失败，并给出缺失项。

## Local Signed Build

证书和 notarization 环境变量准备好后：

```bash
cd ~/dev/scene-image-tool
npm --prefix code/desktop run resources:check
npm --prefix code/desktop run dist:mac
```

`dist:mac` 会先执行 signing preflight，再通过 electron-builder 生成 signed + notarized dmg/zip。日常开发仍使用 unsigned 路径：

```bash
npm --prefix code/desktop run dist:mac:dir
```

## Verification

```bash
APP_PATH="$(find code/desktop/dist -maxdepth 3 -name '*.app' -type d | head -n 1)"
codesign --verify --deep --strict "$APP_PATH"
spctl --assess --type execute "$APP_PATH"
```

## GitHub Workflow

`.github/workflows/macos-release.yml` 由 `v*` tag 或手动 workflow dispatch 触发。它会：

1. 安装 Node 22 依赖。
2. 检查 runtime resources。
3. 检查 macOS signing / notarization 环境。
4. 生成 signed + notarized dmg/zip。
5. 执行 `codesign` 和 `spctl` 验证。
6. 上传 workflow artifact。

在 Apple 证书和 secrets 配置完成前，不应把该 workflow 设为普通 PR 必需检查。
