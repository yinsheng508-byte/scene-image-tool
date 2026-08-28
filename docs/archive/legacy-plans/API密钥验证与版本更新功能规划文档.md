# API密钥验证与版本更新功能 - 完整规划文档

> 文档版本: 1.0.0
> 创建日期: 2025-01-29
> 项目: 流量蜂虚拟笔记工具 (biji_tool)

---

## 一、功能概述

### 1.1 核心目标

1. **API密钥验证**: 用户需要有效密钥才能使用核心功能
2. **免费试用机制**: 每个功能模块提供 5 次免费试用
3. **版本更新检测**: 每 7 天自动检查新版本并提示更新
4. **UI重构**: 将"运行日志"升级为"设置"页面

### 1.2 技术规格

| 配置项 | 值 |
|--------|-----|
| API服务地址 | https://key.liuliangfeng.com |
| 验证接口 | POST /api/verify |
| 应用标识 (app_id) | biji_tool |
| 验证轮询周期 | 7 天 |
| 免费试用次数 | 每模块 5 次 |

---

## 二、系统架构

### 2.1 整体流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                           应用启动                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   读取本地缓存配置        │
                    │   (license-config.json)  │
                    └─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
           ┌───────────────┐           ┌───────────────┐
           │   有密钥缓存   │           │   无密钥缓存   │
           └───────────────┘           └───────────────┘
                    │                           │
                    ▼                           ▼
           ┌───────────────┐           ┌───────────────┐
           │ 检查是否需要   │           │  进入试用模式  │
           │ 重新验证(7天)  │           │  (各模块3次)   │
           └───────────────┘           └───────────────┘
                    │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
   ┌─────────────┐   ┌─────────────┐
   │  需要验证    │   │  无需验证    │
   │  调用API     │   │  使用缓存    │
   └─────────────┘   └─────────────┘
          │
          ▼
   ┌─────────────────────────────────┐
   │  验证结果处理                    │
   │  - 成功: 更新缓存, 检查版本更新   │
   │  - 失败: 提示错误, 进入试用模式   │
   │  - 网络异常: 使用缓存或试用模式   │
   └─────────────────────────────────┘
```

### 2.2 文件结构变更

```
desktop/
├── main.js                      # [修改] 新增 IPC 处理
├── preload.js                   # [修改] 暴露 licenseAPI
├── renderer/
│   ├── index.html               # [修改] Tab重构 + 弹窗结构
│   ├── styles.css               # [修改] 新增设置页/弹窗样式
│   ├── renderer.js              # [修改] 授权逻辑 + 拦截
│   ├── compose.js               # [修改] 添加执行拦截
│   ├── license/                 # [新增] 授权管理模块
│   │   ├── index.js             # 授权管理器主类
│   │   ├── device-id.js         # 设备ID生成
│   │   └── ui.js                # 弹窗UI控制
│   └── puzzle/
│       └── index.js             # [修改] 添加执行拦截
├── assets/
│   └── wechat-qrcode.png        # [新增] 微信二维码占位图
└── package.json                 # [确认] version 字段准确
```

---

## 三、数据结构设计

### 3.1 本地配置文件

**存储位置**: `app.getPath('userData')/license-config.json`

```json
{
  "deviceId": "a1b2c3d4e5f6...",
  "license": {
    "key": "LLF-XXXX-XXXX-XXXX",
    "lastVerifyTime": "2025-01-29T10:00:00.000Z",
    "expireAt": "2025-12-31 23:59:59",
    "verifyResult": {
      "success": true,
      "message": "验证成功"
    }
  },
  "freeUsage": {
    "export": 5,
    "compose": 5,
    "puzzle": 5,
    "upload": 5,
    "xhs": 5
  },
  "update": {
    "skippedVersion": null,
    "lastCheckTime": "2025-01-29T10:00:00.000Z"
  }
}
```

### 3.2 API 请求结构

**请求体**:
```json
{
  "key": "LLF-XXXX-XXXX-XXXX",
  "device_id": "md5_hash_string",
  "app_id": "biji_tool",
  "app_version": "1.0.0"
}
```

**响应体 (成功)**:
```json
{
  "success": true,
  "message": "验证成功",
  "expire_at": "2025-12-31 23:59:59",
  "update": {
    "has_update": true,
    "latest_version": "1.2.0",
    "download_url": "https://example.com/download",
    "update_log": "1. 新增功能\n2. 修复问题"
  }
}
```

**响应体 (失败)**:
```json
{
  "success": false,
  "message": "密钥已过期",
  "update": null
}
```

> 注: 失败响应不包含 `expire_at` 字段

### 3.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 验证是否成功 |
| message | string | 结果消息 |
| expire_at | string | 密钥到期时间，北京时间，格式 `YYYY-MM-DD HH:mm:ss`，仅成功时返回 |
| update | object \| null | 版本更新信息 |

---

## 四、UI 设计规范

### 4.1 Tab 导航改造

**改造前**:
```
[文档导出] [场景化排版] [拼图排版] [飞书上传] [小红书下载] [运行日志]
                                                        data-tab="logs"
```

**改造后**:
```
[文档导出] [场景化排版] [拼图排版] [飞书上传] [小红书下载] [设置]
                                                        data-tab="settings"
```

**Tab 按钮样式**: 沿用现有设计，仅更换图标为齿轮图标

### 4.2 设置页面布局

```
┌──────────────────────────────────────────────────────────────────────┐
│  设置                                                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ 授权管理 ─────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  授权密钥  [____________________________] [👁]  [验证]         │  │
│  │                                                                │  │
│  │  ● 已激活，有效期至 2025-12-31                                  │  │
│  │  ○ 未激活                                                      │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 版本信息 ─────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  当前版本    v1.0.0                      [检查更新]            │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ 运行日志 ─────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  日志级别  [全部 ▼]                              [清空日志]    │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │ 2025-01-29 10:00:01  [INFO]  应用启动成功                │ │  │
│  │  │ 2025-01-29 10:00:02  [INFO]  密钥验证通过                │ │  │
│  │  │ ...                                                      │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 授权提示弹窗

**触发条件**:
- 用户点击功能按钮，但该模块免费次数已用完且未激活密钥

**弹窗设计**:
```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                      🔐 请激活授权                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                  ┌────────────────────┐                      │
│                  │                    │                      │
│                  │    [二维码图片]     │                      │
│                  │     200 x 200      │                      │
│                  │                    │                      │
│                  └────────────────────┘                      │
│                                                              │
│              扫码添加微信，获取授权密钥                        │
│                                                              │
│  ─────────────────────────────────────────────────────────   │
│                                                              │
│  授权密钥  [____________________________]                    │
│                                                              │
│  ⚠️ 密钥无效，请检查后重试              (错误时显示)          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                              [取消]    [验证并激活]           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**样式规范**:
- 弹窗宽度: 420px
- 圆角: 20px (var(--radius-lg))
- 背景: 毛玻璃遮罩 (rgba(15, 23, 42, 0.5) + backdrop-filter: blur(4px))
- 动画: scale(0.95) → scale(1) + fadeIn
- 按钮: 沿用现有 .btn-primary 样式

### 4.4 版本更新弹窗

**触发条件**:
- 验证接口返回 `update.has_update === true`
- 且版本号未被用户跳过

**弹窗设计**:
```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                      🔔 发现新版本                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│      当前版本  v1.0.0    →    最新版本  v1.2.0               │
│                                                              │
│  ─────────────────────────────────────────────────────────   │
│                                                              │
│  📝 更新内容                                                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. 新增数据导出功能                                     │  │
│  │ 2. 修复启动崩溃问题                                     │  │
│  │ 3. 优化内存占用                                         │  │
│  │ 4. 界面细节调整                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [ ] 不再提示此版本                                          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                          [稍后提醒]    [立即更新]             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**"立即更新"行为**:
1. 打开中转页面 (需要你提供 URL，格式如: `https://your-site.com/download?v={version}`)
2. 如未提供中转页，则使用 API 返回的 `download_url`

### 4.5 Toast 提示

**试用提醒 (执行功能时)**:
```
┌─────────────────────────────────────────────────┐
│  ⚠️  试用中，该功能剩余 2 次免费使用机会         │
└─────────────────────────────────────────────────┘
```

**最后一次试用**:
```
┌─────────────────────────────────────────────────┐
│  ⚠️  这是该功能最后一次免费试用                  │
└─────────────────────────────────────────────────┘
```

---

## 五、功能模块拦截设计

### 5.1 拦截策略

**策略**: 用户可以自由切换 Tab 浏览界面，但在点击"执行"按钮时进行拦截检查

### 5.2 拦截点清单

| 模块 | 文件 | 拦截的按钮/操作 | 按钮ID |
|------|------|----------------|--------|
| 文档导出 | renderer.js | 开始导出 | #convertBtn |
| 场景化排版 | compose.js | 下载全部 | #downloadAllBtn |
| 拼图排版 | puzzle/index.js | 生成图片 | #puzzleGenerateBtn |
| 飞书上传 | renderer.js | 开始上传 | #uploadBtn |
| 小红书下载 | renderer.js | 开始下载 | #xhsStartBtn |

### 5.3 拦截逻辑伪代码

```javascript
async function checkAccess(moduleId) {
  // moduleId: 'export' | 'compose' | 'puzzle' | 'upload' | 'xhs'

  const status = await licenseManager.getStatus();

  // 1. 已激活密钥 → 放行
  if (status.isVerified) {
    return true;
  }

  // 2. 检查该模块免费次数
  const freeCount = status.freeUsage[moduleId];

  if (freeCount > 0) {
    // 扣减次数
    await licenseManager.decrementFreeUsage(moduleId);

    // 提示剩余次数
    const remaining = freeCount - 1;
    if (remaining > 0) {
      showToast(`试用中，该功能剩余 ${remaining} 次免费使用`, 'warning');
    } else {
      showToast('这是该功能最后一次免费试用', 'warning');
    }
    return true;
  }

  // 3. 免费次数用完 → 弹出授权弹窗
  licenseManager.showLicenseModal();
  return false;
}
```

---

## 六、主进程 IPC 接口设计

### 6.1 接口清单

| 接口名称 | 方向 | 参数 | 返回值 | 说明 |
|----------|------|------|--------|------|
| license:getDeviceId | R→M | 无 | string | 获取设备唯一标识 |
| license:verify | R→M | { key } | VerifyResult | 验证密钥 |
| license:getConfig | R→M | 无 | ConfigData | 读取本地配置 |
| license:saveConfig | R→M | ConfigData | boolean | 保存本地配置 |
| license:checkUpdate | R→M | 无 | UpdateInfo | 检查版本更新 |
| app:getVersion | R→M | 无 | string | 获取应用版本号 |
| shell:openExternal | R→M | { url } | void | 打开外部链接 |

> R→M: 渲染进程 → 主进程

### 6.2 主进程实现要点

```javascript
// main.js 新增内容

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');

// 配置文件路径
const CONFIG_PATH = path.join(app.getPath('userData'), 'license-config.json');

// 生成设备ID
function generateDeviceId() {
  const networkInterfaces = os.networkInterfaces();
  const hostname = os.hostname();
  const platform = os.platform();

  // 获取第一个非内部网卡的 MAC 地址
  let mac = '';
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (!net.internal && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }

  const uniqueString = `${mac}-${hostname}-${platform}`;
  return crypto.createHash('md5').update(uniqueString).digest('hex');
}

// 验证密钥
async function verifyLicense(key, deviceId, appVersion) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      key: key,
      device_id: deviceId,
      app_id: 'biji_tool',
      app_version: appVersion
    });

    const options = {
      hostname: 'key.liuliangfeng.com',
      port: 443,
      path: '/api/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('响应解析失败'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('网络超时'));
    });

    req.write(postData);
    req.end();
  });
}

// IPC 处理
ipcMain.handle('license:getDeviceId', () => {
  let config = readConfig();
  if (!config.deviceId) {
    config.deviceId = generateDeviceId();
    saveConfig(config);
  }
  return config.deviceId;
});

ipcMain.handle('license:verify', async (event, { key }) => {
  try {
    const config = readConfig();
    const deviceId = config.deviceId || generateDeviceId();
    const appVersion = app.getVersion();

    const result = await verifyLicense(key, deviceId, appVersion);
    return result;
  } catch (error) {
    return {
      success: false,
      message: `网络错误: ${error.message}`,
      update: null
    };
  }
});

ipcMain.handle('license:getConfig', () => readConfig());
ipcMain.handle('license:saveConfig', (event, data) => saveConfig(data));
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('shell:openExternal', (event, { url }) => {
  shell.openExternal(url);
});
```

### 6.3 预加载脚本

```javascript
// preload.js 新增内容

contextBridge.exposeInMainWorld('licenseAPI', {
  getDeviceId: () => ipcRenderer.invoke('license:getDeviceId'),
  verify: (key) => ipcRenderer.invoke('license:verify', { key }),
  getConfig: () => ipcRenderer.invoke('license:getConfig'),
  saveConfig: (data) => ipcRenderer.invoke('license:saveConfig', data),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url })
});
```

---

## 七、渲染进程授权管理模块

### 7.1 LicenseManager 类设计

```javascript
// renderer/license/index.js

class LicenseManager {
  constructor() {
    this.config = null;
    this.isVerified = false;
    this.VERIFY_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7天
    this.FREE_LIMIT = 5; // 每模块免费次数
  }

  // 初始化 (应用启动时调用)
  async init() {
    this.config = await window.licenseAPI.getConfig();

    // 初始化免费次数
    if (!this.config.freeUsage) {
      this.config.freeUsage = {
        export: this.FREE_LIMIT,
        compose: this.FREE_LIMIT,
        puzzle: this.FREE_LIMIT,
        upload: this.FREE_LIMIT,
        xhs: this.FREE_LIMIT
      };
      await this.saveConfig();
    }

    // 检查是否有有效密钥
    if (this.config.license?.key && this.config.license?.verifyResult?.success) {
      this.isVerified = true;

      // 检查是否需要重新验证 (超过7天)
      if (this.needsRevalidation()) {
        await this.verify(this.config.license.key);
      }
    }

    // 更新设置页面 UI
    this.updateSettingsUI();
  }

  // 检查是否需要重新验证
  needsRevalidation() {
    if (!this.config.license?.lastVerifyTime) return true;
    const lastTime = new Date(this.config.license.lastVerifyTime).getTime();
    return Date.now() - lastTime > this.VERIFY_INTERVAL;
  }

  // 验证密钥
  async verify(key) {
    try {
      const result = await window.licenseAPI.verify(key);

      if (result.success) {
        this.isVerified = true;
        this.config.license = {
          key: key,
          lastVerifyTime: new Date().toISOString(),
          expireAt: result.expire_at,  // 保存到期时间
          verifyResult: result
        };
        await this.saveConfig();

        // 检查版本更新
        if (result.update?.has_update) {
          this.showUpdateModal(result.update);
        }

        return { success: true };
      } else {
        this.isVerified = false;
        return { success: false, message: result.message };
      }
    } catch (error) {
      // 网络异常时，如果有有效缓存则继续使用
      if (this.config.license?.verifyResult?.success) {
        return { success: true, cached: true };
      }
      return { success: false, message: '网络连接失败' };
    }
  }

  // 检查访问权限
  async checkAccess(moduleId) {
    if (this.isVerified) return true;

    const freeCount = this.config.freeUsage[moduleId] ?? 0;

    if (freeCount > 0) {
      this.config.freeUsage[moduleId] = freeCount - 1;
      await this.saveConfig();

      const remaining = freeCount - 1;
      if (remaining > 0) {
        window.showToast(`试用中，该功能剩余 ${remaining} 次免费使用`, 'warning');
      } else {
        window.showToast('这是该功能最后一次免费试用', 'warning');
      }

      this.updateSettingsUI();
      return true;
    }

    this.showLicenseModal();
    return false;
  }

  // 获取状态
  getStatus() {
    return {
      isVerified: this.isVerified,
      license: this.config.license,
      expireAt: this.config.license?.expireAt,  // 到期时间
      freeUsage: this.config.freeUsage
    };
  }

  // 格式化到期时间显示 (只显示日期部分)
  formatExpireDate() {
    if (!this.config.license?.expireAt) return null;
    // "2025-12-31 23:59:59" → "2025-12-31"
    return this.config.license.expireAt.split(' ')[0];
  }

  // 保存配置
  async saveConfig() {
    await window.licenseAPI.saveConfig(this.config);
  }

  // 显示授权弹窗
  showLicenseModal(errorMsg = null) {
    // 由 license/ui.js 实现
  }

  // 显示更新弹窗
  showUpdateModal(updateInfo) {
    // 由 license/ui.js 实现
  }

  // 更新设置页面 UI
  updateSettingsUI() {
    // 更新状态显示、验证时间等
  }
}

// 导出单例
export const licenseManager = new LicenseManager();
```

---

## 八、实施任务清单

### 阶段一: 基础设施 (主进程)

- [ ] **T1.1** 在 `main.js` 中实现配置文件读写函数
- [ ] **T1.2** 实现 `generateDeviceId()` 设备标识生成
- [ ] **T1.3** 实现 `verifyLicense()` API 调用
- [ ] **T1.4** 添加所有 IPC 处理函数
- [ ] **T1.5** 修改 `preload.js` 暴露 `licenseAPI`

### 阶段二: UI 结构改造

- [ ] **T2.1** 修改 `index.html` Tab 导航 (logs → settings)
- [ ] **T2.2** 重构设置页面 HTML 结构 (授权管理 + 版本信息 + 运行日志)
- [ ] **T2.3** 添加授权弹窗 HTML 结构
- [ ] **T2.4** 添加更新弹窗 HTML 结构
- [ ] **T2.5** 创建二维码占位图 `assets/wechat-qrcode.png`

### 阶段三: 样式开发

- [ ] **T3.1** 设置页面卡片样式 (授权管理、版本信息区块)
- [ ] **T3.2** 授权状态指示器样式 (已激活/试用中/未激活)
- [ ] **T3.3** 授权弹窗样式 (含二维码区域)
- [ ] **T3.4** 更新弹窗样式 (含更新日志滚动区)
- [ ] **T3.5** 密钥输入框样式 (含显示/隐藏切换)

### 阶段四: 授权逻辑

- [ ] **T4.1** 创建 `renderer/license/index.js` LicenseManager 类
- [ ] **T4.2** 创建 `renderer/license/ui.js` 弹窗控制
- [ ] **T4.3** 在 `renderer.js` 中初始化 LicenseManager
- [ ] **T4.4** 实现设置页面交互 (密钥输入、验证、显示隐藏)
- [ ] **T4.5** 实现 7 天轮询检查逻辑

### 阶段五: 功能拦截

- [ ] **T5.1** `renderer.js` - 文档导出拦截
- [ ] **T5.2** `compose.js` - 场景化排版拦截
- [ ] **T5.3** `puzzle/index.js` - 拼图排版拦截
- [ ] **T5.4** `renderer.js` - 飞书上传拦截
- [ ] **T5.5** `renderer.js` - 小红书下载拦截

### 阶段六: 测试与优化

- [ ] **T6.1** 正常验证流程测试
- [ ] **T6.2** 免费试用计次测试
- [ ] **T6.3** 网络异常处理测试
- [ ] **T6.4** 版本更新流程测试
- [ ] **T6.5** UI/UX 细节优化

---

## 九、待提供资源

| 资源 | 说明 | 状态 |
|------|------|------|
| 微信二维码图片 | 用于授权弹窗，建议 200x200 PNG | 待提供 (暂用占位图) |
| 更新下载中转页 URL | 用户点击"立即更新"跳转的页面 | 待提供 |
| package.json version | 确认当前版本号准确 | 待确认 |

---

## 十、附录

### A. 错误消息对照表

| API 返回消息 | 用户提示 | 处理方式 |
|-------------|---------|---------|
| 密钥不存在 | 密钥无效，请检查后重试 | 保持弹窗，清空输入 |
| 密钥已过期 | 密钥已过期，请续费或获取新密钥 | 提供联系方式 |
| 密钥已被禁用 | 密钥已被禁用，请联系客服 | 提供联系方式 |
| 设备数量已达上限 | 设备绑定数量已满，请解绑其他设备 | 提供管理后台链接 |
| 网络超时 | 网络连接超时，请检查网络后重试 | 提供重试按钮 |

### B. 版本号规范

遵循语义化版本 (SemVer): `MAJOR.MINOR.PATCH`

- `1.0.0` - 初始版本
- `1.0.1` - 补丁更新 (bug修复)
- `1.1.0` - 功能更新
- `2.0.0` - 重大更新

---

**文档结束**
