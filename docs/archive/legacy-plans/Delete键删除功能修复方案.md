# Delete 键删除功能修复方案

## 目标
- 修复图片在“编辑态卡死”后无法用 Delete 删除的问题。
- 让 Delete/Backspace 在不同键盘上行为一致，避免快捷键失效。
- 统一退出文字编辑态的清理逻辑，降低遗漏风险。

## 当前删除优先级
| 元素 | 选中状态 | 删除函数 | 位置 |
|---|---|---|---|
| 图片 (Image) | `AppState.selectedImageIds` | `handleDeleteImage()` | L3087 |
| 文字 (Text) | `AppState.selectedTextIds` | `handleDeleteText()` | L3089 |
| 坑位 (Slot) | `AppState.selectedSlotIds` | `handleDeleteSlot()` | L3091 |

### 当前 Delete 键处理逻辑（`index.js:3084-3093`）
```javascript
if (event.key === "Delete") {
  event.preventDefault();
  if (hasImageSelection) {
    handleDeleteImage();
  } else if (hasTextSelection) {
    handleDeleteText();
  } else {
    handleDeleteSlot();
  }
}
```

## 问题与根因
### BUG-1：编辑态卡死（颜色选择器导致 editingTextId 永久残留）
**位置：** `desktop/renderer/puzzle/index.js:1817-1824`

```javascript
input.addEventListener("blur", () => {
  const colorPopover = document.querySelector(".puzzle-color-popover");
  const isColorPickerOpen = colorPopover && colorPopover.style.display !== "none";
  if (isColorPickerOpen) return;  // 提前 return，清理逻辑永远不执行
  AppState.editingTextId = null;
  closeTextEditor();
  updatePropertiesPanel();
  scheduleRender();
});
```

**后果链：**
1. `AppState.editingTextId` 一直为非 null
2. `textEditInput` 一直为非 null
3. `handleKeyDown` 命中守卫：`if (textEditInput || AppState.editingTextId) return`
4. **Delete/Backspace/Ctrl+Z/Ctrl+C 等快捷键全部失效**

**现有文档方案的问题：**
- 通过 `setInterval` 轮询等待颜色选择器关闭，可能造成额外定时器残留、频繁轮询和难以维护。
- 逻辑分散，未来仍可能遗漏清理点。

### BUG-2：Delete 键缺少 Backspace 兼容
**位置：** `desktop/renderer/puzzle/index.js:3084`

- Mac 上物理 Delete 键实际发送 `Backspace`
- 部分笔记本没有独立 Delete

## 修复方案（建议顺序）
### 1) 统一退出编辑态：`exitTextEditMode()`
**目的：** 任何需要退出编辑态的地方只调用一个方法，避免遗漏。

```javascript
function exitTextEditMode() {
  AppState.editingTextId = null;
  closeTextEditor(); // 内部会清空 textEditInput
}
```

**落点：** blur 处理、删除逻辑、Esc 退出等。

### 2) 修复 Blur + 颜色选择器交互
**推荐方案：事件驱动（避免轮询）**

在 `color-picker.js` 的 `hidePopover()` 内派发事件：
```javascript
function hidePopover() {
  if (!sharedPopover) return;
  sharedPopover.style.display = "none";
  window.removeEventListener("resize", handleReposition);
  window.removeEventListener("scroll", handleReposition, true);
  document.removeEventListener("mousedown", handleOutsideClick, true);
  activeContext = null;
  document.dispatchEvent(new CustomEvent("puzzle-color-picker:hide"));
}
```

在 `index.js` 的 `blur` 中监听一次关闭事件：
```javascript
input.addEventListener("blur", () => {
  const colorPopover = document.querySelector(".puzzle-color-popover");
  const isColorPickerOpen = colorPopover && colorPopover.style.display !== "none";
  if (isColorPickerOpen) {
    const onClose = () => {
      exitTextEditMode();
      updatePropertiesPanel();
      scheduleRender();
    };
    document.addEventListener("puzzle-color-picker:hide", onClose, { once: true });
    return;
  }
  exitTextEditMode();
  updatePropertiesPanel();
  scheduleRender();
});
```

**备选方案（不改 `color-picker.js` 时）：**
- 用 `MutationObserver` 监听 `.puzzle-color-popover` 的 `style.display` 变化，一次性触发 `exitTextEditMode()`。
- 尽量避免 `setInterval` 轮询。

### 3) Delete/Backspace 兼容
```javascript
if (event.key === "Delete" || event.key === "Backspace") {
  event.preventDefault();
  if (hasImageSelection) {
    handleDeleteImage();
  } else if (hasTextSelection) {
    handleDeleteText();
  } else {
    handleDeleteSlot();
  }
}
```

**可选增强：**
- 如果 `event.target` 为 `input/textarea` 或 `contenteditable`，直接 return，避免删除误触。

## 涉及文件
- `desktop/renderer/puzzle/index.js`
- `desktop/renderer/puzzle/color-picker.js`（采用事件方案时）

## 验证用例
| # | 操作步骤 | 预期结果 |
|---|---|---|
| 1 | 添加坑位 → 选中 → 按 Delete | 坑位被删除 |
| 2 | 添加坑位 → 选中 → 按 Backspace | 坑位被删除 |
| 3 | 添加文字 → 选中 → 按 Delete | 文字被删除 |
| 4 | 添加文字 → 选中 → 按 Backspace | 文字被删除 |
| 5 | 添加图片 → 选中 → 按 Delete | 图片被删除 |
| 6 | 添加图片 → 选中 → 按 Backspace | 图片被删除 |
| 7 | Ctrl+A 全选图片 → 按 Delete | 所有图片被删除 |
| 8 | 双击文字进入编辑 → 打开颜色选择器 → 关闭 → 选中图片 → 按 Delete | 图片被删除，快捷键未失效 |
| 9 | 文字编辑态输入框中按 Backspace | 仅删除字符，不触发删除元素 |

## 回滚策略
- 恢复 `index.js` 的 `blur` 处理和 `handleKeyDown` 的旧逻辑即可。
- 若引入事件方案，恢复 `color-picker.js` 的 `hidePopover()` 为原实现即可。
