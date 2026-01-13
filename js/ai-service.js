/**
 * AI Service Module
 * Handles AI API calls for vocabulary and chapter analysis
 */

import { getSettings } from './storage.js';

/**
 * Fetch available models from the API
 * @param {string} apiUrl - API base URL
 * @param {string} apiKey - API key
 * @returns {Promise<Array>} Array of model objects
 */
export async function fetchModels(apiUrl, apiKey) {
    if (!apiUrl || !apiKey) {
        throw new Error('API URL and API Key are required');
    }
    
    // Normalize URL
    const baseUrl = apiUrl.replace(/\/+$/, '');
    const modelsUrl = `${baseUrl}/models`;
    
    const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data || data.models || [];
}

/**
 * Send a chat completion request
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Optional parameters
 * @returns {Promise<string>} AI response text
 */
async function chatCompletion(messages, options = {}) {
    const settings = getSettings();
    
    if (!settings.apiUrl || !settings.apiKey || !settings.model) {
        throw new Error('Please configure AI settings first');
    }
    
    const baseUrl = settings.apiUrl.replace(/\/+$/, '');
    const chatUrl = `${baseUrl}/chat/completions`;
    
    const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json'
        },
        signal: options.signal,
        body: JSON.stringify({
            model: settings.model,
            messages: messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2000
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

/**
 * Analyze vocabulary with AI
 * @param {Array<string>} markedItems - Array of marked text
 * @param {string} chapterContent - Full chapter content for context
 * @returns {Promise<string>} Analysis result
 */
export async function analyzeVocabulary(markedItems, chapterContent) {
    const settings = getSettings();
    const language = settings.language || '中文';
    
    if (!markedItems || markedItems.length === 0) {
        throw new Error('No vocabulary to analyze');
    }
    
    const systemPrompt = `你是一位专业的语言学习助手。请用${language}分析用户标记的词汇、短语或句子。

你必须以JSON格式返回分析结果，格式如下：
{
  "vocabulary": [
    {
      "original": "原文词汇",
      "partOfSpeech": "词性",
      "definition": "含义解释",
      "contextUsage": "在当前语境中的用法说明",
      "example": "示例句子（可选）"
    }
  ]
}

请结合上下文进行分析，使解释更加准确和有针对性。只返回JSON，不要添加任何其他文字。`;

    const userPrompt = `## 章节上下文
${truncateText(chapterContent, 3000)}

## 用户标记的内容
${markedItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

请以JSON格式返回分析结果。`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    
    return await chatCompletion(messages);
}

/**
 * Analyze a single word instantly with context
 * @param {string} word - The marked word/phrase
 * @param {Object} context - Context object with previous, current, and next sentences
 * @returns {Promise<Object>} Analysis result as JSON object
 */
export async function analyzeWordInstant(word, context, options = {}) {
    const settings = getSettings();
    const language = settings.language || '中文';
    const bookLanguage = (options.bookLanguage || options.targetLanguage || options.language || 'en').toString();
    
    if (!word) {
        throw new Error('No word to analyze');
    }

    const baseNotes = `
注意：
1. 只返回JSON，不要添加任何其他文字
2. 不需要提供例句
3. 重点关注该词在给定上下文中的具体含义
4. 如果是短语，按短语整体解释`.trim();

    const systemPromptByBookLanguage = {
        en: `你是一位专业的英语学习助手。请用${language}快速分析用户标记的英语词汇或短语，并给出中英双语的释义。

你必须以JSON格式返回分析结果，格式如下：
{
  "word": "原文词汇",
  "lemma": "词汇原形（如动词不定式、名词单数）",
  "partOfSpeech": "词性（如：动词、名词、形容词等）",
  "meaning": "中文释义 / English gloss（中英双语）",
  "usage": "用法说明（可包含常见搭配/语域提示）",
  "contextualMeaning": "在当前上下文中的具体含义"
}

${baseNotes}`,
        es: `你是一位专业的西班牙语学习助手。请用${language}快速分析用户标记的西班牙语词汇或短语。

你必须以JSON格式返回分析结果，格式如下：
{
  "word": "原文词汇",
  "lemma": "词汇原形（动词为不定式如 poder，名词为阳性单数）",
  "partOfSpeech": "词性",
  "meaning": "基本含义",
  "conjugation": "若为动词：给出原形、时态/人称/数的变位要点；否则留空字符串",
  "genderPlural": "若为名词：性别（阳/阴）与复数规则；否则留空字符串",
  "usage": "用法说明（可包含常见搭配）",
  "contextualMeaning": "在当前上下文中的具体含义"
}

${baseNotes}`,
        ja: `你是一位专业的日语学习助手。请用${language}快速分析用户标记的日语词汇或短语。

你必须以JSON格式返回分析结果，格式如下：
{
  "word": "原文词汇",
  "lemma": "词汇原形/辞书形",
  "furigana": "假名读音（若适用）",
  "partOfSpeech": "词性",
  "meaning": "基本含义",
  "kanjiOrigin": "汉字构成/词源要点（若适用）",
  "politenessLevel": "语体/敬语/礼貌程度（若适用）",
  "usage": "用法说明（可包含固定搭配/助词提示）",
  "contextualMeaning": "在当前上下文中的具体含义"
}

${baseNotes}`
    };

    const systemPrompt = systemPromptByBookLanguage[bookLanguage] || systemPromptByBookLanguage.en;

    const contextText = context.currentSentence || context.fullContext || '';
    
    const userPrompt = `请分析以下词汇：
    
**标记的词汇**: ${word}

**上下文**:
${contextText}

请以JSON格式返回该词汇的分析。`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    
    const result = await chatCompletion(messages, { maxTokens: 700, temperature: 0.3, signal: options.signal });
    
    // Parse JSON response
    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Invalid JSON response');
    } catch (e) {
        console.error('Failed to parse JSON:', result);
        throw new Error('Failed to parse AI response');
    }
}

/**
 * Analyze chapter content with AI
 * @param {string} chapterContent - Full chapter content
 * @param {string} chapterTitle - Chapter title
 * @returns {Promise<string>} Analysis result
 */
export async function analyzeChapter(chapterContent, chapterTitle) {
    const settings = getSettings();
    const language = settings.language || '中文';
    const readingLevel = settings.readingLevel || 'intermediate';
    
    if (!chapterContent) {
        throw new Error('No chapter content to analyze');
    }
    
    // Adjust complexity based on reading level
    const levelDescriptions = {
        beginner: '初学者，需要简单易懂的解释',
        intermediate: '中级学习者，可以理解适度复杂的内容',
        advanced: '高级学习者，可以理解深层次的文学分析'
    };
    
    const systemPrompt = `你是一位专业的语言教育家和阅读辅导专家。请用${language}为读者分析即将阅读的章节内容。

**读者水平**: ${levelDescriptions[readingLevel]}

**分析目的**:
1. 为读者提供必要的背景信息
2. 辅助加深读者对即将阅读内容的理解
3. 减轻读者的阅读压力，让阅读过程更轻松
4. 这是阅读前的预览分析，可以适度透露情节以帮助理解

**分析要求**:
- 总字数控制在500字左右
- 结构清晰，重点突出
- 语言简洁易懂
- 根据章节实际内容灵活组织结构

**请包含以下内容**（根据章节实际情况选择相关模块）:

## 📍 背景与情境
- 本章节发生的时间、地点（如果明确）
- 主要登场人物
- 与前文的联系（如适用）

## 📖 内容概览
- 简要概括本章主要情节（可适度透露，帮助读者理解故事走向）
- 核心主题或想要传达的内容

## 💡 阅读重点
- 本章节的阅读重点是什么
- 需要特别注意的细节或转折

## 🎭 情感基调
- 本章的情感氛围（如：轻松、紧张、悲伤、幽默等）
- 帮助读者心理准备

## 📝 关键词汇预告
- 挑选3-5个对理解本章至关重要的词汇或短语
- 简单说明这些词汇为何重要或在文中的作用
- 自然融入到分析中，不要单独列表

请用流畅自然的方式组织以上内容，让读者感觉像是在听一位导师的阅读指导。`;

    const userPrompt = `# ${chapterTitle || '章节内容'}

${truncateText(chapterContent, 4000)}

请对以上章节进行阅读前分析，帮助读者更好地理解即将阅读的内容。`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
    
    return await chatCompletion(messages, { maxTokens: 2500 });
}

/**
 * Run vocabulary and chapter analysis concurrently
 * @param {Array<string>} markedItems - Marked vocabulary
 * @param {string} chapterContent - Chapter content
 * @param {string} chapterTitle - Chapter title
 * @param {Object} callbacks - Callback functions for each result
 * @returns {Promise<Object>} Object with both results
 */
export async function runConcurrentAnalysis(markedItems, chapterContent, chapterTitle, callbacks = {}) {
    const results = {
        vocabulary: null,
        chapter: null,
        errors: []
    };
    
    const promises = [];
    
    // Vocabulary analysis (only if there are marked items)
    if (markedItems && markedItems.length > 0) {
        const vocabPromise = analyzeVocabulary(markedItems, chapterContent)
            .then(result => {
                results.vocabulary = result;
                if (callbacks.onVocabularyComplete) {
                    callbacks.onVocabularyComplete(result);
                }
            })
            .catch(error => {
                results.errors.push({ type: 'vocabulary', error: error.message });
                if (callbacks.onVocabularyError) {
                    callbacks.onVocabularyError(error);
                }
            });
        promises.push(vocabPromise);
    }
    
    // Chapter analysis
    const chapterPromise = analyzeChapter(chapterContent, chapterTitle)
        .then(result => {
            results.chapter = result;
            if (callbacks.onChapterComplete) {
                callbacks.onChapterComplete(result);
            }
        })
        .catch(error => {
            results.errors.push({ type: 'chapter', error: error.message });
            if (callbacks.onChapterError) {
                callbacks.onChapterError(error);
            }
        });
    promises.push(chapterPromise);
    
    // Wait for all to complete
    await Promise.all(promises);
    
    if (callbacks.onComplete) {
        callbacks.onComplete(results);
    }
    
    return results;
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength) + '...[内容已截断]';
}
