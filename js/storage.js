/**
 * Storage Module
 * Handles localStorage persistence for settings and UI preferences
 * Note: Book data is now stored in IndexedDB (see db.js)
 */

const STORAGE_KEYS = {
  SETTINGS: "language-reader-settings",
  THEME: "language-reader-theme",
  LAYOUT: "language-reader-layout",
  READING_SETTINGS: "language-reader-reading-settings",
  AUTO_STUDY: "language-reader-auto-study",
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

const DEFAULT_READING_SETTINGS = {
  fontPreset: 'serif', // 'serif' | 'sans' | 'system'
  fontSize: 20, // px
  lineHeight: 1.6
};

function normalizeReadingSettings(raw) {
  const fontPreset = raw?.fontPreset === 'sans' || raw?.fontPreset === 'system' ? raw.fontPreset : 'serif';

  let fontSize = Number(raw?.fontSize);
  if (!Number.isFinite(fontSize)) fontSize = DEFAULT_READING_SETTINGS.fontSize;
  fontSize = Math.max(14, Math.min(28, fontSize));
  fontSize = Math.round(fontSize / 2) * 2;

  let lineHeight = Number(raw?.lineHeight);
  if (!Number.isFinite(lineHeight)) lineHeight = DEFAULT_READING_SETTINGS.lineHeight;
  lineHeight = Math.max(1.4, Math.min(2.0, lineHeight));
  lineHeight = Math.round(lineHeight * 10) / 10;

  return { fontPreset, fontSize, lineHeight };
}

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

export function getAutoStudyPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.AUTO_STUDY);
    if (stored != null) {
      return stored === 'true';
    }

    // Back-compat migration: previously stored under Anki settings.
    const legacyRaw = localStorage.getItem('language-reader-anki-settings');
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      const enabled = Boolean(parsed?.autoAddToStudy ?? parsed?.autoAddToAnki ?? false);
      localStorage.setItem(STORAGE_KEYS.AUTO_STUDY, enabled ? 'true' : 'false');
      return enabled;
    }
  } catch (e) {
    console.error("Failed to load auto study preference:", e);
  }
  return false;
}

export function saveAutoStudyPreference(enabled) {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTO_STUDY, Boolean(enabled) ? 'true' : 'false');
    return true;
  } catch (e) {
    console.error("Failed to save auto study preference:", e);
    return false;
  }
}

export function getReadingSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.READING_SETTINGS);
    if (stored) {
      return normalizeReadingSettings({ ...DEFAULT_READING_SETTINGS, ...JSON.parse(stored) });
    }
  } catch (e) {
    console.error("Failed to load reading settings:", e);
  }
  return { ...DEFAULT_READING_SETTINGS };
}

export function saveReadingSettings(settings) {
  try {
    const normalized = normalizeReadingSettings(settings);
    localStorage.setItem(STORAGE_KEYS.READING_SETTINGS, JSON.stringify(normalized));
    return true;
  } catch (e) {
    console.error("Failed to save reading settings:", e);
    return false;
  }
}

function bindReadingContentTypography() {
  const readingContent = document.getElementById('readingContent');
  if (!readingContent) return false;

  // Ensure reading preferences win even against responsive `!important` overrides.
  readingContent.style.setProperty('font-family', 'var(--reader-font-family)', 'important');
  readingContent.style.setProperty('font-size', 'var(--reader-font-size)', 'important');
  readingContent.style.setProperty('line-height', 'var(--reader-line-height)', 'important');
  return true;
}

export function applyReadingSettings(nextSettings = getReadingSettings()) {
  if (typeof document === 'undefined') return;
  const settings = normalizeReadingSettings(nextSettings);

  const stackVar =
    settings.fontPreset === 'sans'
      ? 'var(--font-stack-sans)'
      : settings.fontPreset === 'system'
        ? 'var(--font-stack-system)'
        : 'var(--font-stack-serif)';

  document.documentElement.style.setProperty('--reader-font-family', stackVar);
  document.documentElement.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--reader-line-height', String(settings.lineHeight));

  if (!bindReadingContentTypography() && typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => bindReadingContentTypography(), { once: true });
  }
}

// Apply persisted reading settings on startup.
try {
  if (typeof window !== 'undefined') applyReadingSettings();
} catch (e) {
  console.error("Failed to apply reading settings:", e);
}
