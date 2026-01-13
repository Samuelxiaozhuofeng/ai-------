/**
 * IndexedDB Module
 * Handles persistent storage for books using IndexedDB
 */

import { makeVocabId, normalizeWord } from './word-status.js';

const DB_NAME = 'LanguageReaderDB';
const DB_VERSION = 6;
const STORE_BOOKS = 'books';
const STORE_VOCABULARY = 'vocabulary';
const STORE_PROGRESS = 'progress';
const STORE_GLOBAL_VOCAB = 'globalVocabulary';
const STORE_EPUB_FILES = 'epubFiles';
const STORE_TOKENIZATION_CACHE = 'tokenizationCache';

let db = null;

/**
 * Initialize the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export async function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('📚 IndexedDB initialized');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            const transaction = event.target.transaction;
            const oldVersion = event.oldVersion || 0;

            // Create books store
            if (oldVersion < 1 && !database.objectStoreNames.contains(STORE_BOOKS)) {
                const store = database.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('addedAt', 'addedAt', { unique: false });
                store.createIndex('lastReadAt', 'lastReadAt', { unique: false });
                store.createIndex('language', 'language', { unique: false });
                console.log('📚 Created books store');
            }

            // Create vocabulary store
            if (oldVersion < 2 && !database.objectStoreNames.contains(STORE_VOCABULARY)) {
                const store = database.createObjectStore(STORE_VOCABULARY, { keyPath: 'id' });
                store.createIndex('bookId', 'bookId', { unique: false });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('bookId_status', ['bookId', 'status'], { unique: false });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                store.createIndex('language', 'language', { unique: false });
                console.log('📚 Created vocabulary store');
            }

            // Create progress store
            if (oldVersion < 2 && !database.objectStoreNames.contains(STORE_PROGRESS)) {
                const store = database.createObjectStore(STORE_PROGRESS, { keyPath: 'bookId' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                console.log('📚 Created progress store');
            }

            // Create global vocabulary store (FSRS cards live here)
            if (oldVersion < 3 && !database.objectStoreNames.contains(STORE_GLOBAL_VOCAB)) {
                const store = database.createObjectStore(STORE_GLOBAL_VOCAB, { keyPath: 'id' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('due', 'due', { unique: false });
                store.createIndex('status_due', ['status', 'due'], { unique: false });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                store.createIndex('language', 'language', { unique: false });
                store.createIndex('status_language', ['status', 'language'], { unique: false });
                store.createIndex('status_language_due', ['status', 'language', 'due'], { unique: false });
                console.log('📚 Created global vocabulary store');
            }

            // Create EPUB file cache store (raw blobs)
            if (oldVersion < 5 && !database.objectStoreNames.contains(STORE_EPUB_FILES)) {
                const store = database.createObjectStore(STORE_EPUB_FILES, { keyPath: 'path' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                console.log('📦 Created epubFiles store');
            }

            // Create tokenization cache store (Japanese tokens per chapter)
            if (oldVersion < 6 && !database.objectStoreNames.contains(STORE_TOKENIZATION_CACHE)) {
                const store = database.createObjectStore(STORE_TOKENIZATION_CACHE, { keyPath: 'id' });
                store.createIndex('bookId', 'bookId', { unique: false });
                store.createIndex('chapterId', 'chapterId', { unique: false });
                store.createIndex('bookId_chapterId', ['bookId', 'chapterId'], { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                console.log('🈶 Created tokenizationCache store');
            }

            // Ensure indexes exist for upgraded stores
            if (transaction && database.objectStoreNames.contains(STORE_BOOKS)) {
                const store = transaction.objectStore(STORE_BOOKS);
                if (!store.indexNames.contains('language')) {
                    store.createIndex('language', 'language', { unique: false });
                }
            }

            if (transaction && database.objectStoreNames.contains(STORE_VOCABULARY)) {
                const store = transaction.objectStore(STORE_VOCABULARY);
                if (!store.indexNames.contains('language')) {
                    store.createIndex('language', 'language', { unique: false });
                }
            }

            if (transaction && database.objectStoreNames.contains(STORE_GLOBAL_VOCAB)) {
                const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
                if (!store.indexNames.contains('language')) {
                    store.createIndex('language', 'language', { unique: false });
                }
                if (!store.indexNames.contains('status_language')) {
                    store.createIndex('status_language', ['status', 'language'], { unique: false });
                }
                if (!store.indexNames.contains('status_language_due')) {
                    store.createIndex('status_language_due', ['status', 'language', 'due'], { unique: false });
                }
            }

            if (transaction && database.objectStoreNames.contains(STORE_TOKENIZATION_CACHE)) {
                const store = transaction.objectStore(STORE_TOKENIZATION_CACHE);
                if (!store.indexNames.contains('bookId')) {
                    store.createIndex('bookId', 'bookId', { unique: false });
                }
                if (!store.indexNames.contains('chapterId')) {
                    store.createIndex('chapterId', 'chapterId', { unique: false });
                }
                if (!store.indexNames.contains('bookId_chapterId')) {
                    store.createIndex('bookId_chapterId', ['bookId', 'chapterId'], { unique: false });
                }
                if (!store.indexNames.contains('createdAt')) {
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            }

            // Migration: marks/vocabCards -> vocabulary entries, chapter -> progress
            if (oldVersion < 2 && transaction && database.objectStoreNames.contains(STORE_BOOKS)) {
                const booksStore = transaction.objectStore(STORE_BOOKS);
                const vocabStore = transaction.objectStore(STORE_VOCABULARY);
                const progressStore = transaction.objectStore(STORE_PROGRESS);

                const cursorRequest = booksStore.openCursor();
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor) return;

                    /** @type {any} */
                    const book = cursor.value;
                    const bookId = book?.id;
                    if (!bookId) {
                        cursor.continue();
                        return;
                    }

                    // Migrate currentChapter -> progress (page starts at 0 for pre-pagination data)
                    try {
                        const chapterIndex = typeof book.currentChapter === 'number' ? book.currentChapter : 0;
                        const chapterId = book?.chapters?.[chapterIndex]?.id || null;
                        progressStore.put({
                            bookId,
                            chapterId,
                            pageNumber: 0,
                            scrollPosition: 0,
                            updatedAt: new Date().toISOString()
                        });
                    } catch {
                        // ignore migration errors
                    }

                    // Build quick lookup from saved analysis cards
                    /** @type {Map<string, any>} */
                    const analysisByWord = new Map();
                    if (book?.vocabCards && typeof book.vocabCards === 'object') {
                        Object.values(book.vocabCards).forEach((cards) => {
                            if (!Array.isArray(cards)) return;
                            cards.forEach((card) => {
                                const normalized = normalizeWord(card?.word || '');
                                if (!normalized) return;
                                analysisByWord.set(normalized, card);
                            });
                        });
                    }

                    // Migrate marks -> learning vocabulary
                    if (book?.marks && typeof book.marks === 'object') {
                        Object.entries(book.marks).forEach(([chapterId, marks]) => {
                            if (!Array.isArray(marks)) return;
                            marks.forEach((mark) => {
                                const normalized = normalizeWord(mark?.text || '');
                                if (!normalized) return;
                                const analysisCard = analysisByWord.get(normalized);
                                const now = new Date().toISOString();

                                vocabStore.put({
                                    id: makeVocabId(bookId, normalized),
                                    bookId,
                                    word: normalized,
                                    status: 'learning',
                                    context: analysisCard?.context || mark?.context || null,
                                    analysis: analysisCard?.analysis || null,
                                    sourceChapterId: chapterId,
                                    createdAt: analysisCard?.createdAt || now,
                                    updatedAt: now
                                });
                            });
                        });
                    }

                    // Migrate any analysis cards not present in marks
                    analysisByWord.forEach((card, normalized) => {
                        const now = new Date().toISOString();
                        vocabStore.put({
                            id: makeVocabId(bookId, normalized),
                            bookId,
                            word: normalized,
                            status: 'learning',
                            context: card?.context || null,
                            analysis: card?.analysis || null,
                            sourceChapterId: null,
                            createdAt: card?.createdAt || now,
                            updatedAt: now
                        });
                    });

                    cursor.continue();
                };
            }

            // Migration: existing learning vocabulary -> global vocabulary store
            if (oldVersion < 3 && transaction && database.objectStoreNames.contains(STORE_VOCABULARY) && database.objectStoreNames.contains(STORE_GLOBAL_VOCAB)) {
                const vocabStore = transaction.objectStore(STORE_VOCABULARY);
                const globalStore = transaction.objectStore(STORE_GLOBAL_VOCAB);
                const nowIso = new Date().toISOString();

                const statusIndex = vocabStore.indexNames.contains('status') ? vocabStore.index('status') : null;
                const cursorRequest = statusIndex ? statusIndex.openCursor('learning') : vocabStore.openCursor();

                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor) return;

                    /** @type {any} */
                    const entry = cursor.value;
                    if (entry?.status !== 'learning') {
                        cursor.continue();
                        return;
                    }

                    const normalizedWord = normalizeWord(entry?.word || '');
                    if (!normalizedWord) {
                        cursor.continue();
                        return;
                    }

                    const getReq = globalStore.get(normalizedWord);
                    getReq.onsuccess = () => {
                        /** @type {any} */
                        const existing = getReq.result || null;
                        const sourceBooks = Array.isArray(existing?.sourceBooks) ? existing.sourceBooks : [];
                        const nextSourceBooks = entry?.bookId && !sourceBooks.includes(entry.bookId)
                            ? [...sourceBooks, entry.bookId]
                            : sourceBooks;

                        const analysis = entry?.analysis || null;
                        globalStore.put({
                            id: normalizedWord,
                            normalizedWord,
                            displayWord: existing?.displayWord || entry?.displayWord || entry?.word || normalizedWord,
                            status: 'learning',
                            meaning: existing?.meaning || analysis?.meaning || null,
                            usage: existing?.usage || analysis?.usage || null,
                            contextualMeaning: existing?.contextualMeaning || analysis?.contextualMeaning || null,
                            contextSentence: existing?.contextSentence || entry?.context?.currentSentence || null,
                            sourceBooks: nextSourceBooks,
                            due: existing?.due || nowIso,
                            stability: typeof existing?.stability === 'number' ? existing.stability : 0,
                            difficulty: typeof existing?.difficulty === 'number' ? existing.difficulty : 0,
                            elapsed_days: typeof existing?.elapsed_days === 'number' ? existing.elapsed_days : 0,
                            scheduled_days: typeof existing?.scheduled_days === 'number' ? existing.scheduled_days : 0,
                            reps: typeof existing?.reps === 'number' ? existing.reps : 0,
                            lapses: typeof existing?.lapses === 'number' ? existing.lapses : 0,
                            state: typeof existing?.state === 'number' ? existing.state : 0,
                            last_review: existing?.last_review || null,
                            createdAt: existing?.createdAt || entry?.createdAt || nowIso,
                            updatedAt: nowIso
                        });
                        cursor.continue();
                    };
                    getReq.onerror = () => cursor.continue();
                };
            }

            // Migration: legacy data cleanup for multi-language support (no language field)
            if (oldVersion < 4 && transaction && database.objectStoreNames.contains(STORE_BOOKS)) {
                const booksStore = transaction.objectStore(STORE_BOOKS);
                const vocabStore = database.objectStoreNames.contains(STORE_VOCABULARY) ? transaction.objectStore(STORE_VOCABULARY) : null;
                const progressStore = database.objectStoreNames.contains(STORE_PROGRESS) ? transaction.objectStore(STORE_PROGRESS) : null;
                const globalStore = database.objectStoreNames.contains(STORE_GLOBAL_VOCAB) ? transaction.objectStore(STORE_GLOBAL_VOCAB) : null;

                let didCleanup = false;
                const cleanupAll = () => {
                    if (didCleanup) return;
                    didCleanup = true;
                    try { booksStore.clear(); } catch { /* ignore */ }
                    try { vocabStore?.clear(); } catch { /* ignore */ }
                    try { progressStore?.clear(); } catch { /* ignore */ }
                    try { globalStore?.clear(); } catch { /* ignore */ }
                    console.log('🧹 Cleared legacy data (missing language fields)');
                };

                const scanForMissingLanguage = (store) => {
                    if (!store) return;
                    const cursorRequest = store.openCursor();
                    cursorRequest.onsuccess = () => {
                        if (didCleanup) return;
                        const cursor = cursorRequest.result;
                        if (!cursor) return;
                        const record = cursor.value;
                        const language = record?.language;
                        if (typeof language !== 'string' || !language.trim()) {
                            cleanupAll();
                            return;
                        }
                        cursor.continue();
                    };
                };

                scanForMissingLanguage(booksStore);
                scanForMissingLanguage(vocabStore);
                scanForMissingLanguage(globalStore);
            }
        };
    });
}

/**
 * Get a vocabulary entry by word for a book.
 * @param {string} bookId
 * @param {string} word
 * @returns {Promise<Object|null>}
 */
export async function getVocabularyItem(bookId, word) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const id = makeVocabId(bookId, word);
        const transaction = db.transaction([STORE_VOCABULARY], 'readonly');
        const store = transaction.objectStore(STORE_VOCABULARY);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * List vocabulary entries for a book (optionally filtered by status).
 * @param {string} bookId
 * @param {'seen'|'learning'|'known'|null} status
 * @returns {Promise<Array>}
 */
export async function listVocabulary(bookId, status = null) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_VOCABULARY], 'readonly');
        const store = transaction.objectStore(STORE_VOCABULARY);

        /** @type {IDBRequest} */
        let request;
        if (status) {
            const index = store.index('bookId_status');
            request = index.getAll([bookId, status]);
        } else {
            const index = store.index('bookId');
            request = index.getAll(bookId);
        }

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * List vocabulary entries across ALL books by status (no book filter).
 * @param {'seen'|'learning'|'known'} status
 * @returns {Promise<Array>}
 */
export async function listVocabularyByStatus(status) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const transaction = db.transaction([STORE_VOCABULARY], 'readonly');
        const store = transaction.objectStore(STORE_VOCABULARY);
        if (!store.indexNames.contains('status')) {
            reject(new Error('Missing status index'));
            return;
        }
        const index = store.index('status');
        const request = index.getAll(status);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Upsert a vocabulary entry (unique per book + normalized word).
 * @param {Object} item
 * @returns {Promise<Object>}
 */
export async function upsertVocabularyItem(item) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        if (!item?.bookId || !item?.word) {
            reject(new Error('Invalid vocabulary item'));
            return;
        }

        const now = new Date().toISOString();
        const normalized = normalizeWord(item.word);
        const updatedAt = typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : now;
        const createdAt = typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : updatedAt;
        const record = {
            ...item,
            id: makeVocabId(item.bookId, normalized),
            word: normalized,
            updatedAt,
            createdAt
        };

        const transaction = db.transaction([STORE_VOCABULARY], 'readwrite');
        const store = transaction.objectStore(STORE_VOCABULARY);
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Upsert many vocabulary entries in a single transaction.
 * @param {Array<Object>} items
 * @returns {Promise<Array<Object>>}
 */
export async function upsertVocabularyItems(items) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        if (!Array.isArray(items) || items.length === 0) {
            resolve([]);
            return;
        }

        const now = new Date().toISOString();
        /** @type {Array<Object>} */
        const records = [];

        for (const item of items) {
            if (!item?.bookId || !item?.word) continue;
            const normalized = normalizeWord(item.word);
            if (!normalized) continue;
            const updatedAt = typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : now;
            const createdAt = typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : updatedAt;
            records.push({
                ...item,
                id: makeVocabId(item.bookId, normalized),
                bookId: item.bookId,
                word: normalized,
                updatedAt,
                createdAt
            });
        }

        if (records.length === 0) {
            resolve([]);
            return;
        }

        const transaction = db.transaction([STORE_VOCABULARY], 'readwrite');
        const store = transaction.objectStore(STORE_VOCABULARY);
        transaction.oncomplete = () => resolve(records);
        transaction.onerror = () => reject(transaction.error || new Error('Failed to upsert vocabulary items'));
        transaction.onabort = () => reject(transaction.error || new Error('Failed to upsert vocabulary items'));

        for (const record of records) {
            store.put(record);
        }
    });
}

/**
 * Create a stable ID for a global vocab item (unique per language + normalized word).
 * @param {string} language
 * @param {string} word
 * @returns {string}
 */
export function makeGlobalVocabId(language, word) {
    const lang = typeof language === 'string' ? language.trim() : '';
    const normalized = normalizeWord(word || '');
    if (!lang || !normalized) return normalized;
    return `${lang}:${normalized}`;
}

function parseGlobalVocabId(id) {
    const raw = typeof id === 'string' ? id : '';
    const match = raw.match(/^([a-z]{2}):(.+)$/i);
    if (!match) return { language: '', normalizedWord: '' };
    return { language: match[1].toLowerCase(), normalizedWord: match[2] };
}

function normalizeGlobalVocabKey(idOrWord, language = null) {
    const raw = typeof idOrWord === 'string' ? idOrWord.trim() : '';
    if (!raw) return '';

    const parsed = parseGlobalVocabId(raw);
    if (parsed.language && parsed.normalizedWord) {
        return makeGlobalVocabId(parsed.language, parsed.normalizedWord);
    }

    const normalized = normalizeWord(raw);
    if (!normalized) return '';

    const lang = typeof language === 'string' ? language.trim() : '';
    return lang ? makeGlobalVocabId(lang, normalized) : normalized;
}

/**
 * Get a global vocabulary item by id or (language + word).
 * @param {string} idOrWord
 * @param {string|null} [language]
 * @returns {Promise<Object|null>}
 */
export async function getGlobalVocabItem(idOrWord, language = null) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const key = normalizeGlobalVocabKey(idOrWord, language);
        if (!key) {
            resolve(null);
            return;
        }
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * List all global vocabulary items.
 * @returns {Promise<Array>}
 */
export async function listGlobalVocab() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Upsert a global vocabulary item (keyed by language + normalized word).
 * @param {Object} item
 * @returns {Promise<Object>}
 */
export async function upsertGlobalVocabItem(item) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const parsed = parseGlobalVocabId(item?.id);
        const language = (typeof item?.language === 'string' ? item.language.trim() : '') || parsed.language || '';
        const normalizedWord = normalizeWord(item?.normalizedWord || item?.word || parsed.normalizedWord || item?.id || '');
        if (!normalizedWord) {
            reject(new Error('Invalid global vocabulary item'));
            return;
        }

        const now = new Date().toISOString();
        const updatedAt = typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : now;
        const createdAt = typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : updatedAt;
        const id = language ? makeGlobalVocabId(language, normalizedWord) : normalizedWord;
        const skipRemote = Boolean(item?._skipRemote);
        const { _skipRemote, ...rest } = item || {};
        const record = {
            ...rest,
            id,
            language: language || item?.language || null,
            normalizedWord,
            updatedAt,
            createdAt
        };

        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readwrite');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        const request = store.put(record);
        request.onsuccess = () => {
            if (!skipRemote) {
                queueMicrotask(() => {
                    import('./supabase/global-vocab-repo.js')
                        .then((mod) => mod.queueGlobalVocabUpsert(record))
                        .catch((error) => console.warn('Global vocab remote sync enqueue failed:', error));
                });
            }
            resolve(record);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a global vocabulary item.
 * @param {string} idOrWord
 * @param {string|null} [language]
 * @returns {Promise<boolean>}
 */
export async function deleteGlobalVocabItem(idOrWord, language = null) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const key = normalizeGlobalVocabKey(idOrWord, language);
        if (!key) {
            resolve(true);
            return;
        }
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readwrite');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        const request = store.delete(key);
        request.onsuccess = () => {
            queueMicrotask(() => {
                import('./supabase/global-vocab-repo.js')
                    .then((mod) => mod.queueGlobalVocabDelete(key, new Date().toISOString()))
                    .catch((error) => console.warn('Global vocab remote delete enqueue failed:', error));
            });
            resolve(true);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * List due global vocabulary cards (learning + due <= now).
 * @param {Date} now
 * @returns {Promise<Array>}
 */
export async function listDueCards(now) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const nowIso = (now instanceof Date ? now : new Date()).toISOString();
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);

        if (!store.indexNames.contains('status_due')) {
            // Fallback: filter in-memory if index missing (should only happen in very old DBs)
            const req = store.getAll();
            req.onsuccess = () => {
                const all = req.result || [];
                resolve(all.filter((it) => it?.status === 'learning' && typeof it?.due === 'string' && it.due <= nowIso));
            };
            req.onerror = () => reject(req.error);
            return;
        }

        const index = store.index('status_due');
        const range = IDBKeyRange.bound(['learning', ''], ['learning', nowIso]);
        const request = index.getAll(range);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * List due global vocabulary cards for a given language (learning + language + due <= now).
 * @param {Date} now
 * @param {string} language
 * @returns {Promise<Array>}
 */
export async function listDueCardsByLanguage(now, language) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const lang = typeof language === 'string' ? language.trim() : '';
        if (!lang) {
            resolve([]);
            return;
        }

        const nowIso = (now instanceof Date ? now : new Date()).toISOString();
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);

        if (!store.indexNames.contains('status_language_due')) {
            const req = store.getAll();
            req.onsuccess = () => {
                const all = req.result || [];
                resolve(all.filter((it) => it?.status === 'learning' && it?.language === lang && typeof it?.due === 'string' && it.due <= nowIso));
            };
            req.onerror = () => reject(req.error);
            return;
        }

        const index = store.index('status_language_due');
        const range = IDBKeyRange.bound(['learning', lang, ''], ['learning', lang, nowIso]);
        const request = index.getAll(range);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Count global vocabulary items by status.
 * @param {string} status
 * @returns {Promise<number>}
 */
export async function countGlobalVocabByStatus(status) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        if (!store.indexNames.contains('status')) {
            const req = store.getAll();
            req.onsuccess = () => resolve((req.result || []).filter((it) => it?.status === status).length);
            req.onerror = () => reject(req.error);
            return;
        }
        const index = store.index('status');
        const request = index.count(status);
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Count global vocabulary items by status for a given language.
 * @param {string} status
 * @param {string} language
 * @returns {Promise<number>}
 */
export async function countGlobalVocabByStatusAndLanguage(status, language) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const lang = typeof language === 'string' ? language.trim() : '';
        if (!lang) {
            resolve(0);
            return;
        }

        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        if (!store.indexNames.contains('status_language')) {
            const req = store.getAll();
            req.onsuccess = () => resolve((req.result || []).filter((it) => it?.status === status && it?.language === lang).length);
            req.onerror = () => reject(req.error);
            return;
        }
        const index = store.index('status_language');
        const request = index.count([status, lang]);
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Count due global vocabulary cards (learning + due <= now).
 * @param {Date} now
 * @returns {Promise<number>}
 */
export async function countDueCards(now) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const nowIso = (now instanceof Date ? now : new Date()).toISOString();
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        if (!store.indexNames.contains('status_due')) {
            const req = store.getAll();
            req.onsuccess = () => {
                const all = req.result || [];
                resolve(all.filter((it) => it?.status === 'learning' && typeof it?.due === 'string' && it.due <= nowIso).length);
            };
            req.onerror = () => reject(req.error);
            return;
        }
        const index = store.index('status_due');
        const range = IDBKeyRange.bound(['learning', ''], ['learning', nowIso]);
        const request = index.count(range);
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Count due global vocabulary cards for a given language (learning + language + due <= now).
 * @param {Date} now
 * @param {string} language
 * @returns {Promise<number>}
 */
export async function countDueCardsByLanguage(now, language) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const lang = typeof language === 'string' ? language.trim() : '';
        if (!lang) {
            resolve(0);
            return;
        }
        const nowIso = (now instanceof Date ? now : new Date()).toISOString();
        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);

        if (!store.indexNames.contains('status_language_due')) {
            const req = store.getAll();
            req.onsuccess = () => {
                const all = req.result || [];
                resolve(all.filter((it) => it?.status === 'learning' && it?.language === lang && typeof it?.due === 'string' && it.due <= nowIso).length);
            };
            req.onerror = () => reject(req.error);
            return;
        }

        const index = store.index('status_language_due');
        const range = IDBKeyRange.bound(['learning', lang, ''], ['learning', lang, nowIso]);
        const request = index.count(range);
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a vocabulary entry.
 * @param {string} bookId
 * @param {string} word
 * @returns {Promise<boolean>}
 */
export async function deleteVocabularyItem(bookId, word) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const id = makeVocabId(bookId, word);
        const transaction = db.transaction([STORE_VOCABULARY], 'readwrite');
        const store = transaction.objectStore(STORE_VOCABULARY);
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get reading progress for a book.
 * @param {string} bookId
 * @returns {Promise<Object|null>}
 */
export async function getReadingProgress(bookId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const transaction = db.transaction([STORE_PROGRESS], 'readonly');
        const store = transaction.objectStore(STORE_PROGRESS);
        const request = store.get(bookId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update reading progress for a book (chapter + page).
 * @param {string} bookId
 * @param {{chapterId?: string|null, pageNumber?: number, scrollPosition?: number, charOffset?: number, chapterTextHash?: string|null}} progress
 * @returns {Promise<boolean>}
 */
export async function updatePageProgress(bookId, progress) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const now = new Date().toISOString();
        const updatedAt = typeof progress?.updatedAt === 'string' && progress.updatedAt ? progress.updatedAt : now;
        const transaction = db.transaction([STORE_PROGRESS], 'readwrite');
        const store = transaction.objectStore(STORE_PROGRESS);
        const request = store.put({
            bookId,
            chapterId: progress?.chapterId ?? null,
            pageNumber: typeof progress?.pageNumber === 'number' ? progress.pageNumber : 0,
            scrollPosition: typeof progress?.scrollPosition === 'number' ? progress.scrollPosition : 0,
            charOffset: typeof progress?.charOffset === 'number' ? progress.charOffset : 0,
            chapterTextHash: typeof progress?.chapterTextHash === 'string' ? progress.chapterTextHash : null,
            updatedAt
        });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Save a complete book to IndexedDB
 * @param {Object} bookData - Book data including chapters
 * @returns {Promise<boolean>}
 */
export async function saveBook(bookData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const language = typeof bookData?.language === 'string' ? bookData.language.trim() : '';
        if (!language) {
            reject(new Error('Book language is required'));
            return;
        }

        const transaction = db.transaction([STORE_BOOKS], 'readwrite');
        const store = transaction.objectStore(STORE_BOOKS);

        const book = {
            id: bookData.id,
            title: bookData.title,
            cover: bookData.cover || null,
            language,
            storagePath: typeof bookData?.storagePath === 'string' ? bookData.storagePath : null,
            storageUpdatedAt: typeof bookData?.storageUpdatedAt === 'string' ? bookData.storageUpdatedAt : null,
            chapters: bookData.chapters,
            chapterCount: bookData.chapters.length,
            addedAt: bookData.addedAt || new Date().toISOString(),
            lastReadAt: new Date().toISOString(),
            currentChapter: bookData.currentChapter || 0,
            marks: bookData.marks || {}
        };

        const request = store.put(book);

        request.onsuccess = () => {
            console.log(`📚 Saved book: ${book.title}`);
            resolve(true);
        };

        request.onerror = () => {
            console.error('Failed to save book:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Get all books (metadata only, without full chapter content)
 * @returns {Promise<Array>}
 */
export async function getAllBooks() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_BOOKS], 'readonly');
        const store = transaction.objectStore(STORE_BOOKS);
        const request = store.getAll();

        request.onsuccess = () => {
            // Return metadata only (exclude full chapters for performance)
            const books = request.result.map(book => ({
                id: book.id,
                title: book.title,
                cover: book.cover,
                language: book.language,
                chapterCount: book.chapterCount,
                addedAt: book.addedAt,
                lastReadAt: book.lastReadAt,
                currentChapter: book.currentChapter,
                storagePath: book.storagePath || null,
                storageUpdatedAt: book.storageUpdatedAt || null
            }));

            // Sort by lastReadAt (most recent first)
            books.sort((a, b) => new Date(b.lastReadAt) - new Date(a.lastReadAt));

            resolve(books);
        };

        request.onerror = () => {
            console.error('Failed to get books:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Get a complete book by ID
 * @param {string} bookId - Book identifier
 * @returns {Promise<Object|null>}
 */
export async function getBook(bookId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_BOOKS], 'readonly');
        const store = transaction.objectStore(STORE_BOOKS);
        const request = store.get(bookId);

        request.onsuccess = () => {
            resolve(request.result || null);
        };

        request.onerror = () => {
            console.error('Failed to get book:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Delete a book by ID
 * @param {string} bookId - Book identifier
 * @returns {Promise<boolean>}
 */
export async function deleteBook(bookId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction([STORE_BOOKS], 'readwrite');
        const store = transaction.objectStore(STORE_BOOKS);
        const request = store.delete(bookId);

        request.onsuccess = () => {
            console.log(`📚 Deleted book: ${bookId}`);
            resolve(true);
        };

        request.onerror = () => {
            console.error('Failed to delete book:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Get cached EPUB blob by storage path.
 * @param {string} path
 * @returns {Promise<{blob: Blob, updatedAt: string|null} | null>}
 */
export async function getCachedEpub(path) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const key = typeof path === 'string' ? path.trim() : '';
        if (!key) {
            resolve(null);
            return;
        }
        const transaction = db.transaction([STORE_EPUB_FILES], 'readonly');
        const store = transaction.objectStore(STORE_EPUB_FILES);
        const request = store.get(key);
        request.onsuccess = () => {
            const result = request.result || null;
            if (!result?.blob) {
                resolve(null);
                return;
            }
            resolve({ blob: result.blob, updatedAt: result.updatedAt || null });
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Cache EPUB blob by storage path.
 * @param {string} path
 * @param {Blob} blob
 * @param {string|null} updatedAt
 * @returns {Promise<boolean>}
 */
export async function cacheEpub(path, blob, updatedAt = null) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const key = typeof path === 'string' ? path.trim() : '';
        if (!key || !(blob instanceof Blob)) {
            resolve(false);
            return;
        }
        const transaction = db.transaction([STORE_EPUB_FILES], 'readwrite');
        const store = transaction.objectStore(STORE_EPUB_FILES);
        const request = store.put({
            path: key,
            blob,
            updatedAt: typeof updatedAt === 'string' && updatedAt ? updatedAt : new Date().toISOString()
        });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Remove cached EPUB blob.
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export async function deleteCachedEpub(path) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const key = typeof path === 'string' ? path.trim() : '';
        if (!key) {
            resolve(true);
            return;
        }
        const transaction = db.transaction([STORE_EPUB_FILES], 'readwrite');
        const store = transaction.objectStore(STORE_EPUB_FILES);
        const request = store.delete(key);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Rename a book
 * @param {string} bookId - Book identifier
 * @param {string} newTitle - New title
 * @returns {Promise<boolean>}
 */
export async function renameBook(bookId, newTitle) {
    return new Promise(async (resolve, reject) => {
        try {
            const book = await getBook(bookId);
            if (!book) {
                reject(new Error('Book not found'));
                return;
            }

            book.title = newTitle;
            await saveBook(book);
            console.log(`📚 Renamed book to: ${newTitle}`);
            resolve(true);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Update reading progress for a book
 * @param {string} bookId - Book identifier
 * @param {number} chapterIndex - Current chapter index
 * @returns {Promise<boolean>}
 */
export async function updateReadingProgress(bookId, chapterIndex) {
    return new Promise(async (resolve, reject) => {
        try {
            const book = await getBook(bookId);
            if (!book) {
                reject(new Error('Book not found'));
                return;
            }

            book.currentChapter = chapterIndex;
            book.lastReadAt = new Date().toISOString();

            const transaction = db.transaction([STORE_BOOKS], 'readwrite');
            const store = transaction.objectStore(STORE_BOOKS);
            const request = store.put(book);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Save marks for a specific chapter
 * @param {string} bookId - Book identifier
 * @param {string} chapterId - Chapter identifier
 * @param {Array} marks - Array of mark objects
 * @returns {Promise<boolean>}
 */
export async function saveChapterMarks(bookId, chapterId, marks) {
    return new Promise(async (resolve, reject) => {
        try {
            const book = await getBook(bookId);
            if (!book) {
                reject(new Error('Book not found'));
                return;
            }

            if (!book.marks) {
                book.marks = {};
            }
            book.marks[chapterId] = marks;

            const transaction = db.transaction([STORE_BOOKS], 'readwrite');
            const store = transaction.objectStore(STORE_BOOKS);
            const request = store.put(book);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get marks for a specific chapter
 * @param {string} bookId - Book identifier
 * @param {string} chapterId - Chapter identifier
 * @returns {Promise<Array>}
 */
export async function getChapterMarks(bookId, chapterId) {
    try {
        const book = await getBook(bookId);
        return book?.marks?.[chapterId] || [];
    } catch (error) {
        console.error('Failed to get chapter marks:', error);
        return [];
    }
}

/**
 * Save chapter analysis for a specific chapter
 * @param {string} bookId - Book identifier
 * @param {string} chapterId - Chapter identifier
 * @param {string} analysis - Analysis content (markdown)
 * @returns {Promise<boolean>}
 */
export async function saveChapterAnalysis(bookId, chapterId, analysis) {
    return new Promise(async (resolve, reject) => {
        try {
            const book = await getBook(bookId);
            if (!book) {
                reject(new Error('Book not found'));
                return;
            }

            if (!book.chapterAnalysis) {
                book.chapterAnalysis = {};
            }
            book.chapterAnalysis[chapterId] = {
                content: analysis,
                updatedAt: new Date().toISOString()
            };

            const transaction = db.transaction([STORE_BOOKS], 'readwrite');
            const store = transaction.objectStore(STORE_BOOKS);
            const request = store.put(book);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get chapter analysis for a specific chapter
 * @param {string} bookId - Book identifier
 * @param {string} chapterId - Chapter identifier
 * @returns {Promise<Object|null>}
 */
export async function getChapterAnalysis(bookId, chapterId) {
    try {
        const book = await getBook(bookId);
        return book?.chapterAnalysis?.[chapterId] || null;
    } catch (error) {
        console.error('Failed to get chapter analysis:', error);
        return null;
    }
}

/**
 * Save vocabulary analysis cards for a specific chapter
 * @param {string} bookId - Book identifier
 * @param {string} chapterId - Chapter identifier
 * @param {Array} vocabCards - Array of vocabulary analysis card data
 * @returns {Promise<boolean>}
 */
export async function saveVocabCards(bookId, chapterId, vocabCards) {
    return new Promise(async (resolve, reject) => {
        try {
            const book = await getBook(bookId);
            if (!book) {
                reject(new Error('Book not found'));
                return;
            }

            if (!book.vocabCards) {
                book.vocabCards = {};
            }
            book.vocabCards[chapterId] = vocabCards;

            const transaction = db.transaction([STORE_BOOKS], 'readwrite');
            const store = transaction.objectStore(STORE_BOOKS);
            const request = store.put(book);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get vocabulary analysis cards for a specific chapter
 * @param {string} bookId - Book identifier
 * @param {string} chapterId - Chapter identifier
 * @returns {Promise<Array>}
 */
export async function getVocabCards(bookId, chapterId) {
    try {
        const book = await getBook(bookId);
        return book?.vocabCards?.[chapterId] || [];
    } catch (error) {
        console.error('Failed to get vocab cards:', error);
        return [];
    }
}

/**
 * Generate a simple hash for book identification
 * @param {string} str - String to hash (book title + first chapter)
 * @returns {string} Hash string
 */
export function generateBookHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 'book-' + Math.abs(hash).toString(16);
}
