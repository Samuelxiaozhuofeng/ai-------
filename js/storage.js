/**
 * Storage Module
 * Handles localStorage persistence for settings and UI preferences
 * Note: Book data is now stored in IndexedDB (see db.js)
 */

const STORAGE_KEYS = {
  SETTINGS: "language-reader-settings",
  THEME: "language-reader-theme",
  LAYOUT: "language-reader-layout",
};

// Default settings
const DEFAULT_SETTINGS = {
  apiUrl: "",
  apiKey: "",
  model: "",
  language: "中文",
  readingLevel: "intermediate",
};

// Default layout settings
const DEFAULT_LAYOUT = {
  readerWidth: 70, // percentage
  panelWidth: 30,  // percentage
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
