import { SUPPORTED_LANGUAGES } from '../storage.js';

const STORAGE_KEY = 'language-reader-language-filter';

let currentLanguageFilter = 'en';

export function initLanguageFilter() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, stored)) {
      currentLanguageFilter = stored;
    }
  } catch {
    // ignore
  }
  return currentLanguageFilter;
}

export function getLanguageFilter() {
  return currentLanguageFilter;
}

/**
 * @param {string} language
 */
export function setLanguageFilter(language) {
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, language)) return currentLanguageFilter;
  currentLanguageFilter = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent('language-filter-changed', { detail: { language } }));
  } catch {
    // ignore
  }
  return currentLanguageFilter;
}
