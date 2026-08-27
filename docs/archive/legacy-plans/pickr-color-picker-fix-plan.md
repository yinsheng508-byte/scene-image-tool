# Pickr 颜色选择器问题修复规划文档

## 文档信息
- **创建日期**: 2026-01-28
- **分析来源**: Claude Opus 4.5 + Gemini + Codex 综合分析
- **涉及文件**:
  - `desktop/renderer/puzzle/color-picker.js` (核心问题文件)
  - `desktop/renderer/puzzle/index.js` (业务逻辑)
  - `desktop/renderer/puzzle/slot-renderer.js` (坑位渲染)

---

## 一、问题概述

用户报告了三个颜色选择器的问题：

| 问题 | 选择器 | 现象 | 严重程度 |
|------|--------|------|---------|
| 问题一 | 背景颜色 | 能打开，选择后点确认不生效 | 中 |
| 问题二 | 坑位边框颜色 | 能打开，选择后点确认不生效（编辑态看不到/或未选中时无效） | 中 |
| 问题三 | 文字颜色 | 无法打开，且会干扰文字编辑/预览等流程 | 严重 |

---

## 二、系统架构分析

### 2.1 单例模式架构

系统采用**共享单例 Pickr** 模式，所有颜色选择器共用一个实例：

```
┌─────────────────────────────────────────────────────────────┐
│                    color-picker.js                          │
├─────────────────────────────────────────────────────────────┤
│  sharedPickr (单例)      ← 全局唯一 Pickr 实例              │
│  sharedPopover (容器)    ← 自定义浮层容器                   │
│  activeContext (上下文)  ← 当前活动的选择器配置             │
│  pickerRegistry (Map)    ← 注册所有触发器与配置的映射       │
│  lastSaveAt (时间戳)     ← 节流控制                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 完整调用链路

```
用户点击触发器 (.pickr-trigger)
    ↓
handler() [color-picker.js:251]
    ├── event.preventDefault()
    ├── event.stopPropagation()
    └── openPicker(entry)
            ↓
        activeContext = entry
        pickr.setColor(color)  ← ⚠️ 核心问题点
        popover.style.display = "block"
            ↓
用户选择颜色，点击"确定"
            ↓
    ┌───────────────────────────────────────┐
    │  三重事件触发 (竞争条件)              │
    ├───────────────────────────────────────┤
    │  1. pickr.on("save")      [line 168]  │
    │  2. popover click 捕获    [line 19]   │
    │  3. saveBtn click         [line 176]  │
    └───────────────────────────────────────┘
            ↓
handleSave(color)
    ├── resolveColor() 获取颜色
    ├── activeContext.onSave(hexColor)  ← 执行业务回调
    └── hidePopover()
            └── activeContext = null  ← 清空上下文
```

---

## 三、根因分析（综合三方报告）

### 3.1 核心问题：`pickr.setColor()` 触发 `save` 事件

**发现者**: Codex

**问题描述**:
- Pickr 库的 `setColor(color)` 方法在 `silent=false`（默认）时会触发 `save` 事件
- 代码中多处调用 `pickr.setColor(color)` 时没有使用 `silent=true`

**影响位置**:
| 位置 | 代码 | 影响 |
|------|------|------|
| `openPicker()` | `pickr.setColor(color)` [line 207] | 打开时触发 save，提前关闭 |
| `setColor()` API | `ensurePickr().setColor(color)` [line 272] | 同步颜色时触发 save |
| `setPickrColor()` | `ensurePickr().setColor(color)` [line 296] | 外部调用时触发 save |

**问题链路**:
```
openPicker()
    → pickr.setColor(color) [silent=false]
    → Pickr 内部触发 save 事件
    → handleSave() 被调用
    → hidePopover()
    → activeContext = null  ← 上下文被清空！
    → 用户还没选择，选择器已"逻辑关闭"
    → 用户点"确定"时 activeContext 为 null
    → onSave 不执行
```

### 3.2 三重事件绑定导致竞争条件

**发现者**: Gemini

**问题描述**: 同一个"确定"按钮绑定了三处事件监听：

```javascript
// 1. Pickr 内部 save 事件 [line 168]
sharedPickr.on("save", (color) => {
    lastSaveAt = now;
    handleSave(color);
});

// 2. popover 捕获阶段 click [line 19-30]
popover.addEventListener("click", (event) => {
    if (target.classList?.contains("pcr-save")) {
        if (Date.now() - lastSaveAt < 80) return;  // 节流
        handleSave(null);
    }
}, true);

// 3. saveBtn 直接 click [line 176]
saveBtn.addEventListener("click", () => {
    if (Date.now() - lastSaveAt < 80) return;  // 节流
    handleSave(null);
});
```

**问题**:
- 多次触发导致时序混乱（可能出现重复保存/重复关闭）
- 80ms 节流阀可能误判正常操作
- 维护成本高，难以定位“到底是哪一次保存生效”

### 3.3 `handleSave` 未同步 `entry.currentColor`

**发现者**: Codex

**问题代码**: [color-picker.js:185-198]

```javascript
function handleSave(color) {
    // ...
    const hexColor = resolved.toHEXA().toString();
    updateTriggerColor(activeContext.anchorEl, hexColor);
    activeContext.onSave(hexColor, resolved);
    hidePopover();
    // ⚠️ 缺少: activeContext.currentColor = hexColor
}
```

**影响**: 下次打开时 `openPicker()` 读取旧的 `currentColor`，导致颜色"回滚"。

### 3.4 文字编辑状态与颜色选择器的事件冲突（表象由 setColor/save 链引起）

**发现者**: Claude + Codex

**问题链路**:
```
用户双击文字进入编辑模式
    → openTextEditor() [index.js:1456]
    → AppState.editingTextId = textItem.id
    → 创建 textarea，绑定 blur 事件
        ↓
用户点击文字颜色选择器
        ↓
浏览器处理焦点变化
    → textarea 失去焦点
    → blur 回调执行 [index.js:1497-1502]:
        AppState.editingTextId = null
        closeTextEditor()
        updatePropertiesPanel()  ← ⚠️ 关键！
        ↓
updatePropertiesPanel() → updateTextPanel() [index.js:976-995]:
    textColorPicker.setColor()  ← 同步 UI 颜色
        ↓
setColor() 内部触发 save → handleSave() → hidePopover() → activeContext = null
        ↓
导致颜色弹层“逻辑被关闭”，再点击“确定”无法生效
```

### 3.5 编辑态不显示边框颜色（视觉问题）

**发现者**: Gemini

**问题代码**: [slot-renderer.js:12-27]

```javascript
export function drawSlots(ctx, slots, selectedIds) {
    slots.forEach((slot, index) => {
        ctx.strokeStyle = isSelected ? "#1f6f5c" : "rgba(31, 41, 55, 0.55)";  // 固定颜色
        ctx.lineWidth = isSelected ? 2 : 1;
        // ⚠️ 没有使用 slot.style.borderColor
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
    });
}
```

**影响**: 用户在编辑态修改边框颜色后看不到效果，误以为"没生效"。实际上预览/导出时是正确使用 `borderColor` 的 ([preview-mode.js:69-73])。

### 3.6 选中状态可能在颜色选择过程中被清除

**发现者**: Claude

**问题代码**: [index.js:2198-2215]

```javascript
function applySlotStyle(update) {
    if (!AppState.selectedSlotIds.length) return;  // ⚠️ 无选中时静默返回
    // ...
}

function applyTextStyle(update) {
    if (!AppState.selectedTextIds.length) return;  // ⚠️ 同样的问题
    // ...
}
```

**影响**: 如果在颜色选择过程中选中状态被意外清除，`onSave` 回调中的 `applySlotStyle`/`applyTextStyle` 会静默失败。

---

## 四、修复方案

### 4.1 【P0-关键】修复 `setColor` 触发 save 问题

**修改文件**: `color-picker.js`

**修改位置及方案**:

#### 4.1.1 `openPicker()` 函数 [line 207]

```javascript
// 修改前
pickr.setColor(color);

// 修改后
pickr.setColor(color, true);  // silent=true，不触发 save 事件
```

#### 4.1.2 `setColor()` API [line 272]

```javascript
// 修改前
ensurePickr().setColor(color);

// 修改后
ensurePickr().setColor(color, true);
```

#### 4.1.3 `setPickrColor()` 函数 [line 296]

```javascript
// 修改前
ensurePickr().setColor(color);

// 修改后
ensurePickr().setColor(color, true);
```

### 4.2 【P1-重要】移除多余的事件绑定（可作为稳定性修复）

**修改文件**: `color-picker.js`

**方案**: 只保留 `pickr.on("save")` 事件，移除其他两处绑定，减少重复触发与竞态。

#### 4.2.1 移除 `ensurePopover()` 中的 click 监听 [line 17-31]

```javascript
// 删除以下代码块
if (!popover.__bindSave) {
    popover.__bindSave = true;
    popover.addEventListener("click", (event) => {
        // ...
    }, true);
}
```

#### 4.2.2 移除 `ensurePickr()` 中的 saveBtn click 监听 [line 174-180]

```javascript
// 删除以下代码块
const saveBtn = root?.app?.querySelector?.(".pcr-save");
if (saveBtn) {
    saveBtn.addEventListener("click", () => {
        if (Date.now() - lastSaveAt < 80) return;
        handleSave(null);
    });
}
```

### 4.3 【P1-重要】`handleSave` 同步 `currentColor`

**修改文件**: `color-picker.js`

**修改位置**: `handleSave()` 函数 [line 185-198]

```javascript
function handleSave(color) {
    const pickr = ensurePickr();
    const resolved = resolveColor(pickr, color);
    if (!activeContext || !resolved) {
        hidePopover();
        return;
    }
    const hexColor = resolved.toHEXA().toString();

    // 新增: 同步 currentColor
    activeContext.currentColor = hexColor;

    updateTriggerColor(activeContext.anchorEl, hexColor);
    if (typeof activeContext.onSave === "function") {
        activeContext.onSave(hexColor, resolved);
    }
    hidePopover();
}
```

### 4.4 【P1-重要】修复文字编辑 blur 事件冲突（推荐但非唯一方案）

**修改文件**: `index.js`

**修改位置**: `openTextEditor()` 中的 blur 处理 [line 1497-1502]

**方案**: blur 触发时如果颜色弹层已打开，则延迟/跳过关闭编辑器与面板刷新，避免引发 `setColor → save` 链。

```javascript
input.addEventListener("blur", () => {
    const colorPopover = document.querySelector(".puzzle-color-popover");
    const isColorPickerOpen = colorPopover && colorPopover.style.display !== "none";
    if (isColorPickerOpen) return;
    AppState.editingTextId = null;
    closeTextEditor();
    updatePropertiesPanel();
    scheduleRender();
});
```

### 4.5 【P2-建议】增加颜色值校验

**修改文件**: `color-picker.js`

**修改位置**: `openPicker()` 函数 [line 200-216]

```javascript
function openPicker(entry) {
    if (!entry || entry.disabled) return;
    const pickr = ensurePickr();
    activeContext = entry;

    // 新增: 颜色值校验
    let color = entry.currentColor || entry.defaultColor ||
                entry.anchorEl?.dataset?.color || "#ffffff";

    // 验证颜色格式，无效则使用默认值
    if (!isValidColor(color)) {
        console.warn("ColorPicker: invalid color value, using default", color);
        color = entry.defaultColor || "#ffffff";
    }

    updateTriggerColor(entry.anchorEl, color);
    pickr.setColor(color, true);  // silent=true

    // ... 其余代码不变
}

// 新增: 颜色格式校验函数
function isValidColor(color) {
    if (!color || typeof color !== 'string') return false;
    // 支持 #RGB, #RRGGBB, #RRGGBBAA 格式
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}
```

### 4.6 【P2-建议】编辑态显示边框颜色

**修改文件**: `slot-renderer.js`

**修改位置**: `drawSlots()` 函数 [line 12-27]

```javascript
export function drawSlots(ctx, slots, selectedIds) {
    slots.forEach((slot, index) => {
        const isSelected = selectedIds.includes(slot.id);
        ctx.save();

        // 修改: 使用实际的边框样式
        const borderWidth = slot.style?.borderWidth || 0;
        const borderColor = slot.style?.borderColor || "#ffffff";
        const borderRadius = slot.style?.borderRadius || 0;

        // 先绘制用户设置的边框（如果有）
        if (borderWidth > 0) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = borderWidth;
            ctx.setLineDash([]);
            // 如果有圆角，使用 roundRect
            if (borderRadius > 0 && ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(slot.x, slot.y, slot.w, slot.h, borderRadius);
                ctx.stroke();
            } else {
                ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
            }
        }

        // 再绘制选中状态的边框（叠加）
        ctx.strokeStyle = isSelected ? "#1f6f5c" : "rgba(31, 41, 55, 0.55)";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash(isSelected ? [] : [4, 4]);
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);

        ctx.fillStyle = "rgba(31, 111, 92, 0.08)";
        ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
        ctx.restore();

        drawSlotIndex(ctx, slot, index + 1);
    });
}
```

### 4.7 【P3-可选】无选中时禁用颜色选择器

**修改文件**: `index.js`

**修改位置**: `updatePropertiesPanel()` 函数 [line 911]

```javascript
function updatePropertiesPanel() {
    // ... 现有代码 ...

    // 新增: 根据选中状态控制颜色选择器可用性
    if (slotBorderColorPicker) {
        if (selectedSlots.length === 0) {
            slotBorderColorPicker.disable();
        } else {
            slotBorderColorPicker.enable();
        }
    }

    // ... 其余代码 ...
}

function updateTextPanel(selectedTexts, isMixed) {
    // ... 现有代码 ...

    // 新增: 根据选中状态控制颜色选择器可用性
    if (textColorPicker) {
        if (selectedTexts.length === 0) {
            textColorPicker.disable();
        } else {
            textColorPicker.enable();
        }
    }
}
```

---

## 五、修复优先级与实施计划

### 5.1 优先级矩阵

| 优先级 | 修复项 | 影响范围 | 复杂度 | 建议 |
|--------|--------|---------|--------|------|
| P0 | 4.1 setColor silent | 所有选择器 | 低 | **必须修复** |
| P1 | 4.2 移除多余事件 | 所有选择器 | 低 | 建议 |
| P1 | 4.3 同步 currentColor | 所有选择器 | 低 | 强烈建议 |
| P1 | 4.4 blur 事件冲突 | 文字选择器 | 中 | 强烈建议 |
| P2 | 4.5 颜色值校验 | 所有选择器 | 低 | 建议 |
| P2 | 4.6 编辑态边框 | 坑位选择器 | 中 | 建议 |
| P3 | 4.7 禁用状态 | 坑位/文字选择器 | 低 | 可选 |

### 5.2 实施步骤

**第一阶段（核心修复）**:
1. 修改 `color-picker.js`，完成 4.1、4.2、4.3
2. 测试三个颜色选择器的基本功能

**第二阶段（交互优化）**:
3. 修改 `index.js`，完成 4.4
4. 测试文字编辑与颜色选择的协同工作

**第三阶段（增强）**:
5. 完成 4.5、4.6、4.7
6. 全面回归测试

---

## 六、测试用例

### 6.1 背景颜色选择器

| 用例 | 步骤 | 预期结果 |
|------|------|---------|
| 基本选择 | 1. 点击背景颜色块 2. 选择红色 3. 点击确定 | 画布背景变为红色 |
| 模式切换 | 1. 设置为透明模式 2. 打开颜色选择器 3. 选择蓝色 4. 点击确定 | 自动切换为颜色模式，背景变蓝 |
| 重复打开 | 1. 选择红色并确定 2. 重新打开颜色选择器 | 显示红色（而非默认白色） |

### 6.2 坑位边框颜色选择器

| 用例 | 步骤 | 预期结果 |
|------|------|---------|
| 基本选择 | 1. 选中一个坑位 2. 点击边框颜色块 3. 选择绿色 4. 点击确定 | 坑位边框变为绿色（预览模式可见） |
| 无选中 | 1. 取消所有选中 2. 点击边框颜色块 | 颜色选择器禁用或提示 |
| 多选 | 1. 选中多个坑位 2. 修改边框颜色 | 所有选中坑位边框统一变色 |

### 6.3 文字颜色选择器

| 用例 | 步骤 | 预期结果 |
|------|------|---------|
| 基本选择 | 1. 选中一个文字 2. 点击文字颜色块 3. 选择红色 4. 点击确定 | 文字变为红色 |
| 编辑中选择 | 1. 双击文字进入编辑 2. 点击颜色选择器 | 颜色选择器正常打开，可选择颜色 |
| 状态恢复 | 1. 修改文字颜色后 2. 预览 3. 退出预览 | 功能正常，不卡死 |

---

## 七、回滚计划

如果修复后出现新问题，按以下步骤回滚：

1. **保留备份**: 修改前备份 `color-picker.js` 和 `index.js`
2. **分阶段验证**: 每个阶段修复后独立测试
3. **紧急回滚**: 恢复备份文件，重启应用

---

## 八、参考资料

- [Pickr 官方文档](https://github.com/Simonwep/pickr)
- [Pickr setColor API](https://github.com/Simonwep/pickr#setcolorstr-string--null-silent-boolean)
- 三方分析报告（Gemini、Codex）

---

## 九、修改清单总览

| 文件 | 行号 | 修改类型 | 说明 |
|------|------|---------|------|
| color-picker.js | 17-31 | 删除 | 移除 popover click 监听 |
| color-picker.js | 174-180 | 删除 | 移除 saveBtn click 监听 |
| color-picker.js | 192 | 新增 | handleSave 同步 currentColor |
| color-picker.js | 207 | 修改 | setColor 添加 silent=true |
| color-picker.js | 272 | 修改 | setColor 添加 silent=true |
| color-picker.js | 296 | 修改 | setColor 添加 silent=true |
| color-picker.js | 200+ | 新增 | isValidColor 校验函数 |
| index.js | 1497-1502 | 修改 | blur 事件增加延迟处理 |
| index.js | 911+ | 新增 | 无选中时禁用颜色选择器 |
| slot-renderer.js | 12-27 | 修改 | 编辑态显示边框颜色 |
