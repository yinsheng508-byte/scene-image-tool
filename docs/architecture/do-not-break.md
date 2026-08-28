# 禁区：不能改回去的逻辑

> 修改已有代码前必读。这里记录看起来复杂但有原因的实现。

## 受保护的实现

| 位置 | 看起来复杂的地方 | 不能改的原因 | 如果改了会怎样 |
|---|---|---|---|
| `code/desktop/main.js:createMainWindow` | `contextIsolation: true` 且 `nodeIntegration: false` | 渲染进程安全边界依赖 preload 白名单 | 打开 Node 集成会扩大攻击面 |
| `code/desktop/preload.js` | 所有能力通过 `contextBridge` 暴露 | 主进程能力需要集中白名单 | UI 直接访问 Electron 会破坏边界 |
| `shell:openExternal` / `shell:openPath` | renderer 只能请求，主进程必须校验 URL scheme 和路径来源 | preload 暴露的是能力入口，不是信任边界 | renderer 注入会扩大到任意外链或本地路径打开 |
| `code/desktop/main.js` Office / LibreOffice 转换链路 | 存在 safe copy、超时、fallback、进程终止和错误码 | 兼容 Windows、非 ASCII 路径、Office COM 卡顿 | 导出失败、卡死或无法取消 |
| `code/desktop/platform/*/process-tree.js` 和 `platform/common/process-utils.js` | 导出取消通过 platform process adapter 终止活跃进程 | macOS 和 Windows 的进程树终止语义不同，不能在 UI 或转换逻辑里散落平台判断 | macOS 误调 `taskkill`、Windows 丢失 `/T /F`，导致取消失败或残留 Office / LO 进程 |
| `code/desktop/scripts/*.ps1` | PowerShell 输出 JSON 和错误码 | 主进程依赖结构化输出解析 | 错误提示和重试策略失效 |
| `code/desktop/shared/font-config.mjs`、`text-layout.mjs` | 字体映射和文字布局被主进程/渲染进程共享 | 保证拼图预览和导出一致 | 字体回退、文字位置不一致 |
| `code/desktop/main.js` 字体探针 | 不只看 `registerFont()` 成功 | 注册成功不代表真实可渲染 | 导出字体悄悄回退 |
| `code/desktop/shared/puzzle-render-spec.mjs` | 阴影、坑位、裁剪、图层规则集中定义 | 预览和导出需要共享同一规范 | 阴影遮挡、导出与预览不一致 |
| `code/desktop/renderer/puzzle/index.js` 多文件夹状态 | 同时支持逐拼图和子文件夹批量模式 | 业务规则复杂，旧状态需要兼容 | 生成数量和输出目录错乱 |
| `code/desktop/renderer/puzzle/index.js` 文字编辑焦点处理 | 颜色选择器和文字编辑态有特殊处理 | 历史上 Delete / blur / Pickr 交互出过问题 | 文本编辑态卡住或误删 |
| `code/desktop/main.js` 飞书上传排序 | 图片和笔记顺序有显式排序 | 写入顺序是业务语义 | 飞书记录附件错位 |

## 业务规则硬约束

| 规则 | 原因 | 涉及位置 |
|---|---|---|
| 授权和版本检查走 `license:*` IPC | 统一设备、密钥、版本状态 | `code/desktop/main.js`、`renderer/license/*` |
| 文档导出必须支持取消 | 用户可能批量处理大文件 | `convert:documents`、`convert:cancel` |
| 导出取消必须走 platform process adapter | 终止方式与平台强相关，且后续需要扩展 process group | `code/desktop/main.js`、`code/desktop/platform/*/process-tree.js` |
| 飞书上传必须支持取消 | 上传可能耗时且有失败重试 | `feishu:uploadImages`、`feishu:cancel` |
| 小红书下载必须支持取消 | 网络图片下载可能长时间阻塞 | `xhs:download`、`xhs:cancel` |
| 拼图导出不能超过像素上限 | 防止内存爆掉 | `puzzle:generate`、`puzzle:renderExportPreview` |
| 当前应用入口固定为 `code/desktop/` | 避免恢复历史双入口 | README、架构文档、npm 命令 |

## 已踩过的坑

| 坑的描述 | 当时发生了什么 | 正确做法 | 涉及位置 |
|---|---|---|---|
| 历史文档平铺导致当前事实不清 | 后续开发需要在几十篇方案中猜状态 | 当前事实写入 `docs/current` 和 `docs/architecture` | 文档结构 |
| 构建产物进入 Git | `dist2` 和运行时导致仓库巨大 | 忽略并从索引移除明确产物 | Git / `.gitignore` |
| 只按模板 `.gitignore` 覆盖 | 模板只忽略 `.DS_Store`，不适合 Electron | 按本项目重新设计 ignore | Phase 2 |
| 在 dirty worktree 中大规模迁移 | 容易覆盖用户已有改动 | 先建分支和快照，只 stage 当前阶段文件 | Phase 0 |
