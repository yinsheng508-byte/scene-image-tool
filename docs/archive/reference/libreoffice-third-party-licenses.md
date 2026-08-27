# LibreOffice Full 版第三方许可证说明

> 日期：2026-03-12  
> 适用范围：Full 安装包内置 `LibreOffice runtime`

## 组件清单

1. LibreOffice（The Document Foundation）

## 许可证要求

1. LibreOffice 采用开源许可证发布（包含 MPL/LGPL 等组合条款）。
2. 发布 Full 包时，需在安装包或发布页附带对应许可证文本与版权声明。
3. 若对内置 runtime 做二次分发，应保留上游要求的版权与许可证信息。

## 项目落地要求

1. 在 `desktop/vendor/libreoffice` 放置运行时文件时，同步放入上游 LICENSE/NOTICE 文本。
2. 发布流程中把许可证声明纳入必检项，避免遗漏导致合规风险。
3. 发布说明中明确“本版本内置 LibreOffice runtime”。

## 校验建议

1. 构建前检查 `vendor/libreoffice` 下是否存在许可证文件（例如 `LICENSE*` / `NOTICE*`）。
2. 发布前由发布负责人进行一次人工复核并留存记录。
