# LibreOffice Full 版回归报告（M4）

> 日期：2026-03-12

## 自动化检查结果

1. `node --check desktop/main.js`：通过
2. `node --check desktop/renderer/renderer.js`：通过
3. `npm --prefix desktop run check:lo-runtime`：按预期失败（当前仓库未放入 `soffice.exe/soffice.bin`）

## 功能回归矩阵（待验收）

| 用例 | 结果 | 备注 |
|------|------|------|
| T11: 332MB PPT 转 PDF 性能 | 待验收 | 需在含内置 runtime 的 Full 包执行 |
| T12: 20 文件并发批次 | 待验收 | 关注 CPU 峰值与卡顿 |
| T13: 内存峰值/泄漏 | 待验收 | 建议采集任务全程内存曲线 |
| T14: Full 包体积评估 | 待验收 | 需打包完成后记录安装包大小 |

## 结论

代码与构建链路已完成 M1-M4 改造。  
当前仅缺“内置 runtime 二进制文件”与“本机大文件回归实测”。
