/**
 * Anki Service Module
 * Handles AnkiConnect API calls for vocabulary export
 */

const ANKI_CONNECT_URL = 'http://localhost:8765';

/**
 * Generic AnkiConnect API call
 * @param {string} action - API action name
 * @param {Object} params - Action parameters
 * @returns {Promise<any>} API response result
 */
async function invoke(action, params = {}) {
    const response = await fetch(ANKI_CONNECT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: action,
            version: 6,
            params: params
        })
    });

    if (!response.ok) {
        throw new Error(`AnkiConnect request failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
        throw new Error(result.error);
    }

    return result.result;
}

/**
 * Get all deck names from Anki
 * @returns {Promise<string[]>} Array of deck names
 */
export async function getDeckNames() {
    try {
        return await invoke('deckNames');
    } catch (error) {
        console.error('Failed to get deck names:', error);
        throw new Error('无法连接到 Anki，请确保 Anki 已启动并安装了 AnkiConnect 插件');
    }
}

/**
 * Get all note type (model) names from Anki
 * @returns {Promise<string[]>} Array of model names
 */
export async function getModelNames() {
    try {
        return await invoke('modelNames');
    } catch (error) {
        console.error('Failed to get model names:', error);
        throw new Error('无法获取笔记类型列表');
    }
}

/**
 * Get field names for a specific note type
 * @param {string} modelName - Name of the note type
 * @returns {Promise<string[]>} Array of field names
 */
export async function getModelFieldNames(modelName) {
    if (!modelName) {
        return [];
    }
    try {
        return await invoke('modelFieldNames', { modelName });
    } catch (error) {
        console.error('Failed to get model field names:', error);
        throw new Error(`无法获取笔记类型 "${modelName}" 的字段`);
    }
}

/**
 * Add a note to Anki
 * @param {string} deckName - Target deck name
 * @param {string} modelName - Note type name
 * @param {Object} fields - Field name to value mapping
 * @returns {Promise<number>} Note ID of the created note
 */
export async function addNote(deckName, modelName, fields) {
    if (!deckName || !modelName) {
        throw new Error('请先在设置中配置 Anki 牌组和笔记类型');
    }

    try {
        const noteId = await invoke('addNote', {
            note: {
                deckName: deckName,
                modelName: modelName,
                fields: fields,
                options: {
                    allowDuplicate: true,
                    duplicateScope: 'deck'
                }
            }
        });
        return noteId;
    } catch (error) {
        console.error('Failed to add note:', error);
        throw new Error(`添加笔记失败: ${error.message}`);
    }
}

/**
 * Test connection to AnkiConnect
 * @returns {Promise<boolean>} True if connected
 */
export async function testConnection() {
    try {
        await invoke('version');
        return true;
    } catch (error) {
        return false;
    }
}
