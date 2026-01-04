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
 * Analyze chapter content with AI
 * @param {string} chapterContent - Full chapter content
 * @param {string} chapterTitle - Chapter title
 * @returns {Promise<string>} Analysis result
 */
export async function analyzeChapter(chapterContent, chapterTitle) {
    const settings = getSettings();
    const language = settings.language || '中文';
    
    if (!chapterContent) {
        throw new Error('No chapter content to analyze');
    }
    
    const systemPrompt = `你是一位文学分析专家和语言教育家。请用${language}分析给定的章节内容。

请提供以下分析：

## 章节总结
简要概括本章节的主要内容和情节发展。

## 深层含义分析
- 本章节除了字面含义之外，可能想要表达的深层主题或寓意
- 作者可能的写作意图
- 文化背景或历史背景的相关说明（如果适用）

## 语言特点
- 本章节中值得注意的语言表达方式
- 重要的修辞手法或写作技巧

请用清晰的结构呈现分析结果。`;

    const userPrompt = `# ${chapterTitle || '章节内容'}

${truncateText(chapterContent, 4000)}

请对以上章节进行分析。`;

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
