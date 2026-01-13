# Japanese Tokenization (ja) — OpenSpec

## 功能概述
为语言学习阅读器添加**日语（ja）分词/形态学分析**支持，使日语书籍在阅读页具备与英语/西语一致的交互能力：
- 章节内容渲染为可点击 token（用于查词、标记生词、状态高亮、被动“翻页标记”）
- 生成稳定的词汇 key（用于跨页/跨章匹配、词汇状态持久化）
- 为 AI 分析提供更高质量的输入（lemma/读音/词性等上下文）

## 技术方案（前端 Kuromoji + Kuroshiro，Web Worker）
### 总体原则
- **离线优先**：日语分词在前端完成；后端不作为必须依赖
- **确定性**：同一版本词典/算法 + 同一 canonical 文本 → token 结果必须稳定（便于缓存与进度恢复）
- **不破坏现有阅读引擎**：保持现有分页/进度/offset 计算的稳定性（尤其是 `chapterTextHash` 与 `pageStartCharOffsets`）

### 组件职责
- **Main Thread（UI）**
  - 负责章节渲染、分页、点击交互、词汇状态标记
  - 调用“日语分词服务”（Worker 客户端）获得 token 列表
  - 使用 token 列表构建与现有一致的 `.word` `<span>` 结构（MVP 不在正文插入 `<ruby>`）
- **Web Worker（计算）**
  - 初始化 `kuromoji`（加载词典）
  - 对文本做形态学分析，输出 tokens（surface/lemma/reading/pos/offset）
  - （增强阶段）使用 `kuroshiro` 将 reading 转为 furigana 表示，供词汇面板/可选正文显示

### 依赖与资源管理（无构建工具前提）
- 采用**本地 vendoring**（不依赖 CDN），以保证离线可用与版本可控：
  - `kuromoji` browser bundle + `dict/` 词典目录
  - `kuroshiro` bundle + `kuroshiro-analyzer-kuromoji` bundle
- 词典文件为静态资源，通过 `fetch()` 加载；并在 IndexedDB 中缓存（可选），降低二次加载成本。

## 核心文件（拟创建/修改清单）
> 文件名为建议；最终以实现时的最小改动为准。

### 新增
- `js/tokenizers/japanese/japanese-tokenization-service.js`：主线程 API（初始化 Worker、发请求、失败回退）
- `js/tokenizers/japanese/japanese-tokenizer.worker.js`：Worker 实现（kuromoji/kuroshiro 初始化与 tokenize）
- `js/tokenizers/japanese/japanese-token-types.js`：token 类型常量、版本常量、结构校验辅助
- `js/tokenizers/japanese/japanese-token-cache.js`：IndexedDB 缓存读写（按章节）
- `vendor/kuromoji/`：`kuromoji.js` + `dict/`（静态资源）
- `vendor/kuroshiro/`：`kuroshiro.js` + `kuroshiro-analyzer-kuromoji.js`（静态资源）

### 修改
- `js/utils/tokenizer.js`：从“单一正则分词”升级为“按书籍语言选择分词器”（`en/es` 维持现状；`ja` 走新管线）
- `js/db.js`：新增 object store（token cache / tokenizer assets cache）；提升 `DB_VERSION`
- `js/views/reader/pagination-engine.js`：接入语言化 tokenizer（保持 `canonicalText` 定义不变）
- `js/views/reader/word-highlighter.js`：对日语 token 的显示词/词汇 key 兼容（例如 `data-surface`/`data-lemma`）

## 数据结构
### Canonical Text（用于 hash / offset 的“唯一真相”）
为避免影响现有分页/进度，日语分词必须以与现有一致的 canonical 文本作为输入与偏移基准：
- `canonicalText` = `normalizeNewlines(chapterText)` 后再按段落 `\n\n` 拼接（与现有 `buildTokenizedChapterWrapperWithMeta()` 一致）
- **所有 token 的 `start`/`end` 必须基于 canonicalText 的字符索引**

### Token 格式（MVP）
```js
/**
 * start/end: [start, end) in canonicalText
 * pos/posDetail: 允许为空（不同词典字段差异）
 */
{
  surface: string,         // 原文片段（如：食べている）
  lemma: string,           // 原形/辞书形（如：食べる；无则回退 surface）
  reading: string|null,    // 读音（通常片假名；无则 null）
  pos: string|null,        // 词性粗类（名词/动词/助词…）
  posDetail: string|null,  // 词性细类（可选）
  isWord: boolean,         // 是否应渲染为可点击 `.word`
  start: number,
  end: number
}
```

### 缓存结构（按书/章）
```js
{
  id: string,              // `${bookId}:${chapterId}:${tokenizerId}:${tokenizerVersion}:${textHash}`
  bookId: string,
  chapterId: string,

  tokenizerId: 'kuromoji+kuroshiro',
  tokenizerVersion: string,   // 业务版本（升级规则变更时递增）
  dictVersion: string,        // 词典版本/哈希（资源更新时变化）

  textHash: string,           // 对 canonicalText 的稳定 hash（与现有 fnv1a32 相同算法/格式）
  createdAt: string,          // ISO
  tokens: Array<Token>
}
```

### 版本控制规则
- `tokenizerVersion`：由代码定义（例如 `JA_TOKENIZER_VERSION = "1"`），当以下任一变化时必须递增：
  - `isWord` 判定规则变化（POS 过滤/助词处理等）
  - token key 策略变化（surface→lemma、归一化规则变化）
  - offset 计算方式变化
- `dictVersion`：与 vendored 字典资源绑定（可手动填写，也可在构建/发布时生成哈希）
- 缓存命中必须同时满足：`textHash`、`tokenizerVersion`、`dictVersion` 全匹配

## 实施步骤（分阶段：MVP → 增强 → 优化）
### 阶段 1：MVP（可点击分词 + 稳定缓存，不影响分页/进度）
目标：日语书籍可像英文一样“点击 token 查词/标记”，并且翻页/进度保持稳定。
1. Worker 管线打通：
   - Worker 启动后初始化 kuromoji（加载本地 dict）
   - 主线程提供 `tokenizeJapaneseChapter(canonicalText)` API
2. Token → DOM 渲染（不引入 ruby）：
   - 对 `isWord=true` 的 token 生成 `<span class="word">`
   - `data-word` 用于词汇 key：**默认使用 lemma**（无 lemma 则 surface）
   - `textContent` 显示 **surface**（用户看到原文形态）
3. IndexedDB 缓存：
   - 新增 `tokenizationCache` store（按章节缓存 token 列表）
   - 章节加载时：先算 `textHash`，命中则直接渲染，否则请求 Worker 并回写缓存
4. 回退策略（必须有）：
   - Worker 初始化失败/超时 → 回退到现有 `js/utils/tokenizer.js` 的正则分词（保证阅读器不崩溃）
5. 兼容现有分页/进度：
   - `chapterTextHash` 与 `pageStartCharOffsets` 继续基于 canonicalText 的字符计数
   - **MVP 禁止在正文中插入 `<ruby>/<rt>`**（避免 `textContent` 污染导致 offset/hash 变化）

### 阶段 2：增强（更好的学习体验）
1. POS 过滤与“可学习 token”规则：
   - 默认将助词/助动词/记号设为 `isWord=false`（或提供设置开关）
   - 提供“显示功能词”选项（高级用户）
2. 词汇面板增强：
   - 对日语 token：优先展示 lemma、读音、词性（来自 tokenizer 结果），减少对 AI 的依赖
3. 短语选择与 key 策略优化：
   - 日语短语选择不以空格拼接（避免 `normalizeTextToKey()` 的英文假设）
   - 对短语保存额外字段：`parts: Token[]`（用于翻页排除 clickedWordsOnPage 等逻辑更准确）

### 阶段 3：优化（性能/体积/稳定性）
1. 词典资源缓存与启动性能：
   - 将 dict 文件首次加载后的内容缓存到 IndexedDB（blob/arrayBuffer），降低后续冷启动网络请求数
2. 大章性能：
   - 章节分块 tokenize（按段落/固定长度），Worker 逐块返回并流式渲染（可选）
3. 进度与分页彻底解耦（为未来“正文 inline furigana”铺路）：
   - 将 `pageStartCharOffsets` 从“DOM textContent 计数”迁移为“token.start 计数”
   - 分页时使用 token offset 来确定页边界（避免任何装饰性 DOM 影响进度）

## 注意事项（避免影响现有分页/进度/offset 计算）
### 必须遵守的约束
1. **canonicalText 是唯一 offset 基准**
   - Worker 输出 token 的 `start/end` 必须对应 canonicalText
2. **正文渲染不得改变 canonicalText 的可见字符序列**
   - MVP 阶段不渲染 `<ruby>/<rt>`，避免 `textContent` 被读音污染
3. **分页与进度不得依赖“装饰性文本”**
   - 若未来引入 inline furigana，必须先完成“进度与分页解耦”的优化阶段

### 失败模式与应对
- 词典加载失败（路径错误/资源缺失/浏览器存储限制）→ 回退到正则分词并提示用户“日语高精度分词不可用”
- tokenizer 版本升级导致缓存失效 → 通过 `tokenizerVersion` 自动失效并重算
- token key 变化导致已标记词汇无法匹配 → 必须在 MVP 前确定“日语词汇 key 采用 lemma”的策略，并在 spec 中固定

## Requirements（验收标准）
### Requirement: Japanese Tokenization Pipeline
系统 SHALL 在 `ja` 语言书籍中使用 Worker 驱动的 Kuromoji 形态学分析生成 token 列表，并用于正文可点击渲染。

#### Scenario: Tokenization is performed in a Worker
- **GIVEN** 当前书籍语言为 `ja`
- **WHEN** 阅读器加载任意章节
- **THEN** 系统向 Web Worker 请求分词结果
- **AND** UI 线程不出现明显卡顿（无长任务阻塞交互）

#### Scenario: Token offsets are canonical
- **GIVEN** canonicalText 已生成
- **WHEN** Worker 返回 tokens
- **THEN** 每个 token 的 `surface` 等于 `canonicalText.slice(start, end)`

---

### Requirement: Token Cache with Versioning
系统 SHALL 将日语分词结果按章节缓存到 IndexedDB，并通过 `textHash`/`tokenizerVersion`/`dictVersion` 保证一致性。

#### Scenario: Cache hit reuses tokens
- **GIVEN** 缓存存在且版本匹配
- **WHEN** 用户再次打开同一章节
- **THEN** 系统不请求 Worker 也能完成渲染

#### Scenario: Cache invalidates on version mismatch
- **GIVEN** `tokenizerVersion` 或 `dictVersion` 发生变化
- **WHEN** 用户打开已缓存章节
- **THEN** 系统忽略旧缓存并重新分词后写入新缓存

---

### Requirement: Pagination/Progress Stability
系统 SHALL 保持现有分页与进度逻辑稳定，不因日语分词/读音显示而改变 `chapterTextHash` 与页 offset 行为（MVP）。

#### Scenario: chapterTextHash remains canonical
- **WHEN** 章节内容被 token 化并渲染为 `.word` spans
- **THEN** `chapterTextHash` 仍基于 canonicalText 计算
- **AND** 不包含任何 furigana/装饰性文本

#### Scenario: No inline ruby in MVP
- **WHEN** `ja` 章节在 MVP 模式渲染
- **THEN** 正文 DOM 不包含 `<ruby>` 或 `<rt>`

