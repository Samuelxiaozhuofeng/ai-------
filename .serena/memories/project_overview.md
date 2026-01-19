# 项目概览

- 目的：Language Reader（Intelligent Reader），类似 LingQ 的语言学习 EPUB 阅读器，支持翻页阅读、点击单词记录学习状态、可选 AI 词汇分析、Supabase 云存储。
- 前端形态：纯静态站点（HTML/CSS/JS），通过静态服务器运行。
- 后端：Supabase（Auth + Postgres + Storage）；另有可选的 legacy FastAPI + SQLite（已标注为 deprecated）。
- worker：用于云端书籍处理与日文分词（Sudachi），运行在 Node.js 环境。
- 目录结构（高层）：
  - `js/`：前端核心逻辑（views/core/utils/tokenizers/supabase/ui 等）。
  - `styles/`：样式文件。
  - `backend/`：FastAPI 服务（可选）。
  - `worker/`：Node.js worker 服务。
  - `docs/`：Supabase 与运行说明。
  - `openspec/`：规格与变更管理（OpenSpec）。
