# LibreOffice Full 版发布说明

> 日期：2026-03-12  
> 适用版本：`desktop` Full 安装包

## 本次发布内容

1. 导出引擎改为 Full 内置 LibreOffice 运行时，默认开箱即用。
2. 运行时解析统一为主进程单口径（embedded/env/registry/path/program files）。
3. 预检口径与主流程一致，避免“主流程可用但预检失败”分裂。
4. 导出调度保持既有能力不变（小文件并发、大文件串行、失败重试、pageLimit、3x）。
5. 前端弹窗新增“复制诊断信息”，便于客服与研发排障。

## 构建与产物

1. Full 构建命令：`npm run dist:full`
2. 构建前校验：`npm run check:lo-runtime`
3. 运行时目录映射：`desktop/vendor/libreoffice` -> `resources/libreoffice`

## 发布检查清单

1. 全新机器（无系统 LibreOffice）可直接导出。
2. `LO_MISSING_BINARY` 在 Full 正常安装场景不再出现。
3. 弹窗语义为“运行时异常/备用下载”，不再提示“必须先安装”。
4. `diagnostics.loRuntime` 在导出结果中可见 `mode/source/path/version`。

## 已知限制

1. Full 包体积较大，安装与下载时间会增加。
2. 当内置运行时损坏时，需重装 Full 包或使用系统 LibreOffice 兜底。
