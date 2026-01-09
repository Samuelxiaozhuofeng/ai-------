/**
 * Storage Module
 * Handles localStorage persistence for settings and UI preferences
 * Note: Book data is now stored in IndexedDB (see db.js)
 */

const STORAGE_KEYS = {
  SETTINGS: "language-reader-settings",
  THEME: "language-reader-theme",
  LAYOUT: "language-reader-layout",
  ANKI_SETTINGS: "language-reader-anki-settings",
};

export const SUPPORTED_LANGUAGES = /** @type {const} */ ({
  en: '英语',
  es: '西班牙语',
  ja: '日语'
});

// Default settings
const DEFAULT_SETTINGS = {
  apiUrl: "",
  apiKey: "",
  model: "",
  language: "中文",
  readingLevel: "intermediate",
  backendUrl: "http://localhost:8000",
  syncEnabled: false,
};

// Default layout settings
const DEFAULT_LAYOUT = {
  readerWidth: 70, // percentage
  panelWidth: 30,  // percentage
};

export const FSRS_SETTINGS_KEY = 'language-reader-fsrs-settings';

const DEFAULT_FSRS_SETTINGS = {
  reviewMode: 'grouped', // 'grouped' | 'mixed'
  requestRetention: 0.9
};

function normalizeFsrsSettings(raw) {
  const reviewMode = raw?.reviewMode === 'mixed' ? 'mixed' : 'grouped';
  let requestRetention = Number(raw?.requestRetention);
  if (!Number.isFinite(requestRetention)) requestRetention = DEFAULT_FSRS_SETTINGS.requestRetention;
  requestRetention = Math.max(0.7, Math.min(0.97, requestRetention));
  requestRetention = Math.round(requestRetention * 100) / 100;
  return { reviewMode, requestRetention };
}

export function getFsrsSettings() {
  try {
    const stored = localStorage.getItem(FSRS_SETTINGS_KEY);
    if (stored) {
      return normalizeFsrsSettings({ ...DEFAULT_FSRS_SETTINGS, ...JSON.parse(stored) });
    }
  } catch (e) {
    console.error("Failed to load FSRS settings:", e);
  }
  return { ...DEFAULT_FSRS_SETTINGS };
}

export function saveFsrsSettings(settings) {
  try {
    const normalized = normalizeFsrsSettings(settings);
    localStorage.setItem(FSRS_SETTINGS_KEY, JSON.stringify(normalized));
    return true;
  } catch (e) {
    console.error("Failed to save FSRS settings:", e);
    return false;
  }
}

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

// Default Anki settings
const DEFAULT_ANKI_SETTINGS = {
  deckName: '',
  modelName: '',
  fieldMapping: {
    word: '',           // 词汇
    context: '',        // 上下文（currentSentence）
    meaning: '',        // 含义
    usage: '',          // 用法
    contextualMeaning: '' // 上下文含义
  },
  autoAddToStudy: false,
  // Back-compat (toggle used to be "Auto Add to Anki")
  autoAddToAnki: false
};

/**
 * Get Anki settings from localStorage
 * @returns {Object} Anki settings object
 */
export function getAnkiSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ANKI_SETTINGS);
    if (stored) {
      const parsed = JSON.parse(stored);
      const autoAddToStudy = parsed.autoAddToStudy ?? parsed.autoAddToAnki ?? DEFAULT_ANKI_SETTINGS.autoAddToStudy;
      // Merge with defaults to ensure all fields exist
      return {
        ...DEFAULT_ANKI_SETTINGS,
        ...parsed,
        fieldMapping: {
          ...DEFAULT_ANKI_SETTINGS.fieldMapping,
          ...(parsed.fieldMapping || {})
        },
        autoAddToStudy
      };
    }
  } catch (e) {
    console.error("Failed to load Anki settings:", e);
  }
  return { ...DEFAULT_ANKI_SETTINGS };
}

/**
 * Save Anki settings to localStorage
 * @param {Object} settings - Anki settings to save
 */
export function saveAnkiSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.ANKI_SETTINGS, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error("Failed to save Anki settings:", e);
    return false;
  }
}
