# code

`code/` 是代码根目录。所有可运行、可交付、可打包的应用主体应位于这里。

## 当前应用

当前 Electron 应用位于：

```text
code/desktop/
```

不要恢复仓库根目录 `desktop/` 双入口；后续开发、验证和打包统一使用 `npm --prefix code/desktop ...`。
