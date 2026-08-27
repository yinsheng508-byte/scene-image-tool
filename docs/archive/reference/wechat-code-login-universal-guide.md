# 微信公众号验证码登录 - 通用开发文档（订阅号版）

## 一、方案概述

### 1.1 业务目标

实现统一的微信验证码登录系统，支持多端（官网、浏览器插件、桌面软件）独立使用：

1. 必须关注公众号才能完成登录（强制关注，沉淀私域流量）
2. 各端独立登录，无需跳转，用户在哪用就在哪登录
3. 后端提供统一API，各端调用同一套接口
4. 为未来付费功能预留扩展能力

### 1.2 产品架构

```
                    ┌─────────────────────────────┐
                    │       统一登录API服务        │
                    │  （验证码生成 + 验证接口）   │
                    │       /wechat              │
                    │       /api/login/code      │
                    │       /api/user/info       │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │    官网     │         │  浏览器插件  │         │  桌面软件   │
    │             │         │             │         │             │
    │ 二维码+输入框│         │ 二维码+输入框│         │ 二维码+输入框│
    │  直接登录   │         │  直接登录   │         │  直接登录   │
    └─────────────┘         └─────────────┘         └─────────────┘
```

### 1.3 技术方案

**方案：公众号关键词验证码登录（各端独立）**

- 适用账号：认证订阅号或服务号
- 用户体验：扫码关注 → 发送关键词 → 获取验证码 → 输入验证码登录
- 是否强制关注：是（必须关注才能发消息）
- 各端关系：独立登录，共用API

### 1.4 用户登录流程

**所有端流程一致：**

```
用户在任意端（官网/插件/软件）点击登录
        ↓
显示公众号二维码 + 验证码输入框
        ↓
用户微信扫码
        ↓
    ┌─────────────────────────────────┐
    │ 未关注：显示关注页 → 点关注      │
    │ 已关注：直接进入公众号对话界面   │
    └─────────────────────────────────┘
        ↓
用户在公众号发送「登录」
        ↓
公众号自动回复：「您的登录验证码是：684523，5分钟内有效」
        ↓
用户复制验证码，回到原来的端输入
        ↓
验证通过 → 生成token → 登录成功
```

### 1.5 登录界面示意（各端通用）

```
┌─────────────────────────────────────────┐
│                  🔒                     │
│              微信扫码登录                │
│       登录后自动解锁相关功能！免费使用    │
│     前往官网，获取更多免费AI提效工具      │
│                                         │
│         ┌───────────────────┐           │
│         │                   │           │
│         │    【公众号】      │           │
│         │    【二维码】      │           │
│         │                   │           │
│         └───────────────────┘           │
│                                         │
│         1. 扫描二维码关注公众号          │
│         2. 发送「登录」获取验证码        │
│         3. 输入验证码后点击登录          │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │       请输入6位数字验证码        │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │             登录                │   │
│   └─────────────────────────────────┘   │
│                                         │
│     如登录遇到问题，请联系微信：teaxh613  │
│                                         │
└─────────────────────────────────────────┘
```

**注意：** 以上为布局规范，具体样式（颜色、字体、间距等）由各端根据自身产品风格自定义。

---

## 二、前置准备

### 2.1 必备条件

| 项目 | 要求 | 说明 |
|------|------|------|
| 公众号 | 认证订阅号或服务号 | 需要有接收消息和自动回复权限 |
| 服务器 | 可公网访问 | 用于接收微信消息推送 |
| 域名 | 已备案 + HTTPS | 微信要求 |
| 数据库 | MySQL/MongoDB等 | 存储用户和验证码 |

### 2.4 当前配置（订阅号环境）

| 配置项 | 值 | 说明 |
|--------|----|------|
| AppID | `wxff266f4c77e4bf29` | 订阅号 AppID（仅在服务器端使用） |
| Token | 环境变量 `WECHAT_TOKEN`（当前：`yinsheng2026`） | 服务器验证/签名 |
| EncodingAESKey | 环境变量 `WECHAT_ENCODING_AES_KEY` | 43位密钥，明文模式可暂不解密 |
| 消息加解密方式 | 明文模式 | 开发阶段，后续可切兼容/安全 |
| 消息接收 URL | `https://liuliangfeng.com/wechat` | 微信消息推送入口 |
| 公众号二维码 | 公众号后台下载 | 前端展示用 |
| JWT | HS256，7天有效，密钥来自环境变量 `JWT_SECRET` | 登录态 |
| DB | MySQL（本地 Docker: 127.0.0.1:3307/lf_login；服务器: localhost/lf_login） | 存储用户与验证码 |

**环境变量示例（本地 .env.local / 服务器 .env.production）**
```
WECHAT_TOKEN=yinsheng2026
WECHAT_ENCODING_AES_KEY=b7oWEUkQ1YcgUML2Y7tmcdtEJFMMtnKAHY9q4ckr7g
WECHAT_APP_ID=wxff266f4c77e4bf29
WECHAT_APP_SECRET=14e99dfed69cdd73e63dbe6365bb9abc

JWT_SECRET=<生成一条32+位随机串>

DB_HOST=127.0.0.1
DB_PORT=3307     # 服务器用 3306
DB_NAME=lf_login
DB_USER=lf_app
DB_PASS=<数据库密码>
```

> 安全提示：所有密钥仅放环境变量，不要写入代码仓库；如曾明文暴露，务必旋转密钥。

### 2.2 公众号后台配置

**位置：** 公众号后台 → 设置与开发 → 基本配置 → 服务器配置（消息推送）

需要配置：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| URL | `https://你的域名/wechat` | 接收微信消息的接口地址 |
| Token | 自定义，如 `MyToken123` | 用于验证消息来源 |
| EncodingAESKey | 随机生成或自动生成 | 消息加密密钥 |
| 消息加密方式 | 明文模式（开发阶段建议） | 可选明文/兼容/安全模式 |

**注意：** 点击提交时，微信会立即向你的URL发送验证请求，需要先部署好接口。

### 2.3 需要获取的信息

| 信息 | 位置 | 用途 |
|------|------|------|
| AppID | 公众号后台 → 基本配置 | 备用 |
| Token | 服务器配置（自己设置的） | 验证微信消息 |
| 公众号二维码 | 公众号后台 → 账号设置 → 二维码 | 各端展示用 |

---

## 三、接口清单

### 3.1 后端需要实现的接口

| 接口 | 方法 | 路径 | 用途 | 调用方 |
|------|------|------|------|--------|
| 微信消息接收 | GET | /wechat | 服务器验证 | 微信 |
| 微信消息接收 | POST | /wechat | 接收消息，返回验证码 | 微信 |
| 验证码登录 | POST | /api/login/code | 验证码登录 | 各端 |
| 获取用户信息 | GET | /api/user/info | 获取当前用户 | 各端 |

### 3.2 接口调用关系

```
用户发送「登录」
      │
      ▼
┌─────────────────┐
│     微信服务器   │
└────────┬────────┘
         │ POST /wechat
         ▼
┌─────────────────┐
│    你的服务器    │ ──生成验证码──> 数据库
└────────┬────────┘
         │ 返回验证码消息
         ▼
┌─────────────────┐
│     微信服务器   │
└────────┬────────┘
         │
         ▼
      用户收到验证码
         │
         │ 输入验证码
         ▼
┌─────────────────┐
│  官网/插件/软件  │
└────────┬────────┘
         │ POST /api/login/code
         ▼
┌─────────────────┐
│    你的服务器    │ ──验证验证码──> 数据库
└────────┬────────┘
         │ 返回token
         ▼
      登录成功
```

---

## 四、微信消息接收详解

### 4.1 服务器验证（GET /wechat）

配置服务器时，微信会发送GET请求验证。

**请求参数：**

| 参数 | 说明 |
|------|------|
| signature | 微信加密签名 |
| timestamp | 时间戳 |
| nonce | 随机数 |
| echostr | 随机字符串 |

**验证逻辑：**

```
1. 将 token、timestamp、nonce 按字典序排序
2. 拼接成字符串，进行 SHA1 加密
3. 与 signature 对比，相同则验证通过
4. 返回 echostr
```

### 4.2 接收文本消息（POST /wechat）

**接收到的XML格式：**

```xml
<xml>
  <ToUserName><![CDATA[公众号原始ID]]></ToUserName>
  <FromUserName><![CDATA[用户的openid]]></FromUserName>
  <CreateTime>1348831860</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[登录]]></Content>
  <MsgId>1234567890123456</MsgId>
</xml>
```

**字段说明：**

| 字段 | 说明 |
|------|------|
| ToUserName | 公众号原始ID |
| FromUserName | 用户的openid，用于识别用户 |
| MsgType | 消息类型，文本为 `text` |
| Content | 用户发送的内容 |
| MsgId | 消息ID |

### 4.3 被动回复验证码

**回复XML格式：**

```xml
<xml>
  <ToUserName><![CDATA[用户的openid]]></ToUserName>
  <FromUserName><![CDATA[公众号原始ID]]></FromUserName>
  <CreateTime>1704067200</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[您的登录验证码是：684523，5分钟内有效，请勿泄露给他人。]]></Content>
</xml>
```

**注意：**
- 必须在5秒内返回
- ToUserName 和 FromUserName 要对调
- 不想回复时返回空字符串

### 4.4 关键词识别

支持以下关键词触发验证码：

| 关键词 | 说明 |
|--------|------|
| 登录 | 主要 |
| 登陆 | 兼容错别字 |
| dl | 简写 |
| DL | 大写 |

---

## 五、数据库设计

### 5.1 用户表（users）

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  openid VARCHAR(64) NOT NULL UNIQUE COMMENT '微信openid',
  nickname VARCHAR(64) DEFAULT NULL COMMENT '昵称（用户自设）',
  avatar VARCHAR(255) DEFAULT NULL COMMENT '头像（用户自传）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_openid (openid)
) COMMENT='用户表';
```

### 5.2 验证码表（login_codes）

```sql
CREATE TABLE login_codes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(6) NOT NULL COMMENT '6位验证码',
  openid VARCHAR(64) NOT NULL COMMENT '用户openid',
  status ENUM('unused', 'used', 'expired') DEFAULT 'unused' COMMENT '状态',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expired_at DATETIME NOT NULL COMMENT '过期时间',
  INDEX idx_code (code),
  INDEX idx_openid (openid),
  INDEX idx_expired_at (expired_at)
) COMMENT='登录验证码表';
```

**状态说明：**

| 状态 | 说明 |
|------|------|
| unused | 未使用 |
| used | 已使用 |
| expired | 已过期 |

---

## 六、接口详细设计

### 6.1 微信消息接收接口

**路径：** `/wechat`

**GET请求 - 服务器验证：**

```
请求：GET /wechat?signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
返回：echostr（验证成功）或 error（验证失败）
```

**POST请求 - 接收消息：**

处理逻辑：

```
1. 解析XML
2. 判断 MsgType 是否为 "text"
3. 判断 Content 是否匹配登录关键词（登录/登陆/dl/DL）
4. 如果匹配：
   a. 检查该openid是否有未过期的验证码，有则复用
   b. 没有则生成新的6位数字验证码
   c. 存入 login_codes 表
   d. 返回验证码消息
5. 如果不匹配：返回空字符串或默认回复
```

**验证码生成逻辑：**

```javascript
// 伪代码
async function handleLoginKeyword(openid) {
  // 1. 检查是否有未过期的验证码
  const existing = await db.query(`
    SELECT code FROM login_codes 
    WHERE openid = ? AND status = 'unused' AND expired_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `, [openid]);
  
  if (existing.length > 0) {
    return existing[0].code; // 复用已有验证码
  }
  
  // 2. 检查请求频率（1分钟内最多3次）
  const recentCount = await db.query(`
    SELECT COUNT(*) as count FROM login_codes 
    WHERE openid = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
  `, [openid]);
  
  if (recentCount[0].count >= 3) {
    return null; // 请求过于频繁
  }
  
  // 3. 生成新验证码
  const code = String(Math.floor(100000 + Math.random() * 900000));
  
  await db.query(`
    INSERT INTO login_codes (code, openid, expired_at) 
    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
  `, [code, openid]);
  
  return code;
}
```

### 6.2 验证码登录接口

**路径：** `POST /api/login/code`

**请求参数：**

```json
{
  "code": "684523"
}
```

| 参数 | 必填 | 说明 |
|------|------|------|
| code | 是 | 6位验证码 |

**返回 - 成功：**

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "openid": "oXxx...",
      "nickname": null,
      "avatar": null
    }
  }
}
```

**返回 - 失败：**

```json
{
  "code": 1001,
  "message": "验证码错误或已过期"
}
```

**处理逻辑：**

```
1. 根据 code 查询 login_codes 表
2. 检查：
   - 是否存在
   - status 是否为 unused
   - expired_at 是否大于当前时间
3. 验证通过：
   a. 更新 login_codes 状态为 used
   b. 根据 openid 查找用户，不存在则创建
   c. 生成 JWT token
   d. 返回 token 和用户信息
4. 验证失败：返回错误
```

### 6.3 获取用户信息接口

**路径：** `GET /api/user/info`

**请求头：**

```
Authorization: Bearer <token>
```

**返回：**

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "openid": "oXxx...",
    "nickname": "用户昵称",
    "avatar": "https://..."
  }
}
```

---

## 七、前端接入规范

本章定义各端（官网、浏览器插件、桌面软件）接入登录系统的统一规范，确保各端实现一致性。

### 7.1 API调用规范

#### 7.1.1 基础配置

```javascript
// 各端统一配置
const CONFIG = {
  // API基础地址（生产环境）
  API_BASE: 'https://api.你的域名.com',
  
  // 公众号二维码图片地址（各端自行存储或使用CDN）
  QRCODE_URL: 'https://cdn.你的域名.com/wechat-qrcode.jpg',
  
  // Token存储键名（统一命名）
  TOKEN_KEY: 'liulangfeng_token',
  USER_KEY: 'liulangfeng_user',
  
  // 验证码长度
  CODE_LENGTH: 6,
  
  // 验证码有效期提示
  CODE_EXPIRE_MINUTES: 5
};
```

#### 7.1.2 请求格式规范

**通用请求头：**

```javascript
// 未登录请求
const headers = {
  'Content-Type': 'application/json'
};

// 已登录请求（需要鉴权的接口）
const authHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};
```

**请求封装示例：**

```javascript
// 统一请求封装
async function request(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE}${endpoint}`;
  
  const defaultOptions = {
    headers: { 'Content-Type': 'application/json' }
  };
  
  // 如果需要鉴权，添加token
  if (options.auth) {
    const token = await getToken(); // 各端实现不同
    if (token) {
      defaultOptions.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  const finalOptions = {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...options.headers }
  };
  
  const response = await fetch(url, finalOptions);
  const data = await response.json();
  
  // 统一处理token过期
  if (data.code === 401) {
    await clearAuth(); // 清除登录态
    throw new Error('登录已过期，请重新登录');
  }
  
  return data;
}
```

#### 7.1.3 接口调用示例

**验证码登录：**

```javascript
async function login(code) {
  return request('/api/login/code', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}
```

**获取用户信息：**

```javascript
async function getUserInfo() {
  return request('/api/user/info', {
    method: 'GET',
    auth: true // 需要鉴权
  });
}
```

### 7.2 响应处理规范

#### 7.2.1 响应格式

**成功响应：**

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

**失败响应：**

```json
{
  "code": 1001,
  "message": "验证码错误或已过期",
  "data": null
}
```

#### 7.2.2 错误码定义

| 错误码 | 说明 | 前端处理 |
|--------|------|----------|
| 0 | 成功 | 正常处理 |
| 401 | 未登录/Token过期 | 清除登录态，跳转登录 |
| 1001 | 验证码错误或已过期 | 提示用户重新获取验证码 |
| 1002 | 验证码格式错误 | 提示输入6位数字 |
| 1003 | 请求过于频繁 | 提示稍后再试 |
| 5000 | 服务器错误 | 提示网络错误，请重试 |

#### 7.2.3 错误处理封装

```javascript
// 统一错误提示文案
const ERROR_MESSAGES = {
  401: '登录已过期，请重新登录',
  1001: '验证码错误或已过期，请重新获取',
  1002: '请输入6位数字验证码',
  1003: '操作太频繁，请稍后再试',
  5000: '服务器开小差了，请稍后重试',
  'network': '网络连接失败，请检查网络'
};

function getErrorMessage(code) {
  return ERROR_MESSAGES[code] || '未知错误，请重试';
}
```

### 7.3 Token管理规范

#### 7.3.1 存储位置

| 端 | 存储方式 | 说明 |
|----|----------|------|
| 官网 | localStorage | 浏览器本地存储 |
| 浏览器插件 | chrome.storage.local | 插件专用存储 |
| 桌面软件 | electron-store | 本地文件存储 |

#### 7.3.2 存储接口规范

各端需要实现以下统一接口：

```javascript
// Token管理接口（各端实现不同，但接口一致）
const AuthStorage = {
  // 保存登录信息
  async save(token, user) { },
  
  // 获取Token
  async getToken() { },
  
  // 获取用户信息
  async getUser() { },
  
  // 清除登录信息
  async clear() { },
  
  // 检查是否已登录
  async isLoggedIn() { }
};
```

#### 7.3.3 各端实现示例

**官网（localStorage）：**

```javascript
const AuthStorage = {
  async save(token, user) {
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
    localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
  },
  
  async getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
  },
  
  async getUser() {
    const user = localStorage.getItem(CONFIG.USER_KEY);
    return user ? JSON.parse(user) : null;
  },
  
  async clear() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
  },
  
  async isLoggedIn() {
    return !!localStorage.getItem(CONFIG.TOKEN_KEY);
  }
};
```

**浏览器插件（chrome.storage）：**

```javascript
const AuthStorage = {
  async save(token, user) {
    return chrome.storage.local.set({
      [CONFIG.TOKEN_KEY]: token,
      [CONFIG.USER_KEY]: user
    });
  },
  
  async getToken() {
    const result = await chrome.storage.local.get(CONFIG.TOKEN_KEY);
    return result[CONFIG.TOKEN_KEY] || null;
  },
  
  async getUser() {
    const result = await chrome.storage.local.get(CONFIG.USER_KEY);
    return result[CONFIG.USER_KEY] || null;
  },
  
  async clear() {
    return chrome.storage.local.remove([CONFIG.TOKEN_KEY, CONFIG.USER_KEY]);
  },
  
  async isLoggedIn() {
    const token = await this.getToken();
    return !!token;
  }
};
```

**桌面软件（electron-store）：**

```javascript
const Store = require('electron-store');
const store = new Store();

const AuthStorage = {
  async save(token, user) {
    store.set(CONFIG.TOKEN_KEY, token);
    store.set(CONFIG.USER_KEY, user);
  },
  
  async getToken() {
    return store.get(CONFIG.TOKEN_KEY) || null;
  },
  
  async getUser() {
    return store.get(CONFIG.USER_KEY) || null;
  },
  
  async clear() {
    store.delete(CONFIG.TOKEN_KEY);
    store.delete(CONFIG.USER_KEY);
  },
  
  async isLoggedIn() {
    return !!store.get(CONFIG.TOKEN_KEY);
  }
};
```

### 7.4 登录态检查规范

#### 7.4.1 检查时机

| 时机 | 说明 |
|------|------|
| 应用启动时 | 检查是否已登录，决定显示登录页还是主页 |
| 调用需鉴权接口前 | 检查token是否存在 |
| 收到401响应时 | Token过期，清除登录态 |
| 用户主动退出时 | 清除登录态 |

#### 7.4.2 检查流程

```javascript
// 应用启动时的登录态检查
async function checkAuthOnStartup() {
  const isLoggedIn = await AuthStorage.isLoggedIn();
  
  if (!isLoggedIn) {
    showLoginView();
    return;
  }
  
  // 可选：验证token是否有效（调用用户信息接口）
  try {
    const result = await getUserInfo();
    if (result.code === 0) {
      showMainView(result.data);
    } else {
      await AuthStorage.clear();
      showLoginView();
    }
  } catch (e) {
    // 网络错误时，先用本地缓存的用户信息
    const user = await AuthStorage.getUser();
    if (user) {
      showMainView(user);
    } else {
      showLoginView();
    }
  }
}
```

### 7.5 UI规范

#### 7.5.1 登录界面布局

```
┌─────────────────────────────────────────┐
│                  🔒                     │  <- 图标（可选）
│              微信扫码登录                │  <- 标题
│       登录后自动解锁相关功能！免费使用    │  <- 功能提示
│  前往官网，获取更多免费AI提效工具         │  <- 副标题（官网为蓝色链接）
│                                         │
│         ┌───────────────────┐           │
│         │                   │           │
│         │    【公众号】      │           │
│         │    【二维码】      │           │
│         │                   │           │
│         │     150~180px     │           │
│         └───────────────────┘           │
│                                         │
│         1. 扫描二维码关注公众号          │  <- 步骤说明
│         2. 发送「登录」获取验证码        │  <- 「登录」高亮显示
│         3. 输入验证码后点击登录          │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │       请输入6位数字验证码        │   │  <- 输入框
│   └─────────────────────────────────┘   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │           ✓ 登录                │   │  <- 登录按钮
│   └─────────────────────────────────┘   │
│                                         │
│     如登录遇到问题，请联系微信：teaxh613  │  <- 底部提示
│                                         │
└─────────────────────────────────────────┘
```

#### 7.5.2 统一文案（必须遵守）

| 位置 | 文案 | 必须 |
|------|------|------|
| 标题 | 微信扫码登录 | ✅ |
| 功能提示 | 登录后自动解锁相关功能！免费使用 | ✅ |
| 副标题 | 前往[官网]，获取更多免费AI提效工具（官网为链接） | ✅ |
| 步骤1 | 扫描二维码关注公众号 | ✅ |
| 步骤2 | 发送「登录」获取验证码（「登录」高亮） | ✅ |
| 步骤3 | 输入验证码后点击登录 | ✅ |
| 输入框占位符 | 请输入6位数字验证码 | ✅ |
| 登录按钮 | 登录 | ✅ |
| 底部提示 | 如登录遇到问题，请联系微信：teaxh613 | ✅ |
| 登录成功 | 登录成功 | ✅ |
| 退出按钮 | 退出登录 | ✅ |

#### 7.5.3 样式规范（各端自定义）

**样式由各端根据自身产品风格自行设计，但需遵守以下规范：**

| 规范项 | 要求 |
|--------|------|
| 布局结构 | 按照7.5.1的布局顺序排列 |
| 文案内容 | 必须使用7.5.2定义的统一文案 |
| 官网链接 | 必须可点击，跳转到官网 |
| 「登录」高亮 | 步骤2中的「登录」需要视觉突出（颜色/加粗） |
| 二维码尺寸 | 建议150px~180px，确保扫码清晰 |
| 输入框 | 居中显示，支持6位数字输入 |
| 响应式 | 适配当前端的容器宽度 |

**各端风格建议：**

| 端 | 风格建议 |
|----|----------|
| 官网 | 与官网整体风格统一 |
| 浏览器插件 | 与插件主界面风格统一 |
| 桌面软件 | 与软件主界面风格统一 |

#### 7.5.4 状态展示

| 状态 | UI表现 |
|------|--------|
| 未登录 | 显示登录界面（二维码+输入框） |
| 登录中 | 按钮显示loading，禁用输入 |
| 登录成功 | 显示用户信息/主界面 |
| 登录失败 | 显示错误提示，可重新输入 |
| 已登录 | 显示用户信息+退出按钮 |

#### 7.5.4 输入框规范

```javascript
// 验证码输入框行为规范
const codeInputRules = {
  maxLength: 6,           // 最大长度
  inputType: 'tel',       // 调起数字键盘（移动端）
  autoFocus: true,        // 自动聚焦
  allowPattern: /^\d*$/,  // 只允许数字
  
  // 输入过滤
  onInput(value) {
    return value.replace(/\D/g, '').slice(0, 6);
  },
  
  // 验证
  validate(value) {
    return /^\d{6}$/.test(value);
  }
};
```

### 7.6 登录流程封装

各端可直接使用的登录流程封装：

```javascript
// 统一登录流程
class LoginManager {
  constructor(authStorage, showMessage) {
    this.authStorage = authStorage;
    this.showMessage = showMessage; // 各端的消息提示函数
  }
  
  // 执行登录
  async login(code) {
    // 1. 验证码格式检查
    if (!code || !/^\d{6}$/.test(code)) {
      this.showMessage('请输入6位数字验证码');
      return { success: false };
    }
    
    try {
      // 2. 调用登录接口
      const result = await request('/api/login/code', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      
      // 3. 处理结果
      if (result.code === 0) {
        // 保存登录信息
        await this.authStorage.save(result.data.token, result.data.user);
        this.showMessage('登录成功');
        return { success: true, user: result.data.user };
      } else {
        this.showMessage(getErrorMessage(result.code));
        return { success: false };
      }
    } catch (e) {
      this.showMessage('网络错误，请重试');
      return { success: false };
    }
  }
  
  // 退出登录
  async logout() {
    await this.authStorage.clear();
    this.showMessage('已退出登录');
  }
  
  // 检查登录态
  async checkAuth() {
    return this.authStorage.isLoggedIn();
  }
  
  // 获取当前用户
  async getCurrentUser() {
    return this.authStorage.getUser();
  }
}
```

### 7.7 完整接入示例

各端接入只需：

```javascript
// 1. 实现 AuthStorage（参考7.3.3）
const AuthStorage = { /* 各端实现 */ };

// 2. 实现消息提示函数
function showMessage(msg) {
  // 官网：alert(msg) 或 toast组件
  // 插件：alert(msg)
  // 软件：dialog.showMessageBox(...)
}

// 3. 创建登录管理器
const loginManager = new LoginManager(AuthStorage, showMessage);

// 4. 绑定UI事件
document.getElementById('login-btn').onclick = async () => {
  const code = document.getElementById('code-input').value;
  const result = await loginManager.login(code);
  if (result.success) {
    showMainView(result.user);
  }
};

document.getElementById('logout-btn').onclick = async () => {
  await loginManager.logout();
  showLoginView();
};

// 5. 应用启动时检查登录态
async function init() {
  const isLoggedIn = await loginManager.checkAuth();
  if (isLoggedIn) {
    const user = await loginManager.getCurrentUser();
    showMainView(user);
  } else {
    showLoginView();
  }
}

init();
```

---

## 八、各端实现示例

### 8.1 通用登录组件

各端都需要实现相同的登录UI和逻辑，只是技术栈不同。

**UI组成：**
1. 公众号二维码图片（固定，提前下载好）
2. 登录步骤说明文字
3. 验证码输入框（6位数字）
4. 登录按钮

**逻辑流程：**

```javascript
// 通用登录逻辑（伪代码）

// 1. 用户输入验证码后点击登录
async function handleLogin(code) {
  // 校验格式
  if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
    showError('请输入6位数字验证码');
    return;
  }
  
  // 调用登录接口
  const response = await fetch('https://你的域名/api/login/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  
  const result = await response.json();
  
  if (result.code === 0) {
    // 登录成功，保存token
    saveToken(result.data.token);
    saveUser(result.data.user);
    showSuccess('登录成功');
  } else {
    showError(result.message);
  }
}
```

### 8.2 官网实现

**HTML结构（必须包含的元素）：**

```html
<div class="login-container">
  <!-- 图标（可选） -->
  <div class="login-icon">🔒</div>
  
  <!-- 标题（必须） -->
  <h2 class="login-title">微信扫码登录</h2>
  
  <!-- 功能提示（必须） -->
  <p class="login-benefit">登录后自动解锁相关功能！免费使用</p>
  
  <!-- 官网链接（必须） -->
  <p class="login-subtitle">
    前往<a href="https://你的官网域名" target="_blank">官网</a>，获取更多免费AI提效工具
  </p>
  
  <!-- 二维码（必须） -->
  <div class="qrcode-section">
    <img src="/images/wechat-qrcode.jpg" alt="公众号二维码" />
  </div>
  
  <!-- 步骤说明（必须） -->
  <div class="steps">
    <p>1. 扫描二维码关注公众号</p>
    <p>2. 发送<span class="highlight">「登录」</span>获取验证码</p>
    <p>3. 输入验证码后点击登录</p>
  </div>
  
  <!-- 输入框（必须） -->
  <input type="text" id="code-input" placeholder="请输入6位数字验证码" maxlength="6" />
  
  <!-- 登录按钮（必须） -->
  <button id="login-btn" onclick="handleLogin()">登录</button>
  
  <!-- 底部提示（必须） -->
  <p class="login-footer">如登录遇到问题，请联系微信：teaxh613</p>
</div>
```

**CSS样式（示例，各端自定义）：**

```css
/* 以下为示例样式，请根据官网整体风格自行调整 */
.login-container {
  /* 根据官网风格设置背景、padding、圆角等 */
  padding: 40px;
  border-radius: 12px;
  text-align: center;
  max-width: 360px;
  margin: 0 auto;
}

.login-title {
  /* 标题样式 */
  font-size: 20px;
  margin-bottom: 8px;
}

.login-benefit {
  /* 功能提示样式 */
  font-size: 14px;
  margin-bottom: 4px;
}

.login-subtitle {
  /* 副标题样式 */
  font-size: 14px;
  margin-bottom: 24px;
}

.login-subtitle a {
  /* 官网链接必须可识别为链接 */
  color: #4a9eff; /* 或其他链接色 */
  text-decoration: none;
}

.qrcode-section img {
  /* 二维码尺寸 150~180px */
  width: 160px;
  height: 160px;
}

.steps {
  /* 步骤说明样式 */
  margin: 20px 0;
  text-align: left;
}

.steps .highlight {
  /* 「登录」高亮样式 */
  color: #4a9eff; /* 或其他突出颜色 */
  font-weight: bold;
}

#code-input {
  /* 输入框样式 */
  width: 100%;
  padding: 14px;
  font-size: 16px;
  text-align: center;
  margin-bottom: 16px;
}

#login-btn {
  /* 登录按钮样式 */
  width: 100%;
  padding: 14px;
  font-size: 16px;
  cursor: pointer;
}

.login-footer {
  /* 底部提示样式 */
  font-size: 12px;
  margin-top: 20px;
}
```

**JavaScript：**

```javascript
async function handleLogin() {
  const code = document.getElementById('code-input').value.trim();
  
  if (!code || code.length !== 6) {
    alert('请输入6位验证码');
    return;
  }
  
  try {
    const res = await fetch('/api/login/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const data = await res.json();
    
    if (data.code === 0) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      window.location.href = '/dashboard';
    } else {
      alert(data.message || '登录失败');
    }
  } catch (e) {
    alert('网络错误，请重试');
  }
}

// 验证码输入优化
document.getElementById('code-input').addEventListener('input', function(e) {
  // 只允许数字
  this.value = this.value.replace(/\D/g, '');
});
```

### 8.3 浏览器插件实现

**popup.html（必须包含的元素）：**

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* 样式根据插件整体风格自定义，以下为示例 */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      width: 320px; 
      padding: 24px; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      /* 背景色根据插件风格设置 */
    }
    /* ... 其他样式自定义 ... */
    
    /* 必须：「登录」高亮样式 */
    .highlight { color: #4a9eff; font-weight: bold; }
    
    /* 必须：官网链接可识别 */
    .login-subtitle a { color: #4a9eff; text-decoration: none; }
  </style>
</head>
<body>
  <!-- 未登录状态 -->
  <div id="login-view">
    <!-- 图标（可选） -->
    <div class="login-icon">🔒</div>
    
    <!-- 标题（必须） -->
    <h3 class="login-title">微信扫码登录</h3>
    
    <!-- 功能提示（必须） -->
    <p class="login-benefit">登录后自动解锁相关功能！免费使用</p>
    
    <!-- 官网链接（必须） -->
    <p class="login-subtitle">
      前往<a href="https://你的官网域名" target="_blank">官网</a>，获取更多免费AI提效工具
    </p>
    
    <!-- 二维码（必须） -->
    <img class="qrcode" src="qrcode.jpg" />
    
    <!-- 步骤说明（必须） -->
    <div class="steps">
      <p>1. 扫描二维码关注公众号</p>
      <p>2. 发送<span class="highlight">「登录」</span>获取验证码</p>
      <p>3. 输入验证码后点击登录</p>
    </div>
    
    <!-- 输入框（必须） -->
    <input type="text" id="code-input" placeholder="请输入6位数字验证码" maxlength="6" />
    
    <!-- 登录按钮（必须） -->
    <button id="login-btn">登录</button>
    
    <!-- 底部提示（必须） -->
    <p class="login-footer">如登录遇到问题，请联系微信：teaxh613</p>
  </div>
  
  <!-- 已登录状态 -->
  <div id="user-view" style="display:none;">
    <div class="user-info">
      <p>👤</p>
      <p id="user-name"></p>
    </div>
    <button class="logout-btn" id="logout-btn">退出登录</button>
  </div>
  
  <script src="popup.js"></script>
</body>
</html>
```

**popup.js：**

```javascript
const API_BASE = 'https://你的域名';

// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', async () => {
  const { token, user } = await chrome.storage.local.get(['token', 'user']);
  
  if (token && user) {
    showUserView(user);
  } else {
    showLoginView();
  }
});

// 显示登录界面
function showLoginView() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('user-view').style.display = 'none';
}

// 显示用户界面
function showUserView(user) {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('user-view').style.display = 'block';
  document.getElementById('user-name').textContent = user.nickname || '用户' + user.id;
}

// 登录
document.getElementById('login-btn').addEventListener('click', async () => {
  const code = document.getElementById('code-input').value.trim();
  
  if (!code || code.length !== 6) {
    alert('请输入6位验证码');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/login/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const data = await res.json();
    
    if (data.code === 0) {
      await chrome.storage.local.set({
        token: data.data.token,
        user: data.data.user
      });
      showUserView(data.data.user);
    } else {
      alert(data.message || '登录失败');
    }
  } catch (e) {
    alert('网络错误，请重试');
  }
});

// 退出登录
document.getElementById('logout-btn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'user']);
  showLoginView();
});

// 只允许输入数字
document.getElementById('code-input').addEventListener('input', function() {
  this.value = this.value.replace(/\D/g, '');
});
```

**manifest.json（V3）：**

```json
{
  "manifest_version": 3,
  "name": "你的插件名称",
  "version": "1.0.0",
  "permissions": ["storage"],
  "host_permissions": ["https://你的域名/*"],
  "action": {
    "default_popup": "popup.html"
  }
}
```

### 8.4 桌面软件实现（Electron）

**login.html（必须包含的元素）：**

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* 样式根据软件整体风格自定义，以下为示例 */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 30px;
      text-align: center;
      /* 背景色、文字色根据软件风格设置 */
    }
    /* ... 其他样式自定义 ... */
    
    /* 必须：「登录」高亮样式 */
    .highlight { color: #4a9eff; font-weight: bold; }
    
    /* 必须：官网链接可识别 */
    .login-subtitle a { color: #4a9eff; text-decoration: none; cursor: pointer; }
  </style>
</head>
<body>
  <!-- 图标（可选） -->
  <div class="login-icon">🔒</div>
  
  <!-- 标题（必须） -->
  <h2 class="login-title">微信扫码登录</h2>
  
  <!-- 功能提示（必须） -->
  <p class="login-benefit">登录后自动解锁相关功能！免费使用</p>
  
  <!-- 官网链接（必须） -->
  <p class="login-subtitle">
    前往<a href="#" onclick="openWebsite()">官网</a>，获取更多免费AI提效工具
  </p>
  
  <!-- 二维码（必须） -->
  <img class="qrcode" src="./assets/qrcode.jpg" />
  
  <!-- 步骤说明（必须） -->
  <div class="steps">
    <p>1. 扫描二维码关注公众号</p>
    <p>2. 发送<span class="highlight">「登录」</span>获取验证码</p>
    <p>3. 输入验证码后点击登录</p>
  </div>
  
  <!-- 输入框（必须） -->
  <br>
  <input type="text" id="code-input" placeholder="请输入6位数字验证码" maxlength="6" />
  
  <!-- 登录按钮（必须） -->
  <br>
  <button onclick="handleLogin()">登录</button>
  
  <!-- 底部提示（必须） -->
  <p class="login-footer">如登录遇到问题，请联系微信：teaxh613</p>
  
  <script>
    const { ipcRenderer, shell } = require('electron');
    
    // 打开官网
    function openWebsite() {
      shell.openExternal('https://你的官网域名');
    }
    
    // 登录
    async function handleLogin() {
      const code = document.getElementById('code-input').value.trim();
      
      if (!code || code.length !== 6) {
        alert('请输入6位数字验证码');
        return;
      }
      
      ipcRenderer.send('login', code);
    }
    
    // 接收登录结果
    ipcRenderer.on('login-result', (event, result) => {
      if (result.success) {
        alert('登录成功');
        window.location.href = './main.html';
      } else {
        alert(result.message || '登录失败');
      }
    });
    
    // 只允许输入数字
    document.getElementById('code-input').addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '');
    });
  </script>
</body>
</html>
```

**main.js（主进程）：**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store');
const fetch = require('node-fetch');

const store = new Store();
const API_BASE = 'https://你的域名';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // 检查是否已登录
  const token = store.get('token');
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
    const res = await fetch(`${API_BASE}/api/login/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const data = await res.json();
    
    if (data.code === 0) {
      store.set('token', data.data.token);
      store.set('user', data.data.user);
      event.reply('login-result', { success: true });
    } else {
      event.reply('login-result', { success: false, message: data.message });
    }
  } catch (e) {
    event.reply('login-result', { success: false, message: '网络错误' });
  }
});

// 获取登录状态
ipcMain.handle('get-auth', () => {
  return {
    token: store.get('token'),
    user: store.get('user')
  };
});

// 退出登录
ipcMain.on('logout', () => {
  store.delete('token');
  store.delete('user');
  mainWindow.loadFile('login.html');
});
```

---

## 九、安全注意事项

### 8.1 验证码安全

| 规则 | 说明 |
|------|------|
| 格式 | 6位纯数字 |
| 有效期 | 5分钟 |
| 使用次数 | 只能使用一次 |
| 复用机制 | 未过期时重复请求返回同一验证码 |
| 频率限制 | 同一 openid 1 分钟内最多生成 3 次；同一 code 验证失败计数超过 5 次则作废 |
| 过期清理 | 定时任务每小时清理 expired_at < now 的验证码 |

### 8.2 防刷策略

```javascript
// 生成验证码前检查频率
async function checkRateLimit(openid) {
  const count = await db.query(`
    SELECT COUNT(*) as count FROM login_codes 
    WHERE openid = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
  `, [openid]);
  
  return count[0].count < 3; // 1分钟内最多3次
}

// 验证码失败计数（伪代码）
async function markFailed(code) {
  await db.query(`
    UPDATE login_codes 
    SET fail_count = IFNULL(fail_count, 0) + 1,
        status = IF(fail_count + 1 >= 5, 'expired', status)
    WHERE code = ?
  `, [code]);
}
```

### 8.3 Token安全

- 使用 JWT 签名
- 设置合理过期时间（如7天）
- HTTPS 传输

---

## 十、完整时序图

```
┌──────┐     ┌─────────┐     ┌─────────┐     ┌──────┐     ┌──────┐
│ 用户 │     │各端应用  │     │ 后端    │     │ 微信 │     │数据库│
│      │     │官网/插件/│     │         │     │      │     │      │
│      │     │软件     │     │         │     │      │     │      │
└──┬───┘     └────┬────┘     └────┬────┘     └──┬───┘     └──┬───┘
   │              │               │             │            │
   │ 点击登录     │               │             │            │
   │─────────────>│               │             │            │
   │              │               │             │            │
   │ 显示二维码+输入框            │             │            │
   │<─────────────│               │             │            │
   │              │               │             │            │
   │ 扫码关注公众号                │             │            │
   │──────────────────────────────────────────>│            │
   │              │               │             │            │
   │ 发送「登录」                  │             │            │
   │──────────────────────────────────────────>│            │
   │              │               │             │            │
   │              │               │ POST /wechat│            │
   │              │               │<────────────│            │
   │              │               │             │            │
   │              │               │ 生成验证码               │
   │              │               │────────────────────────>│
   │              │               │             │            │
   │              │               │ 返回验证码XML            │
   │              │               │────────────>│            │
   │              │               │             │            │
   │ 收到验证码「684523」          │             │            │
   │<──────────────────────────────────────────│            │
   │              │               │             │            │
   │ 输入验证码   │               │             │            │
   │─────────────>│               │             │            │
   │              │               │             │            │
   │              │ POST /api/login/code        │            │
   │              │──────────────>│             │            │
   │              │               │             │            │
   │              │               │ 验证验证码               │
   │              │               │────────────────────────>│
   │              │               │       验证通过           │
   │              │               │<────────────────────────│
   │              │               │             │            │
   │              │ 返回token+user│             │            │
   │              │<──────────────│             │            │
   │              │               │             │            │
   │              │ 保存token     │             │            │
   │              │               │             │            │
   │ 登录成功     │               │             │            │
   │<─────────────│               │             │            │
```

---

## 十一、参考文档

| 文档名称 | 链接 |
|----------|------|
| 接收普通消息 | https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html |
| 被动回复用户消息 | https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Passive_user_reply_message.html |
| 接收事件推送 | https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_event_pushes.html |

---

## 十二、开发检查清单

### 12.1 准备工作
- [ ] 公众号已认证
- [ ] 已下载公众号关注二维码
- [ ] 服务器已部署（HTTPS）
- [ ] 数据库表已创建（users、login_codes）

### 12.2 后端开发
- [ ] GET /wechat 服务器验证接口
- [ ] POST /wechat 消息接收接口
- [ ] 关键词识别（登录/登陆/dl）
- [ ] 验证码生成逻辑
- [ ] 验证码防刷策略
- [ ] POST /api/login/code 登录接口
- [ ] GET /api/user/info 用户信息接口
- [ ] JWT token 生成
- [ ] 统一响应格式（code/message/data）
- [ ] 错误码定义

### 12.3 公众号配置
- [ ] 服务器URL已配置
- [ ] Token已配置
- [ ] 消息推送已启用并验证通过

### 12.4 前端通用规范
- [ ] CONFIG配置文件（API地址、存储键名等）
- [ ] AuthStorage存储接口实现
- [ ] 统一请求封装（含鉴权处理）
- [ ] 错误码映射和提示文案
- [ ] LoginManager登录流程封装

### 12.5 官网
- [ ] 登录页面（二维码 + 输入框）
- [ ] AuthStorage实现（localStorage）
- [ ] 登录/退出逻辑
- [ ] 登录态检查

### 12.6 浏览器插件
- [ ] 登录弹窗UI
- [ ] AuthStorage实现（chrome.storage）
- [ ] 登录/退出逻辑
- [ ] 登录态检查
- [ ] manifest.json配置

### 12.7 桌面软件
- [ ] 登录窗口UI
- [ ] AuthStorage实现（electron-store）
- [ ] 登录/退出逻辑
- [ ] 登录态检查
- [ ] 主进程/渲染进程通信
