# 微信验证码登录 - API接口文档

本文档为第三方工具(官网、浏览器插件、桌面软件)提供结构化的微信验证码登录接口集成指南,用于实现统一的微信登录功能。

---

## 目录

1. [快速开始](#快速开始)
2. [核心接口](#核心接口)
3. [数据结构](#数据结构)
4. [集成流程](#集成流程)
5. [错误处理](#错误处理)
6. [Token管理](#token管理)
7. [完整示例](#完整示例)
8. [最佳实践](#最佳实践)

---

## 快速开始

### 基础信息

```yaml
服务地址: https://key.liuliangfeng.com
API前缀: /api/wechat
内容类型: application/json
字符编码: UTF-8
超时时间: 建议10秒
认证方式: 登录后使用 Bearer Token
```

### 核心功能

1. **微信验证码登录**: 通过公众号获取验证码,换取访问令牌
2. **自动用户注册**: 首次登录自动创建用户账号
3. **版本更新检查**: 登录时自动检测应用版本并返回更新信息
4. **多端统一**: 支持官网、浏览器插件、桌面软件等多端接入

### 登录流程概览

```
用户扫码关注公众号
        ↓
发送关键词「登录」获取6位验证码
        ↓
客户端提交验证码 + 应用信息
        ↓
服务器验证并返回 Token + 用户信息 + 版本检查
        ↓
客户端保存Token,用于后续API调用
```

---

## 核心接口

### 1. 微信验证码登录接口

**用途**: 通过微信公众号验证码进行登录,获取访问令牌和用户信息

#### 请求规范

```http
POST /api/wechat/login
Content-Type: application/json
```

#### 请求体结构

```json
{
  "code": "198502",                  // 必填: 6位数字验证码
  "app_id": "caijichajian",          // 可选: 应用标识 (小写)
  "app_version": "1.0.0",            // 可选: 当前应用版本号
  "with_version_check": true,        // 可选: 是否返回版本检查信息 (默认true)
  "device_id": "abc123"              // 可选: 设备唯一标识 (用于日志审计)
}
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 | 验证规则 |
|------|------|------|------|---------|
| `code` | string | 是 | 从公众号获取的6位数字验证码 | 必须为6位纯数字,正则: `^\d{6}$` |
| `app_id` | string | 否* | 应用唯一标识 | 自动转小写,最大100字符 |
| `app_version` | string | 否* | 当前客户端版本号 | 建议语义化版本,如: `1.0.0` |
| `with_version_check` | boolean | 否 | 是否需要版本检查 | 默认为 `true` |
| `device_id` | string | 否 | 设备唯一标识符 | 最大255字符,用于登录日志记录 |

**注意**: 仅当同时提供 `app_id` 和 `app_version` 且应用存在并已启用版本检查、`with_version_check` 不为 `false` 时才会返回 `version_check`; 其他情况 `version_check` 为 `null`。

#### 成功响应

**HTTP状态码**: `200 OK`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJvMjNYVzdkQmlWT1JHRGQ5X1FVOGJVMW5oOEhRIiwidHlwZSI6InVzZXIiLCJ1c2VyX2lkIjoxLCJvcGVuaWQiOiJvMjNYVzdkQmlWT1JHRGQ5X1FVOGJVMW5oOEhRIiwiZXhwIjoxNzY4MzEzNDAzfQ.lnJmyPApEY4fitHFZ1x7txYo-ZN6QqvVUJ1nD4FOgRg",
  "token_type": "Bearer",
  "expire_days": 7,
  "user": {
    "id": 1,
    "openid": "o23XW7dBiVORGDd9_QU8bU1nh8HQ",
    "nickname": null,
    "avatar": null,
    "phone": null,
    "email": null,
    "status": 1,
    "last_login_at": "2026-01-06T14:10:03.318323"
  },
  "version_check": {
    "has_update": true,
    "latest_version": "1.2.0",
    "download_url": "https://liuliangfeng.com",
    "force_update": false
  }
}
```

#### 响应字段说明

**顶层字段:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `access_token` | string | JWT访问令牌,用于后续API调用 |
| `token_type` | string | 固定值: `"Bearer"` |
| `expire_days` | int | Token有效期(天),默认7天 |
| `user` | object | 用户信息对象 |
| `version_check` | object / null | 版本检查信息(可能为null) |

> 当未提供 `app_id`+`app_version`, 或应用未启用版本检查/未启用/不存在, `version_check` 将为 `null`。

**user 对象:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 用户ID |
| `openid` | string | 微信OpenID (唯一标识) |
| `nickname` | string / null | 用户昵称 (可能为空) |
| `avatar` | string / null | 头像URL (可能为空) |
| `phone` | string / null | 手机号 (可能为空) |
| `email` | string / null | 邮箱 (可能为空) |
| `status` | int | 用户状态 (1=正常, 0=禁用) |
| `last_login_at` | string | 最后登录时间 (北京时间,ISO格式) |

**version_check 对象** (可能为 `null`):

| 字段 | 类型 | 说明 |
|------|------|------|
| `has_update` | boolean | 是否有新版本可用 |
| `latest_version` | string | 最新版本号 |
| `min_version` | string / null | 最低支持版本号 |
| `download_url` | string / null | 下载地址 |
| `update_log` | string / null | 更新日志(可能为空; 当前后端未返回该字段内容) |
| `force_update` | boolean | 是否强制更新 |
 
> 说明：强制更新以 `force_update=true` 或 `min_version` 触发为准。

#### 失败响应

**HTTP状态码**: `400 Bad Request` 或 `422 Unprocessable Entity`

```json
{
  "detail": "验证码错误或已过期"
}
```

#### 可能的错误消息

| 错误消息 | HTTP状态码 | 说明 | 处理建议 |
|---------|-----------|------|---------|
| `验证码错误或已过期` | 400 | 验证码不存在、已使用或已过期(5分钟) | 提示用户重新获取验证码 |
| `验证码失败次数过多` | 400 | 验证码错误次数超过限制(默认5次) | 提示用户重新获取新验证码 |
| 字段验证错误 | 422 | 请求参数格式错误(如code不是6位数字) | 检查参数格式 |

---

### 2. 获取用户信息接口

**用途**: 获取当前登录用户的详细信息

#### 请求规范

```http
GET /api/user/info
Authorization: Bearer <access_token>
```

#### 成功响应

**HTTP状态码**: `200 OK`

```json
{
  "id": 1,
  "openid": "o23XW7dBiVORGDd9_QU8bU1nh8HQ",
  "nickname": "用户昵称",
  "avatar": "https://example.com/avatar.jpg",
  "phone": null,
  "email": null,
  "status": 1,
  "last_login_at": "2026-01-06T14:10:03.318323"
}
```

#### 失败响应

**HTTP状态码**: `401 Unauthorized`

```json
{
  "detail": "未认证"
}
```

---

## 数据结构

### TypeScript接口定义

```typescript
// 登录请求
interface WeChatLoginRequest {
  code: string;                      // 必填: 6位数字验证码
  app_id?: string;                   // 可选: 应用ID
  app_version?: string;              // 可选: 应用版本
  with_version_check?: boolean;      // 可选: 是否检查版本 (默认true)
  device_id?: string;                // 可选: 设备ID
}

// 登录响应
interface WeChatLoginResponse {
  access_token: string;              // JWT令牌
  token_type: string;                // "Bearer"
  expire_days: number;               // Token有效期(天)
  user: UserProfile;                 // 用户信息
  version_check?: VersionCheck;      // 版本检查信息(可能为null)
}

// 用户信息
interface UserProfile {
  id: number;                        // 用户ID
  openid: string;                    // 微信OpenID
  nickname?: string;                 // 昵称
  avatar?: string;                   // 头像URL
  phone?: string;                    // 手机号
  email?: string;                    // 邮箱
  status: number;                    // 状态 (1=正常)
  last_login_at?: string;            // 最后登录时间
}

// 版本检查信息
interface VersionCheck {
  has_update: boolean;               // 是否有更新
  latest_version?: string;           // 最新版本号
  min_version?: string;              // 最低支持版本
  download_url?: string;             // 下载地址
  update_log?: string;               // 更新日志(当前可能为空)
  force_update: boolean;             // 是否强制更新
}

// 错误响应
interface ErrorResponse {
  detail: string;                    // 错误详情
}
```

---

## 集成流程

### 完整流程图

```
┌────────────────────────────────────────────────────────────┐
│                    客户端集成流程                          │
└────────────────────────────────────────────────────────────┘

[应用启动]
    ↓
[检查本地Token] ───── 有效 ────→ [进入主界面]
    ↓ 无效/不存在
[显示登录界面]
    │
    │ 显示公众号二维码
    │ 显示验证码输入框
    ↓
[用户操作]
    │ 1. 扫码关注公众号
    │ 2. 发送"登录"获取验证码
    │ 3. 在客户端输入验证码
    ↓
[调用登录接口] POST /api/wechat/login
    │ 参数: code, app_id, app_version
    ↓
[服务器验证]
    ├─ 验证码有效? ──否──→ [显示错误提示]
    │                          ↓
    │                     [重新输入]
    ↓ 是
[返回Token + User + VersionCheck]
    ↓
[保存Token到本地存储]
    │ - localStorage (官网)
    │ - chrome.storage (插件)
    │ - electron-store (桌面软件)
    ↓
[检查版本更新]
    ├─ has_update = true ──→ [显示更新提示]
    │                           ├─ force_update = true ──→ [强制更新]
    │                           └─ force_update = false ─→ [可选更新]
    ↓
[进入主界面]
    │
    │ 后续API调用携带Token
    │ Authorization: Bearer <token>
    ↓
[Token过期] ───→ [清除本地Token] ───→ [返回登录界面]
```

### 推荐实现步骤

#### 步骤1: 准备公众号二维码

```javascript
// 配置公众号二维码路径
const CONFIG = {
  API_BASE: 'https://key.liuliangfeng.com',
  QRCODE_PATH: './assets/wechat-qrcode.jpg',  // 本地路径
  APP_ID: 'your_app_id',                      // 你的应用ID
  APP_VERSION: '1.0.0'                        // 当前版本号
};
```

#### 步骤2: 实现登录接口调用

```javascript
/**
 * 微信验证码登录
 * @param {string} code - 6位验证码
 * @returns {Promise<Object>} 登录结果
 */
async function wechatLogin(code) {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/wechat/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: code,
        app_id: CONFIG.APP_ID,
        app_version: CONFIG.APP_VERSION,
        with_version_check: true,
        device_id: getDeviceId()  // 可选: 设备标识
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '登录失败');
    }

    const data = await response.json();
    return { success: true, data };

  } catch (error) {
    return {
      success: false,
      message: error.message || '网络错误,请重试'
    };
  }
}
```

> 如需设置请求超时,请参考文档下方的 `AbortController` 示例(`fetchWithTimeout`)。

#### 步骤3: 处理登录响应

```javascript
async function handleLogin(code) {
  // 1. 验证码格式检查
  if (!code || !/^\d{6}$/.test(code)) {
    showError('请输入6位数字验证码');
    return;
  }

  // 2. 显示加载状态
  showLoading('登录中...');

  // 3. 调用登录接口
  const result = await wechatLogin(code);

  // 4. 隐藏加载状态
  hideLoading();

  if (result.success) {
    // 5. 保存Token和用户信息
    await saveToken(result.data.access_token);
    await saveUser(result.data.user);

    // 6. 检查版本更新
    if (result.data.version_check?.has_update) {
      showUpdateDialog(result.data.version_check);
    }

    // 7. 跳转到主界面
    showMainView();
    showSuccess('登录成功');

  } else {
    // 8. 显示错误信息
    showError(result.message);
  }
}
```

#### 步骤4: 处理版本更新

```javascript
function showUpdateDialog(versionCheck) {
  const {
    has_update,
    latest_version,
    download_url,
    update_log,
    force_update,
    update_type
  } = versionCheck;

  if (!has_update) return;

  const logText = update_log || '暂无更新说明';

  // 构建更新提示文案
  const title = force_update ? '发现新版本(必需更新)' : '发现新版本';
  const message = `
    最新版本: ${latest_version}

    更新内容:
    ${logText}
  `;

  // 显示更新对话框
  showDialog({
    title: title,
    message: message,
    confirmText: '立即更新',
    cancelText: force_update ? null : '稍后提醒',
    onConfirm: () => {
      // 打开下载链接
      window.open(download_url, '_blank');
    },
    onCancel: () => {
      if (!force_update) {
        // 非强制更新,允许跳过
        continueToMain();
      }
    }
  });
}
```

---

## 错误处理

### 错误码映射

| HTTP状态码 | 错误消息示例 | 说明 | 前端处理 |
|-----------|------------|------|---------|
| 200 | - | 成功 | 正常处理 |
| 400 | 验证码错误或已过期 | 验证码无效 | 提示用户重新获取验证码 |
| 400 | 验证码失败次数过多 | 验证错误超过5次 | 提示用户获取新验证码 |
| 401 | 未认证 | Token无效或过期 | 清除本地Token,跳转登录 |
| 422 | Validation Error | 参数格式错误 | 检查参数格式 |
| 500 | Internal Server Error | 服务器错误 | 提示用户稍后重试 |

### 统一错误处理封装

```javascript
// 错误消息映射
const ERROR_MESSAGES = {
  '验证码错误或已过期': '验证码无效,请重新获取',
  '验证码失败次数过多': '验证码错误次数过多,请获取新验证码',
  '未认证': '登录已过期,请重新登录',
  'network': '网络连接失败,请检查网络'
};

/**
 * 获取用户友好的错误提示
 */
function getErrorMessage(errorDetail) {
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    if (errorDetail.includes(key)) {
      return message;
    }
  }
  return errorDetail || '未知错误,请重试';
}

/**
 * 统一API调用封装
 */
async function apiRequest(endpoint, options = {}) {
  try {
    const url = `${CONFIG.API_BASE}${endpoint}`;
    const token = await getToken();

    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json'
      }
    };

    // 如果需要认证,添加Token
    if (options.auth && token) {
      defaultOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    });

    // 处理401未认证
    if (response.status === 401) {
      await clearAuth();
      throw new Error('登录已过期,请重新登录');
    }

    // 处理错误响应
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '请求失败');
    }

    return await response.json();

  } catch (error) {
    throw new Error(getErrorMessage(error.message));
  }
}
```

### 重试机制

```javascript
/**
 * 带重试的API调用
 * @param {Function} apiCall - API调用函数
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise}
 */
async function apiWithRetry(apiCall, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      // 如果是最后一次尝试,抛出错误
      if (attempt === maxRetries) {
        throw error;
      }

      // 如果不是网络错误,不重试
      if (!error.message.includes('网络')) {
        throw error;
      }

      // 指数退避
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`重试中... (${attempt}/${maxRetries}), ${delay}ms后重试`);
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Token管理

### Token存储规范

各端需要安全地存储和管理访问令牌:

| 平台 | 存储方式 | 实现方式 |
|------|---------|---------|
| 官网 | localStorage | `localStorage.setItem('token', token)` |
| 浏览器插件 | chrome.storage.local | `chrome.storage.local.set({ token })` |
| 桌面软件 | electron-store | `store.set('token', token)` |

### Token管理接口

```javascript
// 统一的Token管理接口(各端需实现)
const TokenManager = {
  /**
   * 保存Token
   */
  async save(token) {
    // 官网: localStorage.setItem('wechat_token', token);
    // 插件: await chrome.storage.local.set({ wechat_token: token });
    // 软件: store.set('wechat_token', token);
  },

  /**
   * 获取Token
   */
  async get() {
    // 官网: return localStorage.getItem('wechat_token');
    // 插件: const { wechat_token } = await chrome.storage.local.get('wechat_token');
    // 软件: return store.get('wechat_token');
  },

  /**
   * 删除Token
   */
  async remove() {
    // 官网: localStorage.removeItem('wechat_token');
    // 插件: await chrome.storage.local.remove('wechat_token');
    // 软件: store.delete('wechat_token');
  },

  /**
   * 检查Token是否存在
   */
  async exists() {
    const token = await this.get();
    return !!token;
  }
};
```

### Token使用示例

```javascript
// 登录后保存Token
async function onLoginSuccess(loginResponse) {
  await TokenManager.save(loginResponse.access_token);
  await UserManager.save(loginResponse.user);
}

// 调用需要认证的API
async function getUserInfo() {
  const token = await TokenManager.get();

  const response = await fetch(`${CONFIG.API_BASE}/api/user/info`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    // Token过期,清除并跳转登录
    await TokenManager.remove();
    showLoginView();
    return null;
  }

  return await response.json();
}

// 退出登录
async function logout() {
  await TokenManager.remove();
  await UserManager.remove();
  showLoginView();
}
```

### Token刷新策略

由于Token有效期为7天,建议:

1. **无需主动刷新**: Token有效期较长(7天),一般无需实现刷新机制
2. **被动处理过期**: 当API返回401时,清除本地Token并引导重新登录
3. **启动时验证**: 应用启动时可调用 `/api/user/info` 验证Token有效性

```javascript
// 应用启动时检查登录态
async function checkAuthOnStartup() {
  const hasToken = await TokenManager.exists();

  if (!hasToken) {
    showLoginView();
    return;
  }

  try {
    // 验证Token是否有效
    const user = await getUserInfo();
    if (user) {
      showMainView(user);
    } else {
      showLoginView();
    }
  } catch (error) {
    // 网络错误时,使用本地缓存的用户信息
    const cachedUser = await UserManager.get();
    if (cachedUser) {
      showMainView(cachedUser);
    } else {
      showLoginView();
    }
  }
}
```

---

## 完整示例

### Python实现

```python
import requests
from typing import Optional, Dict

class WeChatLoginClient:
    """微信验证码登录客户端"""

    def __init__(self, app_id: str, app_version: str):
        self.api_base = "https://key.liuliangfeng.com"
        self.app_id = app_id
        self.app_version = app_version
        self.token = None
        self.user = None

    def login(self, code: str, device_id: Optional[str] = None) -> Dict:
        """
        微信验证码登录

        Args:
            code: 6位数字验证码
            device_id: 设备ID(可选)

        Returns:
            登录结果字典
        """
        url = f"{self.api_base}/api/wechat/login"

        payload = {
            "code": code,
            "app_id": self.app_id,
            "app_version": self.app_version,
            "with_version_check": True
        }

        if device_id:
            payload["device_id"] = device_id

        try:
            response = requests.post(
                url,
                json=payload,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                self.token = data["access_token"]
                self.user = data["user"]

                return {
                    "success": True,
                    "data": data,
                    "message": "登录成功"
                }
            else:
                error = response.json()
                return {
                    "success": False,
                    "message": error.get("detail", "登录失败")
                }

        except requests.exceptions.Timeout:
            return {"success": False, "message": "请求超时,请重试"}
        except requests.exceptions.RequestException as e:
            return {"success": False, "message": f"网络错误: {str(e)}"}

    def get_user_info(self) -> Optional[Dict]:
        """获取用户信息"""
        if not self.token:
            raise Exception("未登录,请先调用login()")

        url = f"{self.api_base}/api/user/info"
        headers = {"Authorization": f"Bearer {self.token}"}

        try:
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 401:
                self.token = None
                raise Exception("Token已过期,请重新登录")
            else:
                return None

        except requests.exceptions.RequestException as e:
            print(f"获取用户信息失败: {e}")
            return None

# 使用示例
if __name__ == "__main__":
    # 1. 创建客户端
    client = WeChatLoginClient(
        app_id="caijichajian",
        app_version="1.0.0"
    )

    # 2. 用户输入验证码
    code = input("请输入6位验证码: ")

    # 3. 登录
    result = client.login(code)

    if result["success"]:
        print("✅ 登录成功!")
        print(f"Token: {client.token[:20]}...")
        print(f"用户ID: {client.user['id']}")

        # 4. 检查版本更新
        version_check = result["data"].get("version_check")
        if version_check and version_check.get("has_update"):
            print(f"\n🔔 发现新版本: {version_check['latest_version']}")
            print(f"下载地址: {version_check['download_url']}")
            print(f"更新日志:\n{version_check['update_log']}")

            if version_check.get("force_update"):
                print("⚠️ 这是强制更新,请立即下载!")

        # 5. 获取用户信息
        user_info = client.get_user_info()
        if user_info:
            print(f"\n用户信息: {user_info}")
    else:
        print(f"❌ 登录失败: {result['message']}")
```

### JavaScript (官网)实现

```javascript
// ===== 配置文件 =====
const CONFIG = {
  API_BASE: 'https://key.liuliangfeng.com',
  APP_ID: 'caijichajian',
  APP_VERSION: '1.0.0',
  STORAGE_KEYS: {
    TOKEN: 'wechat_token',
    USER: 'wechat_user',
    EXPIRE_TIME: 'wechat_token_expire'
  }
};

// ===== Token管理 =====
const TokenManager = {
  save(token, expireDays = 7) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
    const expireTime = Date.now() + expireDays * 24 * 60 * 60 * 1000;
    localStorage.setItem(CONFIG.STORAGE_KEYS.EXPIRE_TIME, expireTime.toString());
  },

  get() {
    const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    const expireTime = localStorage.getItem(CONFIG.STORAGE_KEYS.EXPIRE_TIME);

    // 检查是否过期
    if (expireTime && Date.now() > parseInt(expireTime)) {
      this.clear();
      return null;
    }

    return token;
  },

  clear() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.EXPIRE_TIME);
  },

  exists() {
    return !!this.get();
  }
};

// ===== 用户管理 =====
const UserManager = {
  save(user) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
  },

  get() {
    const user = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    return user ? JSON.parse(user) : null;
  },

  clear() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
  }
};

// ===== API调用 =====
class WeChatLoginAPI {
  /**
   * 微信验证码登录
   */
  static async login(code) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/wechat/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: code,
          app_id: CONFIG.APP_ID,
          app_version: CONFIG.APP_VERSION,
          with_version_check: true
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '登录失败');
      }

      return await response.json();

    } catch (error) {
      throw new Error(error.message || '网络错误');
    }
  }

  /**
   * 获取用户信息
   */
  static async getUserInfo() {
    const token = TokenManager.get();
    if (!token) {
      throw new Error('未登录');
    }

    const response = await fetch(`${CONFIG.API_BASE}/api/user/info`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      TokenManager.clear();
      UserManager.clear();
      throw new Error('登录已过期');
    }

    if (!response.ok) {
      throw new Error('获取用户信息失败');
    }

    return await response.json();
  }
}

// ===== UI逻辑 =====
class LoginUI {
  constructor() {
    this.init();
  }

  init() {
    // 绑定登录按钮
    document.getElementById('login-btn')?.addEventListener('click', () => {
      this.handleLogin();
    });

    // 验证码输入框只允许数字
    const codeInput = document.getElementById('code-input');
    codeInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });

    // 检查登录状态
    this.checkAuth();
  }

  async checkAuth() {
    if (TokenManager.exists()) {
      try {
        const user = await WeChatLoginAPI.getUserInfo();
        this.showMainView(user);
      } catch (error) {
        // Token过期,显示登录界面
        this.showLoginView();
      }
    } else {
      this.showLoginView();
    }
  }

  async handleLogin() {
    const codeInput = document.getElementById('code-input');
    const code = codeInput.value.trim();

    // 验证格式
    if (!/^\d{6}$/.test(code)) {
      alert('请输入6位数字验证码');
      return;
    }

    try {
      // 显示加载状态
      this.showLoading();

      // 调用登录接口
      const result = await WeChatLoginAPI.login(code);

      // 保存Token和用户信息
      TokenManager.save(result.access_token, result.expire_days);
      UserManager.save(result.user);

      // 检查版本更新
      if (result.version_check?.has_update) {
        this.showUpdateDialog(result.version_check);
      }

      // 显示主界面
      this.showMainView(result.user);
      alert('登录成功!');

    } catch (error) {
      alert(error.message);
    } finally {
      this.hideLoading();
    }
  }

  showUpdateDialog(versionCheck) {
    const { latest_version, download_url, update_log, force_update } = versionCheck;

    const message = `
发现新版本: ${latest_version}

更新内容:
${update_log}

${force_update ? '这是强制更新,请立即下载!' : ''}
    `.trim();

    if (confirm(message + '\n\n是否立即下载?')) {
      window.open(download_url, '_blank');
    }
  }

  showLoginView() {
    document.getElementById('login-view').style.display = 'block';
    document.getElementById('main-view').style.display = 'none';
  }

  showMainView(user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
    document.getElementById('user-name').textContent = user.nickname || `用户${user.id}`;
  }

  showLoading() {
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = '登录中...';
  }

  hideLoading() {
    const btn = document.getElementById('login-btn');
    btn.disabled = false;
    btn.textContent = '登录';
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new LoginUI();
});
```

### Chrome插件实现

**popup.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      width: 320px;
      padding: 20px;
      font-family: -apple-system, sans-serif;
    }
    .login-view, .main-view {
      display: none;
    }
    .qrcode {
      width: 150px;
      height: 150px;
      margin: 10px auto;
      display: block;
    }
    input {
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      box-sizing: border-box;
    }
    button {
      width: 100%;
      padding: 10px;
      background: #4a9eff;
      color: white;
      border: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <!-- 登录界面 -->
  <div id="login-view" class="login-view">
    <h3>微信扫码登录</h3>
    <img class="qrcode" src="qrcode.jpg" alt="公众号二维码">
    <p>1. 扫码关注公众号</p>
    <p>2. 发送「登录」获取验证码</p>
    <p>3. 输入验证码登录</p>
    <input type="text" id="code-input" placeholder="请输入6位数字验证码" maxlength="6">
    <button id="login-btn">登录</button>
  </div>

  <!-- 主界面 -->
  <div id="main-view" class="main-view">
    <h3>已登录</h3>
    <p>用户: <span id="user-name"></span></p>
    <button id="logout-btn">退出登录</button>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

**popup.js:**
```javascript
const CONFIG = {
  API_BASE: 'https://key.liuliangfeng.com',
  APP_ID: 'caijichajian',
  APP_VERSION: '1.0.0'
};

// Token管理
const TokenManager = {
  async save(token) {
    await chrome.storage.local.set({ wechat_token: token });
  },

  async get() {
    const result = await chrome.storage.local.get('wechat_token');
    return result.wechat_token || null;
  },

  async clear() {
    await chrome.storage.local.remove('wechat_token');
  }
};

// 用户管理
const UserManager = {
  async save(user) {
    await chrome.storage.local.set({ wechat_user: user });
  },

  async get() {
    const result = await chrome.storage.local.get('wechat_user');
    return result.wechat_user || null;
  },

  async clear() {
    await chrome.storage.local.remove('wechat_user');
  }
};

// 页面加载
document.addEventListener('DOMContentLoaded', async () => {
  const token = await TokenManager.get();

  if (token) {
    const user = await UserManager.get();
    showMainView(user);
  } else {
    showLoginView();
  }
});

// 登录按钮
document.getElementById('login-btn').addEventListener('click', async () => {
  const code = document.getElementById('code-input').value.trim();

  if (!/^\d{6}$/.test(code)) {
    alert('请输入6位数字验证码');
    return;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/wechat/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        app_id: CONFIG.APP_ID,
        app_version: CONFIG.APP_VERSION
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    const data = await response.json();

    // 保存Token和用户
    await TokenManager.save(data.access_token);
    await UserManager.save(data.user);

    // 显示主界面
    showMainView(data.user);

  } catch (error) {
    alert(error.message);
  }
});

// 退出登录
document.getElementById('logout-btn').addEventListener('click', async () => {
  await TokenManager.clear();
  await UserManager.clear();
  showLoginView();
});

// 显示登录界面
function showLoginView() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('main-view').style.display = 'none';
}

// 显示主界面
function showMainView(user) {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'block';
  document.getElementById('user-name').textContent = user.nickname || `用户${user.id}`;
}

// 验证码输入限制
document.getElementById('code-input').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});
```

**manifest.json:**
```json
{
  "manifest_version": 3,
  "name": "微信登录示例",
  "version": "1.0.0",
  "permissions": ["storage"],
  "host_permissions": ["https://key.liuliangfeng.com/*"],
  "action": {
    "default_popup": "popup.html"
  }
}
```

### Electron桌面软件实现

**main.js (主进程):**
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store');
const fetch = require('node-fetch');

const store = new Store();
const CONFIG = {
  API_BASE: 'https://key.liuliangfeng.com',
  APP_ID: 'caijichajian',
  APP_VERSION: '1.0.0'
};

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 检查登录状态
  const token = store.get('wechat_token');
  if (token) {
    mainWindow.loadFile('main.html');
  } else {
    mainWindow.loadFile('login.html');
  }
}

app.whenReady().then(createWindow);

// 处理登录
ipcMain.on('login', async (event, code) => {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/wechat/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        app_id: CONFIG.APP_ID,
        app_version: CONFIG.APP_VERSION
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    const data = await response.json();

    // 保存Token和用户
    store.set('wechat_token', data.access_token);
    store.set('wechat_user', data.user);

    event.reply('login-result', { success: true, data });

  } catch (error) {
    event.reply('login-result', {
      success: false,
      message: error.message
    });
  }
});

// 退出登录
ipcMain.on('logout', () => {
  store.delete('wechat_token');
  store.delete('wechat_user');
  mainWindow.loadFile('login.html');
});
```

**login.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, sans-serif;
      padding: 30px;
      text-align: center;
    }
    .qrcode {
      width: 150px;
      height: 150px;
      margin: 20px auto;
    }
    input, button {
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      box-sizing: border-box;
    }
    button {
      background: #4a9eff;
      color: white;
      border: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h2>微信扫码登录</h2>
  <img class="qrcode" src="./assets/qrcode.jpg" alt="公众号二维码">
  <p>1. 扫码关注公众号</p>
  <p>2. 发送「登录」获取验证码</p>
  <p>3. 输入验证码登录</p>
  <input type="text" id="code-input" placeholder="请输入6位数字验证码" maxlength="6">
  <button onclick="handleLogin()">登录</button>

  <script>
    const { ipcRenderer } = require('electron');

    function handleLogin() {
      const code = document.getElementById('code-input').value.trim();

      if (!/^\d{6}$/.test(code)) {
        alert('请输入6位数字验证码');
        return;
      }

      ipcRenderer.send('login', code);
    }

    ipcRenderer.on('login-result', (event, result) => {
      if (result.success) {
        alert('登录成功');
        window.location.href = './main.html';
      } else {
        alert(result.message);
      }
    });

    // 验证码输入限制
    document.getElementById('code-input').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
  </script>
</body>
</html>
```

---

## 最佳实践

### 1. 安全建议

| 规范 | 说明 |
|------|------|
| ✅ 使用HTTPS | 生产环境必须使用HTTPS协议 |
| ✅ 安全存储Token | 不要将Token明文写入代码或日志 |
| ✅ 及时清理过期Token | Token过期后立即从本地删除 |
| ✅ 验证服务器证书 | 防止中间人攻击 |
| ✅ 限制Token作用域 | Token仅用于授权API调用 |
| ❌ 不要分享Token | Token是用户凭证,不可分享 |
| ❌ 不要在URL中传递Token | 避免在GET请求URL中暴露Token |

### 2. 性能优化

#### 2.1 请求优化

```javascript
// 使用AbortController实现请求超时
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}
```

#### 2.2 用户信息缓存

```javascript
// 缓存用户信息,减少API调用
const UserCache = {
  CACHE_DURATION: 5 * 60 * 1000, // 5分钟

  get() {
    const cache = localStorage.getItem('user_cache');
    if (!cache) return null;

    const { user, timestamp } = JSON.parse(cache);
    if (Date.now() - timestamp > this.CACHE_DURATION) {
      return null;
    }

    return user;
  },

  set(user) {
    const cache = {
      user: user,
      timestamp: Date.now()
    };
    localStorage.setItem('user_cache', JSON.stringify(cache));
  },

  clear() {
    localStorage.removeItem('user_cache');
  }
};
```

### 3. 用户体验优化

#### 3.1 输入验证

```javascript
// 实时验证码格式提示
const codeInput = document.getElementById('code-input');

codeInput.addEventListener('input', (e) => {
  const value = e.target.value;

  // 只允许数字
  e.target.value = value.replace(/\D/g, '').slice(0, 6);

  // 实时验证
  if (e.target.value.length === 6) {
    e.target.classList.add('valid');
  } else {
    e.target.classList.remove('valid');
  }
});
```

#### 3.2 加载状态

```javascript
// 显示加载动画
function showLoading(message = '加载中...') {
  const loading = document.createElement('div');
  loading.id = 'loading';
  loading.innerHTML = `
    <div class="spinner"></div>
    <p>${message}</p>
  `;
  document.body.appendChild(loading);
}

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.remove();
  }
}
```

#### 3.3 错误提示

```javascript
// 友好的错误提示
function showError(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
```

### 4. 验证码输入优化

```javascript
// 自动聚焦验证码输入框
document.addEventListener('DOMContentLoaded', () => {
  const codeInput = document.getElementById('code-input');
  if (codeInput) {
    codeInput.focus();
  }
});

// 回车键快捷登录
document.getElementById('code-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && e.target.value.length === 6) {
    document.getElementById('login-btn').click();
  }
});

// 粘贴验证码自动处理
document.getElementById('code-input').addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text');
  const code = text.replace(/\D/g, '').slice(0, 6);
  e.target.value = code;

  // 如果是6位,自动触发登录
  if (code.length === 6) {
    setTimeout(() => {
      document.getElementById('login-btn').click();
    }, 100);
  }
});
```

### 5. 版本更新最佳实践

```javascript
// 智能版本更新提示
function handleVersionCheck(versionCheck, currentVersion) {
  if (!versionCheck || !versionCheck.has_update) {
    return;
  }

  const {
    latest_version,
    min_version,
    force_update,
    update_type,
    download_url,
    update_log
  } = versionCheck;
  const logText = update_log || '暂无更新说明';

  // 检查是否低于最低支持版本
  if (min_version && compareVersion(currentVersion, min_version) < 0) {
    showForceUpdateDialog({
      title: '版本过低,必须更新',
      message: `当前版本: ${currentVersion}\n最低支持版本: ${min_version}\n\n请更新到最新版本以继续使用。`,
      download_url
    });
    return;
  }

  // 强制更新
  if (force_update) {
    showForceUpdateDialog({
      title: '发现重要更新',
      message: `最新版本: ${latest_version}\n\n${logText}`,
      download_url
    });
    return;
  }

  // 可选/推荐更新
  const skippedVersion = localStorage.getItem('skipped_version');
  if (skippedVersion === latest_version) {
    return; // 用户已跳过此版本
  }

  showOptionalUpdateDialog({
    title: update_type === 'recommend' ? '推荐更新' : '发现新版本',
    current_version: currentVersion,
    latest_version: latest_version,
    update_log: logText,
    download_url: download_url,
    onSkip: () => {
      localStorage.setItem('skipped_version', latest_version);
    }
  });
}

// 版本号比较
function compareVersion(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}
```

### 6. 日志和监控

```javascript
// 登录事件埋点
function trackLoginEvent(event, data = {}) {
  console.log(`[Login Event] ${event}`, data);

  // 发送到监控平台(可选)
  // sendToAnalytics('login_event', { event, ...data });
}

// 使用示例
async function handleLogin(code) {
  trackLoginEvent('login_start', { code_length: code.length });

  try {
    const result = await wechatLogin(code);
    trackLoginEvent('login_success', {
      user_id: result.data.user.id
    });
  } catch (error) {
    trackLoginEvent('login_failed', {
      error: error.message
    });
  }
}
```

---

## 附录

### A. 公众号二维码获取

1. 登录微信公众平台: https://mp.weixin.qq.com
2. 进入「设置与开发」→「公众号设置」→「账号详情」
3. 下载公众号二维码图片
4. 将二维码保存到项目资源目录:
   - 官网: `/assets/wechat-qrcode.jpg`
   - 插件: `/images/qrcode.jpg`
   - 软件: `./assets/qrcode.jpg`

### B. 常见问题FAQ

**Q1: 验证码一直显示错误?**
- A: 检查验证码是否在5分钟有效期内
- A: 确认是从正确的公众号获取的验证码
- A: 验证码只能使用一次,请重新获取

**Q2: Token过期如何处理?**
- A: 当API返回401时,清除本地Token并引导用户重新登录
- A: Token有效期为7天,正常使用无需担心过期问题

**Q3: 如何处理网络错误?**
- A: 实现重试机制,最多重试3次
- A: 使用指数退避策略,避免频繁请求
- A: 提示用户检查网络连接

**Q4: 版本检查如何工作?**
- A: 登录时如果提供了`app_id`和`app_version`,会自动进行版本检查
- A: 返回的`version_check`对象包含更新信息
- A: 根据`force_update`和`update_type`决定更新策略

**Q5: 如何测试登录流程?**
- A: 使用微信扫码关注测试公众号
- A: 发送"登录"获取测试验证码
- A: 使用测试验证码调用API接口

### C. 测试用例

```javascript
// 测试验证码格式验证
describe('验证码格式验证', () => {
  test('6位数字验证码有效', () => {
    expect(validateCode('123456')).toBe(true);
  });

  test('非6位验证码无效', () => {
    expect(validateCode('12345')).toBe(false);
    expect(validateCode('1234567')).toBe(false);
  });

  test('包含非数字字符无效', () => {
    expect(validateCode('12a456')).toBe(false);
    expect(validateCode('12-456')).toBe(false);
  });
});

// 测试登录流程
describe('登录流程测试', () => {
  test('成功登录', async () => {
    const result = await wechatLogin('123456');
    expect(result.success).toBe(true);
    expect(result.data.access_token).toBeDefined();
    expect(result.data.user).toBeDefined();
  });

  test('验证码错误', async () => {
    const result = await wechatLogin('000000');
    expect(result.success).toBe(false);
    expect(result.message).toContain('验证码错误');
  });
});
```

---

## 联系支持

- **API服务地址**: https://key.liuliangfeng.com
- **技术支持**: 请联系技术支持团队
- **问题反馈**: 提交Issue到项目仓库或联系客服微信: teaxh613

---

**文档版本**: 1.0.0
**最后更新**: 2026-02-04
**适用API版本**: v1
**维护状态**: 活跃维护中
