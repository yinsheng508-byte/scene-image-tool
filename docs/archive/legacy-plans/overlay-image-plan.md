# 百变拼图阴影渲染修复（PR1-PR5）落地文档

## 1. 背景与目标

本次改造针对三类阴影问题统一收敛：

- 首次/并发渲染时阴影错位与串绘风险。
- 多坑位重叠时，阴影被错误整体挖空导致“重叠区阴影消失”。
- 预览与导出链路实现不一致，导致结果偏差和机器差异放大。

目标是让“预览 = 导出”，并可通过版本号控制阴影管线策略，支持回滚。

## 2. PR1 - 共享规范层（已落地）

### 改造文件

- `desktop/shared/puzzle-render-spec.mjs`

### 新增能力

- 阴影管线版本常量：
  - `SHADOW_PIPELINE_LEGACY_VERSION = 1`
  - `SHADOW_PIPELINE_VERSION = 2`
- 阴影版本解析：`resolveShadowPipelineVersion(version)`
- 坑位排序统一：`getSlotZOrderValue` / `compareSlotsByZOrder` / `sortSlotsByZOrder`
- 阴影影响范围计算：`getShadowPadding` / `buildShadowInfluenceRect`
- 阴影挖空掩码生成：`buildShadowCutoutMasks(slotEntries, ownerIndex, options)`

### 作用

- 预览与导出统一使用同一套排序和遮挡规则，消除重复实现漂移。

## 3. PR2 - 预览阴影渲染重构（已落地）

### 改造文件

- `desktop/renderer/puzzle/preview-mode.js`

### 关键改造

- 由“公共阴影层 + 全局 destination-out 挖空全部坑位”改为：
  - 按坑位独立阴影层处理；
  - 每个坑位阴影仅对“自身 + 上层相关坑位”做 `destination-out`；
  - 再合并到总阴影层。
- 坑位排序改为复用 `sortSlotsByZOrder`。
- 挖空掩码改为复用 `buildShadowCutoutMasks`。

### 解决的问题

- 避免全局挖空导致的“重叠区阴影被连带擦除”。
- 阻断跨坑位串绘副作用，减少阴影边缘错位。

## 4. PR3 - 导出阴影渲染重构（已落地）

### 改造文件

- `desktop/main.js`

### 关键改造

- 导出时引入共享规范模块并解析阴影版本。
- 坑位排序改为共享 `sortSlotsByZOrder`。
- 阴影合成改为“逐坑位阴影 + 局部挖空”：
  - 阴影先按坑位生成与裁剪；
  - 对每个坑位阴影单独应用 `buildShadowCutoutMasks` 结果（仅自身 + 上层）；
  - 最终统一合并为阴影层。
- 保留 legacy v1 行为（全局 cutout）用于回退。
- `buildSlotCutoutSvg` 增加局部偏移参数，支持局部阴影缓冲区挖空。

### 解决的问题

- 修复“两个图片重叠时重叠部分阴影消失”。
- 保证导出策略与预览一致，降低机器差异。

## 5. PR4 - 阴影回归脚本与诊断（已落地）

### 改造文件

- `desktop/scripts/puzzle-shadow-regression.js`（新增）
- `desktop/package.json`（新增脚本命令）

### 新增回归命令

- `npm --prefix desktop run puzzle:shadow:smoke`

### 覆盖场景

- 重叠坑位（下层阴影应被上层坑位阻断）。
- 远距离坑位（不应被无关坑位阻断）。
- 接壤/近距离坑位（阴影影响范围内应触发阻断）。
- 裁剪放大（`crop.scale` 生效校验，避免误判为阴影问题）。

## 6. PR5 - 版本化接入与发布控制（已落地）

### 改造文件

- `desktop/renderer/puzzle/index.js`
- `desktop/main.js`

### 关键改造

- 渲染端导出 payload 增加：
  - `shadowPipelineVersion: SHADOW_PIPELINE_VERSION`
- 主进程按 `shadowPipelineVersion` 切换阴影策略：
  - `v1`：legacy 全局 cutout（兼容）
  - `v2`：逐坑位局部 cutout（新策略）
- 生成日志新增阴影管线版本输出，便于线上排障。

## 7. 验收清单

执行：

```bash
npm --prefix desktop run puzzle:shadow:smoke
```

手工验收建议：

1. 两坑位有重叠：确认重叠区域仍有合理阴影过渡，不出现“阴影整块消失”。
2. 两坑位接壤：确认边缘不出现跨坑位串绘。
3. 同模板导出与预览对比：阴影方向、强度、边缘一致。
4. 关闭阴影后导出：无残留阴影层。

## 8. 回滚方案

- 将导出 payload 中 `shadowPipelineVersion` 切回 `1`，主进程会自动使用 legacy 阴影逻辑。
- 保留代码级兼容分支，无需回退整个功能包。
