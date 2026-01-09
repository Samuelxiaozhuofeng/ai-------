import { getTheme, saveTheme } from '../storage.js';

/**
 * @param {import('./dom-refs.js').elements} elements
 */
export function applyTheme(elements, theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = theme === 'dark' ? '🌙' : '☀️';
  if (elements.themeIcon) elements.themeIcon.textContent = icon;
  if (elements.themeIconShelf) elements.themeIconShelf.textContent = icon;
}

/**
 * @param {import('./dom-refs.js').elements} elements
 */
export function initTheme(elements) {
  applyTheme(elements, getTheme());
}

/**
 * @param {import('./dom-refs.js').elements} elements
 */
export function toggleTheme(elements) {
  const currentTheme = getTheme();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  saveTheme(newTheme);
  applyTheme(elements, newTheme);
}

