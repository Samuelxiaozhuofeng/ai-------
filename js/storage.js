/**
 * Storage Module
 * Handles localStorage persistence for settings and book data
 */

const STORAGE_KEYS = {
  SETTINGS: "language-reader-settings",
  BOOKS: "language-reader-books",
  THEME: "language-reader-theme",
  LAYOUT: "language-reader-layout",
};

// Default settings
const DEFAULT_SETTINGS = {
  apiUrl: "",
  apiKey: "",
  model: "",
  language: "中文",
};

// Default layout settings
const DEFAULT_LAYOUT = {
  readerWidth: 60, // percentage
  panelWidth: 40,  // percentage
};

/**
 * Get AI settings from localStorage
 * @returns {Object} Settings object
 */
export function getSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save AI settings to localStorage
 * @param {Object} settings - Settings to save
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error("Failed to save settings:", e);
    return false;
  }
}

/**
 * Get all stored books data
 * @returns {Object} Books data object
 */
export function getBooks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.BOOKS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load books:", e);
  }
  return {};
}

/**
 * Get book data by hash
 * @param {string} bookHash - Book identifier hash
 * @returns {Object|null} Book data or null
 */
export function getBookData(bookHash) {
  const books = getBooks();
  return books[bookHash] || null;
}

/**
 * Save book data
 * @param {string} bookHash - Book identifier hash
 * @param {Object} bookData - Book data to save
 */
export function saveBookData(bookHash, bookData) {
  try {
    const books = getBooks();
    books[bookHash] = bookData;
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
    return true;
  } catch (e) {
    console.error("Failed to save book data:", e);
    return false;
  }
}

/**
 * Save marks for a specific chapter
 * @param {string} bookHash - Book identifier hash
 * @param {string} chapterId - Chapter identifier
 * @param {Array} marks - Array of mark objects
 */
export function saveChapterMarks(bookHash, chapterId, marks) {
  const books = getBooks();
  if (!books[bookHash]) {
    books[bookHash] = { marks: {} };
  }
  if (!books[bookHash].marks) {
    books[bookHash].marks = {};
  }
  books[bookHash].marks[chapterId] = marks;
  localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
}

/**
 * Get marks for a specific chapter
 * @param {string} bookHash - Book identifier hash
 * @param {string} chapterId - Chapter identifier
 * @returns {Array} Array of mark objects
 */
export function getChapterMarks(bookHash, chapterId) {
  const books = getBooks();
  return books[bookHash]?.marks?.[chapterId] || [];
}

/**
 * Save current reading position
 * @param {string} bookHash - Book identifier hash
 * @param {number} chapterIndex - Current chapter index
 */
export function saveReadingPosition(bookHash, chapterIndex) {
  const books = getBooks();
  if (!books[bookHash]) {
    books[bookHash] = {};
  }
  books[bookHash].currentChapter = chapterIndex;
  localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
}

/**
 * Get current reading position
 * @param {string} bookHash - Book identifier hash
 * @returns {number} Current chapter index or 0
 */
export function getReadingPosition(bookHash) {
  const books = getBooks();
  return books[bookHash]?.currentChapter || 0;
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
  return "book-" + Math.abs(hash).toString(16);
}

/**
 * Get current theme
 * @returns {string} Theme name ('dark' or 'light')
 */
export function getTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  } catch (e) {
    return 'dark';
  }
}

/**
 * Save theme preference
 * @param {string} theme - Theme name
 */
export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    return true;
  } catch (e) {
    console.error("Failed to save theme:", e);
    return false;
  }
}

/**
 * Get layout settings
 * @returns {Object} Layout settings
 */
export function getLayout() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LAYOUT);
    if (stored) {
      return { ...DEFAULT_LAYOUT, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load layout:", e);
  }
  return { ...DEFAULT_LAYOUT };
}

/**
 * Save layout settings
 * @param {Object} layout - Layout settings
 */
export function saveLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEYS.LAYOUT, JSON.stringify(layout));
    return true;
  } catch (e) {
    console.error("Failed to save layout:", e);
    return false;
  }
}
