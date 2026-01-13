# 日语分词器迁移方案：从 Kuromoji 到 Sudachi

## 一、目标
将日语分词从前端 Kuromoji.js 迁移到纯后端 Sudachi 方案，实现更准确的词性标注和纯在线阅读体验。

## 二、技术选型

### 2.1 分词库：SudachiPy
- **优势**：
  - 词性标注更准确，完整支持动词、名词、形容词等细粒度分类
  - 支持多粒度分词（A/B/C 模式）
  - 词典更现代，适合当代日语
  - 活跃维护，WorksApplications 官方支持

### 2.2 部署架构
由于 Supabase Edge Functions 基于 Deno（JavaScript/TypeScript），无法直接运行 Python，采用以下方案：

**方案：增强现有 Worker 服务**
- 在现有的 `worker/` Docker 服务中集成 Python 环境
- Worker 使用 Node.js child_process 调用 Python 脚本进行分词
- 保持现有的任务队列和处理流程

## 三、架构变更

### 3.1 移除前端分词依赖
**删除文件**：
- `js/tokenizers/japanese/japanese-tokenizer.worker.js`
- `js/tokenizers/japanese/japanese-tokenization-service.js`
- `vendor/kuromoji/` 目录
- `worker/node_modules/kuromoji` 依赖

**保留文件**：
- `js/tokenizers/japanese/japanese-token-types.js`（仅保留类型定义）

### 3.2 新增后端 Python 分词服务

**目录结构**：
```
worker/
├── src/
│   ├── index.js
│   ├── japanese.js (移除 kuromoji 依赖)
│   └── tokenizers/
│       └── sudachi_tokenizer.py (新增)
├── requirements.txt (新增)
└── Dockerfile (修改)
```

### 3.3 数据流程
1. **上传**：用户上传 EPUB → 创建 `queued` 状态记录
2. **Worker 处理**：
   - 解析 EPUB
   - 检测语言 = `ja`
   - 调用 `sudachi_tokenizer.py` 进行分词
   - 上传分词结果到 Supabase Storage（`tokens/${chapterId}.json.gz`）
3. **前端读取**：
   - 下载预处理的 manifest 和 tokens
   - 存入 IndexedDB 缓存
   - 直接渲染，无需前端分词

## 四、实现细节

### 4.1 Docker 配置
```dockerfile
FROM node:18-slim

# 安装 Python 和依赖
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 安装 SudachiPy
COPY requirements.txt .
RUN pip3 install -r requirements.txt

# 下载 Sudachi 词典（使用 core 版本，平衡速度和准确性）
RUN python3 -m pip install sudachidict_core

# 其余 Node.js 配置...
```

### 4.2 Python 分词脚本 (`worker/src/tokenizers/sudachi_tokenizer.py`)
```python
#!/usr/bin/env python3
import sys
import json
from sudachipy import tokenizer, dictionary

# 初始化分词器（使用 C 模式 - 最细粒度）
tokenizer_obj = dictionary.Dictionary().create()
mode = tokenizer.Tokenizer.SplitMode.C

# 定义不可学习的词性（助词、助动词、标点等）
NON_LEARNABLE_POS = {
    '助詞', '助動詞', '補助記号', '空白'
}

def tokenize_text(text):
    """
    对日语文本进行分词
    返回格式：
    [
      {
        "surface": "表層形",
        "lemma": "基本形",
        "reading": "読み",
        "pos": "品詞",
        "isWord": true/false,
        "start": 0,
        "end": 3
      }
    ]
    """
    tokens = []
    offset = 0

    for m in tokenizer_obj.tokenize(text, mode):
        # 提取词性信息
        pos_tags = m.part_of_speech()
        main_pos = pos_tags[0]  # 主要词性

        surface = m.surface()
        lemma = m.dictionary_form()
        reading = m.reading_form()

        # 判断是否为可学习词汇
        is_word = main_pos not in NON_LEARNABLE_POS

        tokens.append({
            'surface': surface,
            'lemma': lemma,
            'reading': reading,
            'pos': main_pos,
            'posDetail': '-'.join(pos_tags[1:4]),  # 详细词性
            'isWord': is_word,
            'start': offset,
            'end': offset + len(surface)
        })

        offset += len(surface)

    return tokens

if __name__ == '__main__':
    # 从 stdin 读取文本
    input_text = sys.stdin.read()

    # 分词
    result = tokenize_text(input_text)

    # 输出 JSON
    print(json.dumps(result, ensure_ascii=False))
```

### 4.3 Node.js Worker 集成 (`worker/src/japanese.js`)
```javascript
const { spawn } = require('child_process');
const path = require('path');

async function tokenizeJapaneseCanonicalText(canonicalText) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [
      path.join(__dirname, 'tokenizers', 'sudachi_tokenizer.py')
    ]);

    let stdout = '';
    let stderr = '';

    // 发送文本到 Python 进程
    python.stdin.write(canonicalText);
    python.stdin.end();

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Sudachi tokenizer failed: ${stderr}`));
      } else {
        try {
          const tokens = JSON.parse(stdout);
          resolve(tokens);
        } catch (err) {
          reject(new Error(`Failed to parse tokenizer output: ${err.message}`));
        }
      }
    });
  });
}

module.exports = { tokenizeJapaneseCanonicalText };
```

### 4.4 前端变更
**`js/views/reader-view.js`**：
- 移除前端分词调用
- 如果章节没有预处理的 tokens，显示错误提示（要求用户等待后台处理完成）

**`js/services/tokenization/tokenization-service.js`**：
- 移除 `JapaneseTokenizationService` 的 Worker 调用
- 改为仅从缓存读取

### 4.5 数据库 Schema（无需变更）
现有的 `books` 表已包含：
- `processing_status`：`queued | processing | completed | failed`
- `processing_progress`：进度百分比
- `processing_error`：错误信息

## 五、迁移步骤

### Phase 1：后端开发（由 Codex 执行）
1. 修改 `worker/Dockerfile`，添加 Python 环境和 SudachiPy
2. 创建 `worker/requirements.txt`
3. 实现 `worker/src/tokenizers/sudachi_tokenizer.py`
4. 修改 `worker/src/japanese.js`，替换 kuromoji 调用为 Python 子进程
5. 测试 Worker 处理日语书籍

### Phase 2：前端清理（由 Codex 执行）
1. 移除前端 kuromoji Worker 相关代码
2. 更新 `tokenization-service.js`，移除前端分词逻辑
3. 修改 Reader 视图，当没有 tokens 时显示友好提示
4. 清理 `vendor/kuromoji/` 和相关依赖

### Phase 3：测试验证
1. 上传新的日语 EPUB，验证后台分词流程
2. 检查 Supabase Storage 中的 tokens 文件格式
3. 验证前端能正确读取并显示词汇
4. 对比 Kuromoji 和 Sudachi 的分词差异

### Phase 4：数据迁移（可选）
如果需要重新处理已有的日语书籍：
1. 编写脚本查询所有 `language = 'ja'` 的书籍
2. 将它们的状态重置为 `queued`
3. Worker 自动重新处理

## 六、性能考量

### 6.1 分词速度
- Sudachi 分词速度：约 **1000-2000 字符/秒**（Python 实现）
- 一本典型小说（10 万字）分词时间：约 **50-100 秒**
- 对比 Kuromoji（前端）：首次加载词典需要 **20-30 秒**，但后续分词更快

### 6.2 词典大小
- `sudachidict_core`（推荐）：约 **70MB**
- `sudachidict_small`：约 **40MB**
- `sudachidict_full`：约 **150MB**

### 6.3 优化建议
- 使用 `core` 词典（平衡准确性和体积）
- Worker 容器启动时预加载词典（避免每次分词都初始化）
- 考虑批量处理多个章节（减少进程创建开销）

## 七、回滚方案
如果遇到问题，可以快速回滚：
1. 恢复 `worker/Dockerfile` 的 kuromoji 依赖
2. 恢复 `worker/src/japanese.js` 使用 kuromoji
3. 恢复前端 Worker 代码
4. 重新构建并部署

## 八、成本分析
- **无额外云服务费用**（使用现有 Worker 容器）
- **存储成本**：tokens 文件约 50-100KB/章节（gzip 压缩后）
- **计算成本**：Docker 容器需增加 Python 环境（约 +100MB 镜像大小）

## 九、后续优化方向
1. **词典定制**：添加轻小说、网络用语等领域词汇
2. **分词模式选择**：允许用户选择 A/B/C 三种分词粒度
3. **词性高亮**：前端根据词性（动词/名词/形容词）应用不同样式
4. **学习统计**：利用准确的词性信息，生成更精准的学习报告

---

## 附录：Sudachi 词性标签对照表

| Sudachi 词性 | 说明 | Kuromoji 对应 |
|-------------|------|--------------|
| 名詞 | 名词 | 名詞 |
| 動詞 | 动词 | 動詞 |
| 形容詞 | 形容词 | 形容詞 |
| 形状詞 | 形状词（な形容词）| 形容動詞 |
| 副詞 | 副词 | 副詞 |
| 助詞 | 助词 | 助詞 |
| 助動詞 | 助动词 | 助動詞 |
| 接続詞 | 接续词 | 接続詞 |
| 補助記号 | 标点符号 | 記号 |

---

**方案制定完成，等待 Codex 实施。**
