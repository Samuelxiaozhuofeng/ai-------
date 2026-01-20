## ADDED Requirements
### Requirement: 分页结果缓存
系统 SHALL 将章节分页结果缓存到 IndexedDB，并基于 bookId、chapterIndex、viewport 维度与章节文本哈希/书籍更新时间进行命中或失效。

#### Scenario: Cache hit reuses pages
- **WHEN** 用户再次打开同一章节且 viewport 与章节文本哈希一致
- **THEN** 系统直接复用缓存分页结果
- **AND** 首屏页在 500ms 内显示

#### Scenario: Cache invalidates on viewport or book update
- **GIVEN** 已存在章节分页缓存
- **WHEN** viewport 尺寸发生变化或书籍更新时间/章节文本哈希变化
- **THEN** 系统忽略旧缓存并重新分页

### Requirement: 渐进式页面渲染
系统 SHALL 在页翻模式下仅渲染当前页与前后各 1 页，其余页面按需加载。

#### Scenario: Initial chapter render is partial
- **WHEN** 章节被打开且处于页翻模式
- **THEN** 系统仅渲染当前页与前后各 1 页
- **AND** 其余页面在用户翻页时再加载

### Requirement: 阅读加载指示器
系统 SHALL 在分页计算或缓存读取期间显示加载指示器，避免白屏。

#### Scenario: Loading indicator during pagination
- **WHEN** 章节分页尚未完成
- **THEN** 阅读区域显示加载指示器
- **AND** 分页完成后立即替换为正文内容
