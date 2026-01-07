/**
 * IndexedDB Module
 * Handles persistent storage for books using IndexedDB
 */

const DB_NAME = 'LanguageReaderDB';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';

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

            // Create books store
            if (!database.objectStoreNames.contains(STORE_BOOKS)) {
                const store = database.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('addedAt', 'addedAt', { unique: false });
                store.createIndex('lastReadAt', 'lastReadAt', { unique: false });
                console.log('📚 Created books store');
            }
        };
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

        const transaction = db.transaction([STORE_BOOKS], 'readwrite');
        const store = transaction.objectStore(STORE_BOOKS);

        const book = {
            id: bookData.id,
            title: bookData.title,
            cover: bookData.cover || null,
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
                chapterCount: book.chapterCount,
                addedAt: book.addedAt,
                lastReadAt: book.lastReadAt,
                currentChapter: book.currentChapter
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

