import { elements } from './dom-refs.js';
import { ModalManager } from './modal-manager.js';
import { getLanguageFilter } from '../core/language-filter.js';
import { SUPPORTED_LANGUAGES } from '../storage.js';
import { getKnownWordsStats, queryKnownWords } from '../db.js';
import { showNotification } from './notifications.js';

const PAGE_SIZE = 50;
const STATS_CACHE_TTL_MS = 5 * 60 * 1000;
const LANGUAGE_FLAGS = {
  en: '🇬🇧',
  es: '🇪🇸',
  ja: '🇯🇵'
};

/** @type {Map<string, { total: number, today: number, byLanguage: Record<string, number>, ts: number }>} */
const statsCache = new Map();

const state = {
  tab: 'all',
  page: 1,
  search: '',
  language: '',
  languageTouched: false
};

/** @type {ModalManager | null} */
let knownWordsModalManager = null;
let searchTimer = null;
let broadcastChannel = null;

/**
 * @param {string|null} language
 * @returns {string}
 */
function getStatsCacheKey(language) {
  return language || 'all';
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatCount(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat().format(safe);
}

/**
 * @param {string} dateIso
 * @returns {string}
 */
function formatRelativeTime(dateIso) {
  if (!dateIso) return '—';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '—';
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return '刚刚';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}分钟前`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}小时前`;
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}天前`;
  return date.toLocaleDateString();
}

/**
 * @param {string} language
 * @returns {string}
 */
function formatLanguageLabel(language) {
  if (!language) return '全部';
  return SUPPORTED_LANGUAGES[language] || language.toUpperCase();
}

/**
 * @param {string} language
 * @returns {string}
 */
function formatLanguageBadge(language) {
  const label = formatLanguageLabel(language);
  const flag = LANGUAGE_FLAGS[language] || '🌐';
  return `${flag} ${label}`.trim();
}

/**
 * @param {boolean} isLoading
 */
function setStatsLoading(isLoading) {
  if (!elements.knownWordsCard) return;
  elements.knownWordsCard.classList.toggle('is-loading', isLoading);
}

/**
 * @param {boolean} isLoading
 */
function setListLoading(isLoading) {
  if (elements.knownWordsLoading) {
    elements.knownWordsLoading.style.display = isLoading ? 'flex' : 'none';
  }
}

/**
 * @param {string} language
 */
function updateLanguageLabel(language) {
  if (!elements.knownWordsLanguageLabel) return;
  elements.knownWordsLanguageLabel.textContent = formatLanguageLabel(language);
}

/**
 * Clear cached stats so the next fetch recomputes from IndexedDB.
 */
function invalidateStatsCache() {
  statsCache.clear();
}

/**
 * @param {string|null} [language]
 * @returns {Promise<{ total: number, today: number, byLanguage: Record<string, number>, ts: number }>}
 */
async function getKnownWordsStatsCached(language = null) {
  const key = getStatsCacheKey(language);
  const cached = statsCache.get(key);
  if (cached && Date.now() - cached.ts < STATS_CACHE_TTL_MS) return cached;

  const stats = await getKnownWordsStats(language);
  const next = { ...stats, ts: Date.now() };
  statsCache.set(key, next);
  return next;
}

/**
 * Get total known words count.
 * @param {string|null} [language]
 * @returns {Promise<number>}
 */
export async function getTotalKnownWords(language = null) {
  const stats = await getKnownWordsStatsCached(language);
  return stats.total || 0;
}

/**
 * Get today's known words count.
 * @param {string|null} [language]
 * @returns {Promise<number>}
 */
export async function getTodayKnownWords(language = null) {
  const stats = await getKnownWordsStatsCached(language);
  return stats.today || 0;
}

/**
 * Get known words list with filters.
 * @param {{language?: string|null, search?: string, page?: number, pageSize?: number, todayOnly?: boolean}} [options]
 * @returns {Promise<{items: Array, total: number}>}
 */
export async function getKnownWordsList(options = {}) {
  return queryKnownWords(options);
}

/**
 * Render known words list into container.
 * @param {Array} words
 * @param {HTMLElement|null} container
 */
export function renderKnownWordsList(words, container) {
  if (!container) return;
  container.innerHTML = '';

  const fragment = document.createDocumentFragment();
  for (const entry of words || []) {
    const card = document.createElement('article');
    card.className = 'known-word-card';

    const header = document.createElement('div');
    header.className = 'known-word-header';

    const language = document.createElement('span');
    language.className = 'known-word-language';
    language.textContent = formatLanguageBadge(entry?.language || '');

    const term = document.createElement('div');
    term.className = 'known-word-term';
    term.textContent = entry?.displayWord || entry?.word || entry?.normalizedWord || '—';

    header.appendChild(language);
    header.appendChild(term);

    const meta = document.createElement('div');
    meta.className = 'known-word-meta';

    const masteredRow = document.createElement('div');
    masteredRow.className = 'known-word-row';
    masteredRow.innerHTML = `<span>掌握时间</span><span>${formatRelativeTime(entry?.updatedAt || entry?.createdAt)}</span>`;

    const encounterValue = Number(entry?.encounterCount);
    const encounterCount = Number.isFinite(encounterValue) ? encounterValue : 0;
    const sourceBooks = Array.isArray(entry?.sourceBooks) ? entry.sourceBooks.length : 0;

    const encounterRow = document.createElement('div');
    encounterRow.className = 'known-word-row';
    encounterRow.innerHTML = `<span>遇到次数</span><span>${encounterCount} 次</span>`;

    const sourceRow = document.createElement('div');
    sourceRow.className = 'known-word-row';
    sourceRow.innerHTML = `<span>来源书籍</span><span>${sourceBooks} 本</span>`;

    meta.appendChild(masteredRow);
    meta.appendChild(encounterRow);
    meta.appendChild(sourceRow);

    const pills = document.createElement('div');
    pills.className = 'known-word-pills';

    const pillEncounter = document.createElement('span');
    pillEncounter.className = 'known-word-pill';
    pillEncounter.textContent = `遇到 ${encounterCount} 次`;

    const pillSources = document.createElement('span');
    pillSources.className = 'known-word-pill secondary';
    pillSources.textContent = `来自 ${sourceBooks} 本书`;

    pills.appendChild(pillEncounter);
    pills.appendChild(pillSources);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(pills);

    fragment.appendChild(card);
  }

  container.appendChild(fragment);
}

/**
 * Update Known Words stats card.
 * @returns {Promise<void>}
 */
export async function updateKnownWordsStats() {
  if (!elements.knownWordsCard) return;
  const language = getLanguageFilter();
  updateLanguageLabel(language);
  setStatsLoading(true);
  try {
    const stats = await getKnownWordsStatsCached(language);
    const totalValue = formatCount(stats.total || 0);
    const todayValue = stats.today || 0;

    if (elements.knownWordsTotal) elements.knownWordsTotal.textContent = totalValue;
    if (elements.knownWordsToday) {
      elements.knownWordsToday.textContent = todayValue > 0 ? `+${formatCount(todayValue)}` : '0';
    }
  } catch (error) {
    console.warn('Failed to load known words stats:', error);
    if (elements.knownWordsTotal) elements.knownWordsTotal.textContent = '—';
    if (elements.knownWordsToday) elements.knownWordsToday.textContent = '—';
  } finally {
    setStatsLoading(false);
  }
}

/**
 * Sync active tab styling.
 */
function updateTabsUi() {
  if (!elements.knownWordsTabs) return;
  const tabs = elements.knownWordsTabs.querySelectorAll('.known-words-tab');
  tabs.forEach((tab) => {
    const isActive = tab.dataset.knownTab === state.tab;
    tab.classList.toggle('active', isActive);
  });
}

/**
 * Sync filter inputs with current state.
 */
function updateFilterUi() {
  if (elements.knownWordsSearchInput) {
    elements.knownWordsSearchInput.value = state.search;
  }
  if (elements.knownWordsLanguageFilter) {
    elements.knownWordsLanguageFilter.value = state.language;
  }
}

/**
 * @param {number} total
 */
function updatePaginationUi(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(state.page, totalPages);
  state.page = current;

  if (elements.knownWordsResultCount) {
    elements.knownWordsResultCount.textContent = `结果: ${formatCount(total)}`;
  }
  if (elements.knownWordsPageInfo) {
    elements.knownWordsPageInfo.textContent = `第 ${current} 页`;
  }
  if (elements.knownWordsPageSummary) {
    elements.knownWordsPageSummary.textContent = `第 ${current} / ${totalPages} 页`;
  }
  if (elements.knownWordsPrevPage) elements.knownWordsPrevPage.disabled = current <= 1;
  if (elements.knownWordsNextPage) elements.knownWordsNextPage.disabled = current >= totalPages;
}

/**
 * Refresh the list based on current state.
 */
async function refreshKnownWordsList() {
  if (!elements.knownWordsList) return;
  setListLoading(true);
  if (elements.knownWordsEmpty) elements.knownWordsEmpty.style.display = 'none';

  try {
    const requestedPage = state.page;
    const { items, total } = await getKnownWordsList({
      language: state.language || null,
      search: state.search,
      page: requestedPage,
      pageSize: PAGE_SIZE,
      todayOnly: state.tab === 'today'
    });

    updatePaginationUi(total);
    if (total > 0 && state.page !== requestedPage) {
      void refreshKnownWordsList();
      return;
    }

    if (!items.length) {
      elements.knownWordsList.innerHTML = '';
      if (elements.knownWordsEmpty) elements.knownWordsEmpty.style.display = 'block';
      return;
    }

    renderKnownWordsList(items, elements.knownWordsList);
  } catch (error) {
    console.error('Failed to load known words list:', error);
    showNotification(`加载已掌握词汇失败: ${error.message || error}`, 'error');
  } finally {
    setListLoading(false);
  }
}

/**
 * @param {Event} event
 */
function handleSearchInput(event) {
  const value = event.target?.value || '';
  state.search = String(value).trim();
  state.page = 1;

  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void refreshKnownWordsList();
  }, 250);
}

/**
 * @param {Event} event
 */
function handleLanguageChange(event) {
  const value = event.target?.value || '';
  state.language = String(value);
  state.languageTouched = true;
  state.page = 1;
  void refreshKnownWordsList();
}

/**
 * @param {Event} event
 */
function handleTabClick(event) {
  const target = event.target?.closest?.('.known-words-tab');
  if (!target) return;
  const tab = target.dataset.knownTab === 'today' ? 'today' : 'all';
  if (state.tab === tab) return;
  state.tab = tab;
  state.page = 1;
  updateTabsUi();
  void refreshKnownWordsList();
}

/**
 * @param {number} direction
 */
function handlePaginationChange(direction) {
  state.page += direction;
  if (state.page < 1) state.page = 1;
  void refreshKnownWordsList();
}

/**
 * Refresh stats and list after known words change.
 */
function handleKnownWordsUpdated() {
  invalidateStatsCache();
  void updateKnownWordsStats();
  if (knownWordsModalManager?.isOpen()) {
    void refreshKnownWordsList();
  }
}

/**
 * Wire cross-tab listeners for known-word updates.
 */
function registerCrossTabListeners() {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('global-known-words');
    broadcastChannel.addEventListener('message', () => handleKnownWordsUpdated());
  }

  window.addEventListener('global-known-updated', handleKnownWordsUpdated);
  window.addEventListener('storage', (event) => {
    if (event.key === 'global-known-updated') handleKnownWordsUpdated();
  });
}

/**
 * Sync language filter from bookshelf tabs unless user already set one in modal.
 */
function syncLanguageFilterToState() {
  if (state.languageTouched) return;
  const currentLanguage = getLanguageFilter();
  state.language = currentLanguage || '';
}

/**
 * Open Known Words modal.
 * @param {'all'|'today'} [tab]
 */
export function openKnownWordsModal(tab = 'all') {
  if (!knownWordsModalManager) return;
  state.tab = tab === 'today' ? 'today' : 'all';
  state.page = 1;
  state.search = '';
  state.languageTouched = false;
  syncLanguageFilterToState();

  updateTabsUi();
  updateFilterUi();

  knownWordsModalManager.open({ focusTarget: elements.knownWordsSearchInput || null });
  void refreshKnownWordsList();
}

/**
 * Handle Escape key for Known Words modal.
 * @returns {boolean}
 */
export function handleKnownWordsEscape() {
  if (!knownWordsModalManager) return false;
  return knownWordsModalManager.handleEscape();
}

/**
 * Initialize Known Words UI.
 */
export function initKnownWordsUI() {
  if (!elements.knownWordsCard || !elements.knownWordsModal) return;

  knownWordsModalManager = new ModalManager(elements.knownWordsModal, {
    focusTarget: elements.knownWordsSearchInput || null
  });
  knownWordsModalManager.registerCloseButton(elements.closeKnownWordsBtn);

  elements.knownWordsCard.addEventListener('click', () => openKnownWordsModal('all'));
  elements.knownWordsTabs?.addEventListener('click', handleTabClick);
  elements.knownWordsSearchInput?.addEventListener('input', handleSearchInput);
  elements.knownWordsLanguageFilter?.addEventListener('change', handleLanguageChange);

  elements.knownWordsPrevPage?.addEventListener('click', () => handlePaginationChange(-1));
  elements.knownWordsNextPage?.addEventListener('click', () => handlePaginationChange(1));

  elements.languageTabs?.addEventListener('click', () => {
    state.languageTouched = false;
    syncLanguageFilterToState();
    void updateKnownWordsStats();
  });

  window.addEventListener('language-filter-changed', () => {
    state.languageTouched = false;
    syncLanguageFilterToState();
    void updateKnownWordsStats();
  });

  registerCrossTabListeners();
  void updateKnownWordsStats();
}
