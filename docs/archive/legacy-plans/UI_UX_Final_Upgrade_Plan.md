# 桌面端视觉与交互体验升级方案 (v4.0 Final)

**版本**: v4.0
**日期**: 2026-01-25
**目标**: 打造 "Modern Clean & Active Red"（现代洁净 & 活力红）的桌面端应用，移除所有 Emoji，采用专业矢量图标，大幅提升视觉质感与交互细腻度。

---

## 1. 核心设计理念

*   **Color (色彩)**: 以 **品牌红 (#DC2626)** 为核心，构建层次分明的红色光谱。背景保持清爽的灰白色调，确保长时间工作的舒适性。
*   **Shape (形态)**: 统一采用 **大圆角 (8px - 16px)** 和 **弥散阴影**，营造亲和力与悬浮感。
*   **Iconography (图标)**: 全面移除 Emoji，使用 **SVG 线性/填充图标** (类 Lucide/Material 风格)，提升专业度。
*   **Motion (动效)**: 引入微交互动画（缩放、位移、流光），赋予界面生命力。

---

## 2. 色彩系统 (Color Palette)

### 2.1 品牌色系 (Red)
用于强调、选中、行动点。

| 变量名 | 色值 (Hex) | 用途 |
| :--- | :--- | :--- |
| `--color-primary` | `#DC2626` (Red 600) | **主色**：主按钮、图标选中、关键文字 |
| `--color-primary-hover` | `#B91C1C` (Red 700) | **悬停**：按钮/链接 Hover 状态 |
| `--color-primary-active`| `#991B1B` (Red 800) | **激活**：按钮按下状态 |
| `--color-primary-soft` | `#FEF2F2` (Red 50) | **背景**：选中项底色、幽灵按钮 Hover、光晕 |
| `--color-primary-ring` | `rgba(220, 38, 38, 0.2)` | **光环**：Focus 聚焦圈、扩散阴影 |

### 2.2 中性色系 (Neutral)
用于背景、边框、普通文字。

| 变量名 | 色值 (Hex) | 用途 |
| :--- | :--- | :--- |
| `--color-bg-page` | `#F9FAFB` (Gray 50) | **页面背景**：大底色 |
| `--color-bg-card` | `#FFFFFF` (White) | **卡片背景**：内容承载区 |
| `--color-text-main` | `#111827` (Gray 900) | **主标题**：最深文字 |
| `--color-text-sub` | `#4B5563` (Gray 600) | **次级文字**：正文、说明 |
| `--color-text-muted` | `#9CA3AF` (Gray 400) | **弱化文字**：占位符、图标默认色 |
| `--color-border` | `#E5E7EB` (Gray 200) | **分割线**：边框 |

### 2.3 辅助色 (Functional)
| 变量名 | 色值 | 用途 |
| :--- | :--- | :--- |
| `--color-success` | `#10B981` | 成功状态 (绿色) |
| `--color-warning` | `#F59E0B` | 警告状态 (橙色) |

---

## 3. 图标系统升级 (Iconography)

全面替换 Text Emoji 为 **SVG 图标**。图标风格为：线条宽度 2px，圆头端点 (Stroke-linecap: round)。

### 3.1 导航栏图标映射
| 功能模块 | SVG 图标设计 | 视觉隐喻 |
| :--- | :--- | :--- |
| **文档一键导出** | `<svg>...FileText...</svg>` | 文档 + 导出箭头 |
| **场景化排版** | `<svg>...Image/Layout...</svg>` | 图片/布局网格 |
| **PPT拼图** | `<svg>...Grid/Puzzle...</svg>` | 九宫格/拼图块 |
| **飞书上传** | `<svg>...CloudUpload...</svg>` | 云端 + 上传箭头 |
| **小红书下载** | `<svg>...ShoppingBag...</svg>` | 购物袋/标签 |
| **运行日志** | `<svg>...Activity/Terminal...</svg>` | 脉冲线/命令行 |

### 3.2 交互反馈图标
*   **Toast Success**: 绿色圆底白勾 SVG。
*   **Toast Error**: 红色圆底白叉 SVG。
*   **空状态**: 灰色线性插画 SVG (如空文件夹)。

---

## 4. 组件视觉规范 (Component Design)

### 4.1 按钮 (Buttons)
*   **主按钮 (Primary)**:
    *   背景: `--color-primary`
    *   文字: White
    *   阴影: `0 4px 6px -1px var(--color-primary-ring), 0 2px 4px -1px rgba(0,0,0,0.06)` (**彩色弥散阴影**)
    *   圆角: `10px`
    *   **动效**: Hover 上浮 1px，阴影扩散；Active 下沉 (Scale 0.98)。
*   **次级按钮 (Secondary)**:
    *   背景: White
    *   边框: `1px solid --color-border`
    *   文字: `--color-text-sub`
    *   **Hover**: 边框变红，文字变红，背景变浅红 (`--color-primary-soft`)。

### 4.2 导航 Tab (Navigation Tabs)
*   **容器**: 玻璃磨砂效果 `backdrop-filter: blur(8px)`, 背景 `rgba(255,255,255,0.8)`。
*   **Tab 项**:
    *   **默认**: 图标灰色，文字灰色，无背景。
    *   **选中**: 背景变为 `--color-primary-soft` (胶囊状)，图标和文字变为 `--color-primary`，图标带有微弱的弹跳动画。

### 4.3 输入框 (Inputs)
*   **默认**: 边框 `--color-border`，背景 `--color-bg-page`。
*   **Hover**: 边框颜色加深。
*   **Focus**: 边框变为 `--color-primary`，并产生 **4px 红色柔光环** (`box-shadow: 0 0 0 4px var(--color-primary-ring)`)。

### 4.4 反馈提示 (Toast & Progress)
*   **Toast**:
    *   位置: **顶部居中 (Top 80px)**，悬浮层级最高。
    *   样式: 白色背景 + **毛玻璃** + 左侧红色竖条 + 弥散阴影。
*   **进度条**:
    *   样式: 红色渐变填充。
    *   **动画**: 增加 **Shimmer (流光)** 效果，斜向光带循环划过。

---

## 5. 实施路径 (Implementation Roadmap)

1.  **Phase 1: 样式重构 (`styles.css`)**
    *   定义 `:root` 新变量。
    *   重置基础元素 (Reset) 及字体优化。
    *   重写 Buttons, Inputs, Cards 基础样式。

2.  **Phase 2: 结构改造 (`index.html`)**
    *   **移除 Emoji**: 将所有 Tab 的 Emoji `<span>` 替换为内联 SVG 代码。
    *   调整 HTML 结构以适配新的 Flex 布局和图标对齐。

3.  **Phase 3: 组件细化 (`compose.css`, `puzzle.css`)**
    *   更新各子页面的按钮、滑块 (Range Input)、复选框样式以匹配红色主题。
    *   优化侧边栏布局和间距。

4.  **Phase 4: 动效注入 (JS & CSS)**
    *   添加 Tab 切换过渡动画。
    *   更新 Toast 的 JS 逻辑 (位置与图标)。
    *   添加进度条流光动画类。

---

*此文档确认为最终执行方案。*
