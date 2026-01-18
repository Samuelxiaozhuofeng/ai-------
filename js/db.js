/**
 * IndexedDB Module
 * Handles persistent storage for books using IndexedDB
 */

import { makeVocabId, normalizeWord } from './word-status.js';

const DB_NAME = 'LanguageReaderDB';
const DB_VERSION = 7;
const STORE_BOOKS = 'books';
const STORE_VOCABULARY = 'vocabulary';
const STORE_PROGRESS = 'progress';
const STORE_GLOBAL_VOCAB = 'globalVocabulary';
const STORE_EPUB_FILES = 'epubFiles';
const STORE_TOKENIZATION_CACHE = 'tokenizationCache';

let db = null;
let needsGlobalKnownSync = false;

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
            if (needsGlobalKnownSync) {
                queueMicrotask(() => {
                    syncGlobalKnownRemote().catch((error) => {
                        console.warn('Global-known remote sync failed:', error);
                    });
                });
            }
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

            // Create global vocabulary store (FSRS cards + global-known live here)
            if (oldVersion < 3 && !database.objectStoreNames.contains(STORE_GLOBAL_VOCAB)) {
                const store = database.createObjectStore(STORE_GLOBAL_VOCAB, { keyPath: 'id' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('due', 'due', { unique: false });
                store.createIndex('status_due', ['status', 'due'], { unique: false });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                store.createIndex('language', 'language', { unique: false });
                store.createIndex('kind', 'kind', { unique: false });
                store.createIndex('kind_language', ['kind', 'language'], { unique: false });
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
                if (!store.indexNames.contains('kind')) {
                    store.createIndex('kind', 'kind', { unique: false });
                }
                if (!store.indexNames.contains('kind_language')) {
                    store.createIndex('kind_language', ['kind', 'language'], { unique: false });
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

            // Migration: backfill missing language + global-known migration
            if (oldVersion < 7 && transaction && database.objectStoreNames.contains(STORE_BOOKS)) {
                const defaultLanguage = 'en';
                const nowIso = new Date().toISOString();
                const booksStore = transaction.objectStore(STORE_BOOKS);
                const vocabStore = database.objectStoreNames.contains(STORE_VOCABULARY) ? transaction.objectStore(STORE_VOCABULARY) : null;
                const globalStore = database.objectStoreNames.contains(STORE_GLOBAL_VOCAB) ? transaction.objectStore(STORE_GLOBAL_VOCAB) : null;
                const bookLanguageById = new Map();
                let warned = false;

                const warnMissingLanguage = () => {
                    if (warned) return;
                    warned = true;
                    console.warn('⚠️ Legacy data missing language, defaulting to en.');
                };

                const normalizeLanguage = (value) => {
                    const raw = typeof value === 'string' ? value.trim() : '';
                    return raw || '';
                };

                const normalizeGlobalStore = () => {
                    if (!globalStore) {
                        migrateVocabStore();
                        return;
                    }
                    const cursorRequest = globalStore.openCursor();
                    cursorRequest.onsuccess = () => {
                        const cursor = cursorRequest.result;
                        if (!cursor) {
                            migrateVocabStore();
                            return;
                        }
                        const entry = cursor.value || {};
                        const parsed = parseGlobalVocabId(entry?.id);
                        const normalizedWord = normalizeWord(entry?.normalizedWord || entry?.word || parsed.normalizedWord || entry?.id || '');

                        let language = normalizeLanguage(entry?.language) || parsed.language || '';
                        if (!language && Array.isArray(entry?.sourceBooks)) {
                            for (const bookId of entry.sourceBooks) {
                                const inferred = bookLanguageById.get(bookId);
                                if (inferred) {
                                    language = inferred;
                                    break;
                                }
                            }
                        }
                        if (!language) {
                            language = defaultLanguage;
                            warnMissingLanguage();
                        }

                        const kind = typeof entry?.kind === 'string' && entry.kind.trim() ? entry.kind.trim() : 'global';
                        const nextId = language && normalizedWord ? makeGlobalVocabId(language, normalizedWord) : entry?.id;
                        const updated = {
                            ...entry,
                            id: nextId,
                            kind,
                            language,
                            normalizedWord,
                            updatedAt: entry?.updatedAt || nowIso,
                            createdAt: entry?.createdAt || nowIso
                        };

                        if (entry?.id && nextId && entry.id !== nextId) {
                            globalStore.put(updated);
                            globalStore.delete(entry.id);
                        } else {
                            cursor.update(updated);
                        }
                        cursor.continue();
                    };
                };

                const migrateVocabStore = () => {
                    if (!vocabStore) return;
                    const cursorRequest = vocabStore.openCursor();
                    cursorRequest.onsuccess = () => {
                        const cursor = cursorRequest.result;
                        if (!cursor) return;

                        const entry = cursor.value || {};
                        const normalizedWord = normalizeWord(entry?.word || '');
                        if (!normalizedWord) {
                            cursor.continue();
                            return;
                        }

                        let language = normalizeLanguage(entry?.language) || bookLanguageById.get(entry?.bookId) || '';
                        if (!language) {
                            language = defaultLanguage;
                            warnMissingLanguage();
                        }

                        const needsUpdate = entry?.language !== language || entry?.word !== normalizedWord;
                        if (needsUpdate) {
                            entry.language = language;
                            entry.word = normalizedWord;
                            cursor.update(entry);
                        }

                        if (!globalStore || entry?.status !== 'known') {
                            cursor.continue();
                            return;
                        }

                        const globalId = makeGlobalVocabId(language, normalizedWord);
                        const getReq = globalStore.get(globalId);
                        getReq.onsuccess = () => {
                            const existing = getReq.result || null;
                            if (existing?.kind === 'global' && existing?.status === 'learning') {
                                cursor.continue();
                                return;
                            }

                            const sourceBooks = new Set(Array.isArray(existing?.sourceBooks) ? existing.sourceBooks : []);
                            if (entry?.bookId) sourceBooks.add(entry.bookId);

                            const existingCount = typeof existing?.encounterCount === 'number'
                                ? existing.encounterCount
                                : (existing?.status === 'known' ? 2 : existing?.status === 'seen' ? 1 : 0);
                            const encounterCount = Math.max(existingCount, 2);

                            needsGlobalKnownSync = true;
                            globalStore.put({
                                id: globalId,
                                kind: 'global-known',
                                language,
                                normalizedWord,
                                displayWord: existing?.displayWord || entry?.displayWord || normalizedWord,
                                status: 'known',
                                encounterCount,
                                lastEncounteredAt: existing?.lastEncounteredAt || entry?.updatedAt || nowIso,
                                sourceBooks: Array.from(sourceBooks),
                                createdAt: existing?.createdAt || entry?.createdAt || nowIso,
                                updatedAt: nowIso
                            });
                            cursor.continue();
                        };
                        getReq.onerror = () => cursor.continue();
                    };
                };

                const booksCursor = booksStore.openCursor();
                booksCursor.onsuccess = () => {
                    const cursor = booksCursor.result;
                    if (!cursor) {
                        normalizeGlobalStore();
                        return;
                    }

                    const book = cursor.value || {};
                    let language = normalizeLanguage(book?.language);
                    if (!language) {
                        language = defaultLanguage;
                        warnMissingLanguage();
                        book.language = language;
                        cursor.update(book);
                    }
                    if (book?.id) bookLanguageById.set(book.id, language);
                    cursor.continue();
                };
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
 * List global vocabulary items by kind (optionally filtered by language).
 * @param {string} kind
 * @param {string|null} [language]
 * @returns {Promise<Array>}
 */
export async function listGlobalVocabByKind(kind, language = null) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        const targetKind = typeof kind === 'string' ? kind.trim() : '';
        if (!targetKind) {
            resolve([]);
            return;
        }

        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readonly');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        const lang = typeof language === 'string' ? language.trim() : '';

        if (lang && store.indexNames.contains('kind_language')) {
            const index = store.index('kind_language');
            const request = index.getAll([targetKind, lang]);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
            return;
        }

        if (store.indexNames.contains('kind')) {
            const index = store.index('kind');
            const request = index.getAll(targetKind);
            request.onsuccess = () => {
                const all = request.result || [];
                resolve(lang ? all.filter((it) => it?.language === lang) : all);
            };
            request.onerror = () => reject(request.error);
            return;
        }

        const fallback = store.getAll();
        fallback.onsuccess = () => {
            const all = fallback.result || [];
            resolve(all.filter((it) => it?.kind === targetKind && (!lang || it?.language === lang)));
        };
        fallback.onerror = () => reject(fallback.error);
    });
}

async function syncGlobalKnownRemote() {
    const items = await listGlobalVocabByKind('global-known');
    if (!items || items.length === 0) return;
    try {
        const mod = await import('./supabase/global-vocab-repo.js');
        await mod.upsertGlobalVocabRemoteItems(items);
    } catch (error) {
        console.warn('Global-known remote sync failed:', error);
    }
}

/**
 * Get a global-known entry by word + language.
 * @param {string} word
 * @param {string} language
 * @returns {Promise<Object|null>}
 */
export async function getGlobalKnownItem(word, language) {
    const entry = await getGlobalVocabItem(word, language);
    if (!entry || entry?.kind !== 'global-known') return null;
    return entry;
}

/**
 * List global-known entries for a language.
 * @param {string} language
 * @returns {Promise<Array>}
 */
export async function listGlobalKnownByLanguage(language) {
    return listGlobalVocabByKind('global-known', language);
}

/**
 * Upsert a global-known entry.
 * @param {Object} item
 * @returns {Promise<Object>}
 */
export async function upsertGlobalKnownItem(item) {
    return upsertGlobalVocabItem({ ...item, kind: 'global-known' });
}

/**
 * Upsert global-known entries in a single transaction.
 * @param {Array<Object>} items
 * @param {{skipRemote?: boolean}} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function upsertGlobalKnownItems(items, options = {}) {
    const normalized = Array.isArray(items) ? items.map((item) => ({ ...item, kind: 'global-known' })) : [];
    return upsertGlobalVocabItems(normalized, options);
}

/**
 * Delete a global-known entry.
 * @param {string} idOrWord
 * @param {string|null} [language]
 * @returns {Promise<boolean>}
 */
export async function deleteGlobalKnownItem(idOrWord, language = null) {
    return deleteGlobalVocabItem(idOrWord, language, 'global-known');
}

/**
 * Migrate book-level known words into global-known entries.
 * @param {{dryRun?: boolean, logger?: {info?: Function, warn?: Function}}} [options]
 * @returns {Promise<{total:number, migrated:number, skipped:number, defaulted:number, toUpsert?:number}>}
 */
export async function migrateBookKnownToGlobalKnown(options = {}) {
    if (!db) {
        throw new Error('Database not initialized');
    }
    const dryRun = Boolean(options?.dryRun);
    const logger = options?.logger || console;
    const nowIso = new Date().toISOString();

    const [knownEntries, books] = await Promise.all([
        listVocabularyByStatus('known'),
        getAllBooks()
    ]);

    const bookLanguageById = new Map();
    for (const book of books || []) {
        const language = typeof book?.language === 'string' ? book.language.trim() : '';
        if (book?.id && language) bookLanguageById.set(book.id, language);
    }

    /** @type {Array<any>} */
    const updates = [];
    let skipped = 0;
    let defaulted = 0;

    for (const entry of knownEntries || []) {
        const normalizedWord = normalizeWord(entry?.word || '');
        if (!normalizedWord) continue;

        let language = typeof entry?.language === 'string' ? entry.language.trim() : '';
        if (!language && entry?.bookId) {
            language = bookLanguageById.get(entry.bookId) || '';
        }
        if (!language) {
            language = 'en';
            defaulted += 1;
            logger?.warn?.('Missing language for known word; defaulting to en.', { word: normalizedWord, bookId: entry?.bookId });
        }

        const existing = await getGlobalVocabItem(normalizedWord, language);
        if (existing?.kind === 'global' && existing?.status === 'learning') {
            skipped += 1;
            continue;
        }

        const sourceBooks = new Set(Array.isArray(existing?.sourceBooks) ? existing.sourceBooks : []);
        if (entry?.bookId) sourceBooks.add(entry.bookId);

        const encounterCount = Math.max(
            typeof existing?.encounterCount === 'number' ? existing.encounterCount : 0,
            2
        );

        updates.push({
            ...(existing || {}),
            id: makeGlobalVocabId(language, normalizedWord),
            kind: 'global-known',
            language,
            normalizedWord,
            displayWord: existing?.displayWord || entry?.displayWord || normalizedWord,
            status: 'known',
            encounterCount,
            lastEncounteredAt: existing?.lastEncounteredAt || entry?.updatedAt || nowIso,
            sourceBooks: Array.from(sourceBooks),
            createdAt: existing?.createdAt || entry?.createdAt || nowIso,
            updatedAt: nowIso
        });
    }

    if (dryRun) {
        logger?.info?.('Global-known migration dry run complete.', {
            total: (knownEntries || []).length,
            toUpsert: updates.length,
            skipped,
            defaulted
        });
        return { total: (knownEntries || []).length, toUpsert: updates.length, skipped, defaulted, migrated: 0 };
    }

    const records = await upsertGlobalKnownItems(updates);
    logger?.info?.('Global-known migration complete.', {
        total: (knownEntries || []).length,
        migrated: records.length,
        skipped,
        defaulted
    });
    return { total: (knownEntries || []).length, migrated: records.length, skipped, defaulted };
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
        const kind = typeof item?.kind === 'string' && item.kind.trim() ? item.kind.trim() : 'global';
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
            kind,
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
                        .then((mod) => mod.upsertGlobalVocabRemote(record))
                        .catch((error) => console.warn('Global vocab remote upsert failed:', error));
                });
            }
            resolve(record);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Upsert many global vocabulary items in a single transaction.
 * @param {Array<Object>} items
 * @param {{skipRemote?: boolean}} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function upsertGlobalVocabItems(items, options = {}) {
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
            const parsed = parseGlobalVocabId(item?.id);
            const language = (typeof item?.language === 'string' ? item.language.trim() : '') || parsed.language || '';
            const normalizedWord = normalizeWord(item?.normalizedWord || item?.word || parsed.normalizedWord || item?.id || '');
            const kind = typeof item?.kind === 'string' && item.kind.trim() ? item.kind.trim() : 'global';
            if (!normalizedWord) continue;
            const updatedAt = typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : now;
            const createdAt = typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : updatedAt;
            const id = language ? makeGlobalVocabId(language, normalizedWord) : normalizedWord;
            const { _skipRemote, ...rest } = item || {};
            records.push({
                ...rest,
                id,
                kind,
                language: language || item?.language || null,
                normalizedWord,
                updatedAt,
                createdAt
            });
        }

        if (records.length === 0) {
            resolve([]);
            return;
        }

        const transaction = db.transaction([STORE_GLOBAL_VOCAB], 'readwrite');
        const store = transaction.objectStore(STORE_GLOBAL_VOCAB);
        transaction.oncomplete = () => {
            if (options?.skipRemote) {
                resolve(records);
                return;
            }
            queueMicrotask(() => {
                import('./supabase/global-vocab-repo.js')
                    .then((mod) => mod.upsertGlobalVocabRemoteItems(records))
                    .then(() => resolve(records))
                    .catch((error) => {
                        console.warn('Global vocab remote upsert failed:', error);
                        resolve(records);
                    });
            });
        };
        transaction.onerror = () => reject(transaction.error || new Error('Failed to upsert global vocabulary items'));
        transaction.onabort = () => reject(transaction.error || new Error('Failed to upsert global vocabulary items'));

        for (const record of records) {
            store.put(record);
        }
    });
}

/**
 * Delete a global vocabulary item.
 * @param {string} idOrWord
 * @param {string|null} [language]
 * @returns {Promise<boolean>}
 */
export async function deleteGlobalVocabItem(idOrWord, language = null, kind = 'global') {
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
                    .then((mod) => mod.deleteGlobalVocabRemote(key, kind))
                    .catch((error) => console.warn('Global vocab remote delete failed:', error));
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
