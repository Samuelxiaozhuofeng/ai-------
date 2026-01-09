# Design: Multi-Language Support

## Context

The Language Reader app currently has implicit English-only assumptions baked into:
1. The FSRS review system (single global queue)
2. AI prompt templates (hardcoded English vocabulary analysis)
3. Word tokenization (regex-based, works for space-delimited languages)

Adding multi-language support requires changes across data models, UI, and AI integration while preserving the current simplicity of the codebase.

## Goals / Non-Goals

### Goals
- Allow users to import books in English, Spanish, or Japanese
- Tag all vocabulary with language for filtering and grouped review
- Provide language-specific AI analysis prompts
- Enable per-language review sessions from bookshelf
- Add FSRS settings (retention, review mode) to Settings modal

### Non-Goals
- Advanced tokenization (e.g., Japanese morphological analysis) - deferred to future
- Automatic language detection - user sets language on import
- Supporting more than 3 languages initially
- Backward compatibility with existing data

## Decisions

### 1. Language Codes
Use ISO 639-1 codes internally:
- `en` - English
- `es` - Spanish  
- `ja` - Japanese

Display names in Chinese UI:
- `en` → 英语
- `es` → 西班牙语
- `ja` → 日语

### 2. Book Schema Extension
Add `language` field to book records in IndexedDB:
```javascript
{
  id: "book-uuid",
  title: "Book Title",
  language: "en" | "es" | "ja",  // NEW
  chapters: [...],
  ...
}
```

### 3. Vocabulary Schema Extension
Add `language` field to vocabulary items:
```javascript
{
  word: "normalized-word",
  bookId: "book-uuid",
  language: "en",  // NEW - copied from book
  status: "learning",
  ...
}
```

### 4. Global Vocabulary (FSRS Cards) Schema Extension
Add `language` field to global vocabulary:
```javascript
{
  normalizedWord: "word",
  language: "en",  // NEW
  fsrsCard: {...},
  ...
}
```

### 5. Import Flow
```
User clicks "Import" 
  → File picker opens
  → User selects EPUB
  → Modal appears: "Select book language"
    → Buttons: [English] [Spanish] [Japanese]
  → User selects language
  → Book is parsed and saved with language
  → Bookshelf refreshes
```

### 6. Bookshelf UI Changes
```
+--------------------------------------------------+
| 📚 我的书架              [复习英语(12)] [复习日语(5)] [复习西语(3)]  |
+--------------------------------------------------+
| [英语] [西班牙语] [日语]    ← Language filter tabs  |
+--------------------------------------------------+
| [Book 1] [Book 2] [Book 3] ...                   |
+--------------------------------------------------+
```
- No "全部" tab - user must select a language
- Default to first language with books, or first tab if empty

### 7. Settings → FSRS Tab
New settings tab with:
```
┌─────────────────────────────────────┐
│ FSRS 设置                           │
├─────────────────────────────────────┤
│ 复习模式:                            │
│   ○ 按语言分组复习                    │
│   ○ 混合复习所有语言                   │
├─────────────────────────────────────┤
│ 期望记忆保持率:                       │
│   [========●==] 0.90                │
│   (建议范围: 0.70 - 0.97)            │
└─────────────────────────────────────┘
```

### 8. AI Prompt Templates

#### English
```
Analyze the English word "${word}" in context: "${sentence}"
Provide:
1. Meaning (in Chinese and English)
2. Common usage patterns
3. Contextual meaning in this sentence
```

#### Japanese
```
Analyze the Japanese word "${word}" in context: "${sentence}"
Provide:
1. Reading (furigana/hiragana)
2. Meaning (in Chinese)
3. Kanji origin/composition (if applicable)
4. Politeness level (普通体/敬語/丁寧語)
5. Contextual meaning in this sentence
```

#### Spanish
```
Analyze the Spanish word "${word}" in context: "${sentence}"
Provide:
1. Meaning (in Chinese)
2. Part of speech
3. For verbs: infinitive form and conjugation pattern
4. For nouns: gender (masculino/femenino) and plural form
5. Contextual meaning in this sentence
```

### 9. Data Migration Strategy
On app initialization:
1. Check if any books exist without `language` field
2. If so, silently delete all books, vocabulary, and global vocab
3. Proceed with clean state
4. No user prompts or confirmations needed

### 10. Review Button Logic
Display review buttons for languages that have at least 1 due card:
- If English has 12 due: show `复习英语 (12)`
- If Japanese has 5 due: show `复习日语 (5)`
- If Spanish has 0 due: hide Spanish button
- If grouped mode: each button starts language-specific session
- If mixed mode: show single `复习 (17)` button combining all

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Data loss for existing users | Acceptable - app not yet in production; silent cleanup |
| Japanese tokenization | Use regex for now; works for most cases; defer advanced tokenization |
| FSRS parameter complexity | Only expose Request Retention initially; add more if needed |

## Open Questions

1. Should language tabs remember last selection across sessions? (Proposed: Yes, store in localStorage)
2. What happens when user tries to import a book but cancels language selection? (Proposed: Cancel import entirely)
