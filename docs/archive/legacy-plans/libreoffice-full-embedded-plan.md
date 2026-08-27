# LibreOffice Full 内置版改造项目文档

> 版本：v1.0  
> 日期：2026-03-12  
> 适用范围：`desktop/`（Windows x64）  
> 目标形态：**Full 包内置 LibreOffice，用户单次安装即可导出**

---

## 1. 背景与目标

当前导出链路已切换为 LibreOffice 引擎，但线上仍出现“用户已安装 LibreOffice，应用识别不到（`LO_MISSING_BINARY`）”的问题。根因不是转换能力不足，而是路径发现链路覆盖不全、且主流程与预检存在双实现。

本项目目标：

1. 交付 **Full 内置版**（安装包内含 LibreOffice runtime），实现“安装软件即具备导出能力”。
2. 保持“文档一键导出”全部功能设计不变：批量、`pageLimit`、`3x`、取消、日志、失败清单。
3. 保留前端“下载 LibreOffice”引导，不移除；仅调整文案语义为“备用修复通道”。
4. 统一 LibreOffice 路径解析口径，避免“主流程可用但预检失败”或反之。

---

## 1.1 实施状态（2026-03-12）

| 里程碑 | 状态 | 落地说明 |
|--------|------|---------|
| M1 | 已完成 | 主进程统一 runtime 解析器；预检与主流程单口径 |
| M2 | 已完成 | 新增 `dist:full`、`check-lo-runtime.js`、`vendor/libreoffice` 规范 |
| M3 | 已完成 | 前端弹窗语义升级，保留下载按钮并新增“复制诊断信息” |
| M4 | 已完成 | 补齐发布说明、回滚说明、许可证声明、回归报告 |

关联交付文档：

1. `docs/libreoffice-full-release-notes.md`
2. `docs/libreoffice-full-rollback.md`
3. `docs/libreoffice-third-party-licenses.md`
4. `docs/libreoffice-full-regression-report.md`

---

## 2. 范围与非范围

## 2.1 本次范围

1. 内置 LibreOffice runtime 打包到 `resources/libreoffice/`。
2. 统一路径解析器（主进程与健康检查共用一套结果）。
3. 健康检查改为“消费主进程解析结果 + 轻量环境检查”。
4. 前端安装引导文案与动作升级（保留下载按钮）。
5. 构建脚本、产物体积、发布说明、许可证合规落地。

## 2.2 非范围

1. 不改导出功能语义与 IPC 主契约。
2. 不引入 PPT 缓存策略。
3. 不改现有“小文件并发/大文件串行 + 大文件失败重试”调度策略。
4. 不做跨平台（macOS/Linux）发布。

---

## 3. 现状问题与根因

## 3.1 现状

当前候选路径主要是：

1. `resources/libreoffice/program/soffice.exe`
2. `LIBREOFFICE_PATH`
3. `C:\Program Files\LibreOffice\program\soffice.exe`
4. `C:\Program Files (x86)\LibreOffice\program\soffice.exe`

## 3.2 根因

1. 用户自定义安装路径未覆盖。
2. 未覆盖注册表 `App Paths` 与 `PATH` 中的 `soffice.exe`。
3. 健康检查脚本和主进程各自查找，可能出现结果不一致。
4. 失败提示偏“让用户自行安装”，与 Full 内置目标不一致。

---

## 4. 目标架构（Full 单安装形态）

## 4.1 运行时策略

1. 默认模式：`embedded-first`（优先内置运行时）。
2. 回退模式：`system-fallback`（内置缺失/损坏时，尝试系统安装，仅作兜底）。
3. 强制模式：可通过 `SCENE_LO_RUNTIME_MODE=embedded|system|auto` 覆盖（主要用于测试与排障）。

## 4.2 路径解析统一器

新增统一解析器 `resolveLibreOfficeRuntime()`，返回结构：

```json
{
  "ok": true,
  "path": "C:\\...\\soffice.exe",
  "source": "embedded|env|registry|path|program_files|program_files_x86",
  "version": "26.2.1.2",
  "warnings": []
}
```

全链路只认这一个结果：

1. `runLibreOfficeToPdf` 使用该结果。
2. `office:healthCheck` 使用该结果。
3. 前端弹窗与日志展示该结果来源（`source`）。

## 4.3 Full 包目录设计

```
desktop/
  vendor/
    libreoffice/
      program/soffice.exe
      program/*.dll
      share/**
```

打包后目标：

```
resources/
  libreoffice/
    program/soffice.exe
    ...
```

---

## 5. 前端策略（保留下载引导）

前端不移除“下载 LibreOffice”引导，改为以下语义：

1. 正常情况：不弹安装引导（Full 包应开箱即用）。
2. 内置 runtime 缺失或损坏时：弹窗提示“安装包运行时异常”。
3. 下载按钮：作为备用修复路径保留（用户可手动安装系统 LibreOffice 兜底）。
4. 增加“复制诊断信息”按钮（路径来源、错误码、版本、预检分数）。

---

## 6. 分阶段实施计划

| 里程碑 | 预计工期 | 范围 | 进入条件 | 退出条件 |
|--------|---------|------|---------|---------|
| M1 | 2-3 天 | 统一解析器 + 健康检查改单一口径 | 分支创建完成 | 解析器接管主流程与预检，T1-T4 通过 |
| M2 | 2-4 天 | Full 内置打包接入 | M1 稳定 | 安装包含 LO runtime，T5-T8 通过 |
| M3 | 1-2 天 | 前端引导与文案升级 | M2 稳定 | 弹窗语义与日志对齐，T9-T10 通过 |
| M4 | 2-3 天 | 回归、发布、回滚预案 | M3 稳定 | T11-T14 全通过，可发布 |

## 6.1 总体开发节奏（建议）

| 周期 | 时间 | 目标 | 关键输出 |
|------|------|------|---------|
| Sprint-0 | 0.5 天 | 启动准备 | 分支创建、素材清单、风险清单、负责人明确 |
| Sprint-1 | 2-3 天 | M1 完成 | 路径解析统一、预检口径统一、基础用例通过 |
| Sprint-2 | 2-4 天 | M2 完成 | Full 包内置 LO、构建校验、安装后自检 |
| Sprint-3 | 1-2 天 | M3 完成 | 前端引导升级、诊断复制、用户文档更新 |
| Sprint-4 | 2-3 天 | M4 完成 | 全量回归、发布包、回滚预案、发布说明 |

## 6.2 M1 详细开发规划（2-3 天）

| 日程 | 开发内容 | 并行关系 | 当日验收 |
|------|---------|---------|---------|
| D1 上午 | 设计并实现 `resolveLibreOfficeRuntime()` 返回结构与 source 枚举 | 串行起步 | 本地单测覆盖 `embedded/env/programfiles` |
| D1 下午 | 接入 registry + PATH 发现链路；改 `getLibreOfficePath()` 适配层 | 可与日志改造并行 | `LO_MISSING_BINARY` 仅在全部路径失败时触发 |
| D2 上午 | `runLibreOfficeToPdf` 改读统一解析结果；补启动诊断日志 | 串行 | 日志含 `source/path/version` |
| D2 下午 | `office:healthCheck` 改为消费主进程解析结果，脚本改轻量环境检查 | 串行 | 预检与主流程路径结果一致 |
| D3 | 自测 + 修边 + 代码评审 | 与文档同步并行 | T1-T4 通过，G1 门禁通过 |

## 6.3 M2 详细开发规划（2-4 天）

| 日程 | 开发内容 | 并行关系 | 当日验收 |
|------|---------|---------|---------|
| D1 上午 | 建立 `desktop/vendor/libreoffice` 规范与目录校验规则 | 串行 | 目录检查通过 |
| D1 下午 | 新增 `check-lo-runtime.js`（关键文件与版本信息校验） | 可与 package.json 改造并行 | 缺失文件时构建硬失败 |
| D2 上午 | `package.json` 新增 `dist:full` 与 `extraResources` 注入 | 串行 | 本地可产出 Full 包 |
| D2 下午 | 安装后运行自检（启动日志 + 预检） | 串行 | 全新机器可识别 embedded |
| D3-D4 | 体积评估、构建优化、异常兜底（embedded 损坏回退 system） | 可并行 | T5-T8 通过，G2 门禁通过 |

## 6.4 M3 详细开发规划（1-2 天）

| 日程 | 开发内容 | 并行关系 | 当日验收 |
|------|---------|---------|---------|
| D1 上午 | 更新安装引导弹窗语义（“备用下载”） | 可与日志改造并行 | 不再默认提示“必须先安装” |
| D1 下午 | 增加“复制诊断信息”与重检增强 | 串行 | 客服可直接拿到排障信息 |
| D2 | 更新 `用户说明书.md` 与界面说明 | 可并行 | 文档与实际行为一致，G3 门禁通过 |

## 6.5 M4 详细开发规划（2-3 天）

| 日程 | 开发内容 | 并行关系 | 当日验收 |
|------|---------|---------|---------|
| D1 | 执行 T11-T14（性能、稳定、体积） | 可并行 | 回归报告产出 |
| D2 | 生成发布包、发布说明、许可证声明 | 串行 | 发布材料齐套 |
| D3 | 预发布验收 + 回滚演练 | 串行 | G4 门禁通过，可正式发布 |

## 6.6 阶段门禁（Go / No-Go）

| 门禁 | 进入条件 | 退出判定 |
|------|---------|---------|
| G1（M1） | 统一解析器接管主流程 | 主流程/预检同路径结果，T1-T4 全通过 |
| G2（M2） | Full 打包接入完成 | 全新机器开箱可导出，T5-T8 全通过 |
| G3（M3） | 前端与文档改造完成 | 引导语义正确、诊断可复制、文档可发布 |
| G4（M4） | 全量回归与发布准备完成 | T11-T14 全通过，回滚预案实测可执行 |

## 6.7 并行策略与责任划分（建议）

| 角色 | 主要职责 | 关键产出 |
|------|---------|---------|
| 核心开发 | 主进程解析器、转换链路改造 | `main.js` 变更与单测 |
| 构建发布 | Full 打包、构建校验、产物管理 | `package.json`、构建脚本、安装包 |
| 前端与文档 | 弹窗语义、日志展示、说明书 | `renderer`、用户文档、发布说明 |
| 测试验收 | 边界用例执行、性能对比、回归报告 | T1-T14 报告、Go/No-Go 建议 |

## 6.8 每阶段交付物清单

| 阶段 | 必交付物 |
|------|---------|
| M1 | 统一解析器实现、预检改单口径、T1-T4 测试报告 |
| M2 | Full 安装包、构建校验脚本、T5-T8 测试报告 |
| M3 | 前端引导改造、诊断复制、用户说明书更新 |
| M4 | 全量回归报告、发布说明、回滚说明、许可证声明 |

---

## 7. 详细任务清单（可执行）

## 7.1 Phase 1：统一路径解析与预检口径（M1）

| ID | 开发项 | 涉及文件 | DoD |
|----|------|---------|-----|
| P1-01 | 新增 `resolveLibreOfficeRuntime()` | `desktop/main.js` | 返回 path/source/version，主流程可直接消费 |
| P1-02 | 路径来源扩展：registry + PATH | `desktop/main.js` | 自定义安装路径可识别 |
| P1-03 | `getLibreOfficePath()` 改为适配层 | `desktop/main.js` | 内部委托统一解析器 |
| P1-04 | 健康检查改为依赖主进程结果 | `desktop/main.js`, `desktop/scripts/libreoffice-health-check.ps1` | 不再双实现查找 |
| P1-05 | 统一错误语义（缺失/损坏/不可执行） | `desktop/main.js` | 错误码稳定可追踪 |

## 7.2 Phase 2：Full 内置打包（M2）

| ID | 开发项 | 涉及文件 | DoD |
|----|------|---------|-----|
| P2-01 | 引入 `vendor/libreoffice` 目录规范 | `desktop/vendor/**` | 目录结构固定，可脚本校验 |
| P2-02 | `extraResources` 接入 LO runtime | `desktop/package.json` | 打包后 `resources/libreoffice` 存在 |
| P2-03 | 构建前校验脚本（关键文件存在） | `desktop/scripts/check-lo-runtime.js` | 缺文件时构建失败并提示 |
| P2-04 | 增加 `dist:full` 打包命令 | `desktop/package.json` | 一键产出 Full 包 |
| P2-05 | 安装后自检日志 | `desktop/main.js` | 启动日志可见 source/path/version |

## 7.3 Phase 3：前端引导保留并升级（M3）

| ID | 开发项 | 涉及文件 | DoD |
|----|------|---------|-----|
| P3-01 | Modal 文案改为“内置运行时异常/备用下载” | `desktop/renderer/index.html`, `renderer.js` | 不再默认提示“请先安装” |
| P3-02 | 下载按钮保留，重检按钮强化 | `desktop/renderer/renderer.js` | 可重复重检与落日志 |
| P3-03 | 增加诊断复制能力 | `desktop/renderer/renderer.js` | 一键复制可用于客服排障 |
| P3-04 | 用户说明书更新（Full 形态） | `docs/用户说明书.md` | “无需单独安装 LibreOffice”落地 |

## 7.4 Phase 4：回归与发布（M4）

| ID | 开发项 | 涉及文件 | DoD |
|----|------|---------|-----|
| P4-01 | 大文件与批量回归（300MB、20 文件、3x、pageLimit） | 测试资产 + 脚本 | 全通过且无功能回归 |
| P4-02 | 产物体积与安装时长评估 | 构建产物 | 记录基线并可对比 |
| P4-03 | 回滚开关与发布说明 | 文档 + 配置 | 失败可退回 system-only 构建 |
| P4-04 | 许可证合规检查 | 发布文档 | 第三方声明齐全 |

---

## 8. 文件级改造清单

| 文件 | 修改内容 |
|------|---------|
| `desktop/main.js` | 统一解析器、路径来源扩展、预检口径统一、启动诊断增强 |
| `desktop/scripts/libreoffice-health-check.ps1` | 改为环境检查脚本，不再重复路径发现 |
| `desktop/package.json` | `extraResources` 加入 `vendor/libreoffice`；新增 `dist:full` |
| `desktop/scripts/check-lo-runtime.js` | 新增构建前 LO runtime 完整性校验 |
| `desktop/renderer/index.html` | 保留安装引导弹窗，更新文案 |
| `desktop/renderer/renderer.js` | 引导行为升级、诊断复制、日志语义更新 |
| `docs/用户说明书.md` | 安装说明改为 Full 内置形态 + 异常兜底 |
| `docs/libreoffice-migration.md` | 增补 Full 方案落地状态与引用本文件 |

---

## 9. 验收测试矩阵

## 9.1 功能与稳定性

| 用例 | 输入 | 预期 |
|------|------|------|
| T1 | 单个 300MB PPT，导前 3 页，1x | 成功导出，进度单调增长 |
| T2 | 同一文件，导前 3 页，3x | 成功导出，内存可控，无崩溃 |
| T3 | 20 文件混合（小+大） | 小文件先出结果，大文件串行 |
| T4 | 大文件人为超时一次 | 自动重试 1 次，失败后继续下一个 |
| T5 | pageLimit 大于总页数 | 文件标记 skipped，不影响其他文件 |
| T6 | 取消导出中途触发 | 已完成结果保留，进程可收敛 |

## 9.2 Full 包专项

| 用例 | 场景 | 预期 |
|------|------|------|
| T7 | 全新机器，无系统 LibreOffice | Full 包可直接导出 |
| T8 | 内置 runtime 存在但损坏 | 弹窗提示运行时异常，下载按钮可用 |
| T9 | 有系统安装，内置不可用 | 自动 fallback 到 system，日志记录 source=system |
| T10 | 无网络状态 | 导出不受影响；下载按钮点击提示网络问题 |

## 9.3 性能与资源

| 用例 | 指标 | 目标 |
|------|------|------|
| T11 | 332MB PPT 转 PDF | 与当前 safe 基线持平或更优 |
| T12 | 20 文件并发批次 | CPU 峰值可接受，无持续 100% 卡死 |
| T13 | 内存峰值 | 不出现持续上涨（无明显泄漏） |
| T14 | 打包体积 | Full 包体积记录并纳入发布说明 |

---

## 10. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| 安装包体积显著增加 | 下载慢、分发成本上升 | 发布页明确 Full 包体积；保留增量下载与镜像 |
| 内置 runtime 损坏 | 导出不可用 | 构建前校验 + 启动自检 + system fallback |
| 路径口径不一致 | 误判未安装 | 主进程唯一解析器，预检只消费结果 |
| 许可证遗漏 | 发布合规风险 | 发布清单强制检查许可证文件 |
| 边界场景回归 | 线上稳定性风险 | T1-T14 全量通过后发布 |

---

## 11. 回滚策略

1. 构建层回滚：关闭 Full 资源注入，恢复 system-only 构建。
2. 运行时回滚：`SCENE_LO_RUNTIME_MODE=system` 强制系统模式。
3. UI 回滚：保留下载引导，不影响主流程。
4. 发布回滚：保留上一稳定版本安装包，支持快速替换。

---

## 12. 发布与运维要求

1. 发布物命名建议：
   - `流量蜂虚拟笔记工具 Full x.y.z.exe`
2. 发布说明必须包含：
   - 本版内置 LibreOffice runtime
   - 安装包体积变化
   - 无需单独安装 LibreOffice
   - 异常情况下可通过“下载 LibreOffice”按钮修复
3. 日志必须包含：
   - `loRuntime.source`
   - `loRuntime.path`
   - `loRuntime.version`
   - `errorCode`

---

## 13. 开发完成定义（Definition of Done）

1. Full 包在无系统 LibreOffice 机器上可直接导出。
2. `LO_MISSING_BINARY` 在 Full 正常安装场景中不再出现。
3. 前端引导保留且语义正确（备用修复，不是必装前置）。
4. 大文件、批量、`pageLimit`、`3x` 四类边界场景全部通过。
5. 用户文档、发布文档、许可证声明同步完成。

---

## 14. 附录：建议的最小实现顺序

1. 先做统一解析器与预检改单口径（P1）。
2. 再做 Full 打包接入与构建校验（P2）。
3. 然后做前端文案与诊断增强（P3）。
4. 最后执行回归与发布收口（P4）。
