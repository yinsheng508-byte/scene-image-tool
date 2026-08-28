# 业务闸口 / 网关地图

> 涉及用户流程、授权、登录、导出、上传、下载和取消任务时必读。不要绕过统一入口。

## 闸口列表

| 闸口名 | 职责 | 实现位置 | 绕过后果 | 备注 |
|---|---|---|---|---|
| 授权配置读取 | 获取授权状态、免费次数、版本信息 | `code/desktop/main.js`、`renderer/license/index.js` | UI 状态与真实授权不一致 | `license:getConfig` |
| 授权验证 | 远端验证密钥并绑定设备 | `code/desktop/main.js` | 未授权用户绕过限制或合法用户无法使用 | `license:verify` |
| 版本检查 | 检查更新并跳转下载 | `code/desktop/main.js`、`license/*` | 用户无法获得强制更新提示 | `license:checkUpdate` |
| 微信验证码登录 | 验证公众号验证码登录状态 | `code/desktop/main.js`、`wechat-login.js` | 登录态判断失真 | `wechat:*` |
| 文件选择 | 所有文件/文件夹选择统一由主进程完成 | `code/desktop/main.js`、`preload.js` | 渲染进程权限扩大，安全边界被破坏 | `dialog:*` |
| Shell 打开 | 打开外部链接或本地路径必须由主进程校验 | `code/desktop/main.js`、`preload.js` | renderer 注入后可能打开任意 URL 或路径 | `shell:openExternal`、`shell:openPath` |
| 文档导出预检 | 导出前检查 LibreOffice / Office 环境 | `code/desktop/main.js`、`renderer.js` | 导出卡死、失败信息不可解释 | `export:healthCheck` 为新导出预检入口，`office:healthCheck` 仅为历史 LibreOffice alias；后续平台诊断读 `capability:getAll` |
| 文档导出执行 | 扫描结果转 PDF 再渲染图片 | `code/desktop/main.js` | 进度、错误、取消和输出结构失控 | `convert:documents` |
| 文档导出取消 | 请求取消并终止活跃转换进程 | `code/desktop/main.js` | 长任务无法停止，残留 Office / LO 进程 | `convert:cancel` |
| 拼图生成 | 批量生成成品图并做字体/像素检查 | `code/desktop/main.js`、`puzzle/index.js` | 预览与导出不一致，资源路径失控 | `puzzle:generate` |
| 拼图模板存储 | 读写模板和资源引用 | `code/desktop/main.js` | 模板丢失或引用到外部不稳定路径 | `puzzle:loadTemplates`、`puzzle:saveTemplates` |
| 飞书上传执行 | 上传文件并批量写入附件字段 | `code/desktop/main.js`、`renderer.js` | 行号、字段、附件写入错乱 | `feishu:uploadImages` |
| 飞书上传取消 | 停止批量上传 | `code/desktop/main.js` | 用户取消无效，进度状态不可信 | `feishu:cancel` |
| 小红书下载执行 | 根据提取链接下载图片 | `code/desktop/main.js`、`renderer.js` | 下载目录、referer、格式处理不一致 | `xhs:download` |
| 小红书下载取消 | 停止下载队列 | `code/desktop/main.js` | 长任务无法停止 | `xhs:cancel` |

## 核心约束

- 渲染进程不得直接访问 Node 文件系统和 shell 能力。
- preload 暴露 shell 类能力后，主进程仍必须做 URL scheme / 路径来源校验，不能只依赖 renderer 校验。
- 授权、导出、上传、下载等长任务必须有可解释错误和取消路径。
- 导出预检失败时，UI 可以提示修复或切换引擎，但不能直接绕过主进程兜底。
- 非 Windows 平台的 Office COM 预检必须在主进程返回 `PLATFORM_UNSUPPORTED`，不能进入 PowerShell。
- 飞书写入顺序和图片排序属于业务语义，不能只按文件系统默认顺序处理。
