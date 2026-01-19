# 代码风格与约定

- 主要语言：前端使用原生 JavaScript/HTML/CSS；部分工具/worker 使用 Node.js（ESM）。
- JS 组织方式：按功能拆分模块（如 `js/views/`、`js/utils/`），未观察到统一的 TypeScript 或框架约束。
- CSS：集中于 `styles/`，按视图/模块划分文件。
- 说明：仓库未见显式的 lint/format 工具与约定；遵循现有文件的命名与结构即可。