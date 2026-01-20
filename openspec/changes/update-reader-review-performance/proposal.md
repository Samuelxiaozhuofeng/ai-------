# Change: 阅读与复习加载性能优化（Phase 1）

## Why
当前分页与复习加载存在重复 DOM 测量、全量渲染与同步加载的瓶颈，导致首屏与首卡显示延迟，影响阅读与复习体验。

## What Changes
- 新增分页结果缓存到 IndexedDB（bookId + chapterIndex + viewport 维度 + 章节文本哈希/书籍更新时间）
- 页翻模式首屏只渲染当前页与前后各 1 页，其余页面按需懒加载
- 复习界面预加载前 3 张卡片，后续卡片按需加载
- 增加加载指示器与缓存命中率日志
- 缓存失效策略：书籍更新或视口变化时清理旧缓存
- 提供回退开关（禁用缓存，回到原分页路径）

## Impact
- Affected specs: reader-interface, srs-review
- Affected code: js/views/reader/pagination-engine.js, js/views/reader/chapter-manager.js, js/views/reader/reader-controller.js, js/views/review.js, js/db.js, js/ui/loading.js, styles/views/reader.css
- 迁移: 无迁移，直接替换
