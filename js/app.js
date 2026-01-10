/**
 * Language Reader - Main Application
 * Coordinates all modules and handles UI interactions
 */

import { getSyncStatus, setSyncStatusListener, startBackgroundSync, stopBackgroundSync, syncNow } from './sync-service.js';
import { initDB } from './db.js';
import { elements } from './ui/dom-refs.js';
import { showNotification } from './ui/notifications.js';
import { initTheme, toggleTheme } from './ui/theme-manager.js';
import { ViewRouter } from './core/view-router.js';
import { initLanguageFilter } from './core/language-filter.js';
import { initAutoStudyEnabled } from './core/auto-study.js';
import { refreshGlobalVocabCache } from './core/global-vocab-cache.js';
import { getLayout } from './storage.js';

import { createBookshelfController } from './views/bookshelf.js';
import { createReaderController } from './views/reader.js';
import { createReviewController } from './views/review.js';
import { createVocabLibraryController } from './views/vocab-library.js';
import { createSettingsModalController } from './ui/settings-modal.js';
import { createAuthModalController } from './ui/auth-modal.js';

let currentView = 'bookshelf'; // 'bookshelf' | 'reader' | 'review' | 'vocab-library'

const viewRouter = new ViewRouter({
  bookshelf: elements.bookshelfView,
  reader: elements.readerView,
  review: elements.reviewView,
  'vocab-library': elements.vocabLibraryView
});
viewRouter.currentView = currentView;

const bookshelfController = createBookshelfController(elements);
const readerController = createReaderController(elements);
const reviewController = createReviewController(elements);
const vocabLibraryController = createVocabLibraryController(elements);
const settingsModalController = createSettingsModalController(elements);
const authModalController = createAuthModalController(elements);

async function init() {
  try {
    await initDB();
    console.log('📚 Database initialized');

    initLanguageFilter();
    initAutoStudyEnabled();

    await refreshGlobalVocabCache();

    initTheme(elements);
    readerController.applyLayout(getLayout());
    elements.themeToggleBtn?.addEventListener('click', () => toggleTheme(elements));

    bookshelfController.init({
      onOpenBook: switchToReader,
      onOpenReview: switchToReview,
      onOpenVocabLibrary: switchToVocabLibrary,
      onToggleTheme: () => toggleTheme(elements)
    });
    readerController.init({ onBackToBookshelf: switchToBookshelf });
    reviewController.init({ onBackToBookshelf: switchToBookshelf });
    vocabLibraryController.init({ onBackToBookshelf: switchToBookshelf, onStartReview: switchToReview });
    settingsModalController.init({
      getSyncStatus,
      onAfterSave: handleAfterSettingsSaved,
      onSyncNow: () => {
        const bookId = readerController.getCurrentBookId();
        if (bookId) syncNow(bookId);
      }
    });
    authModalController.init({
      onUserChanged: () => {
        void bookshelfController.refreshBookshelf();
        void bookshelfController.refreshBookshelfReviewButtons();
      }
    });

    setupGlobalKeyHandlers();

    setSyncStatusListener((status) => settingsModalController.updateSyncUI(status));
    settingsModalController.updateSyncUI(getSyncStatus());

    viewRouter.navigate('bookshelf');
    currentView = 'bookshelf';
    await bookshelfController.refreshBookshelf();

    console.log('📚 Language Reader initialized');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    showNotification('初始化失败: ' + error.message, 'error');
  }
}

function setupGlobalKeyHandlers() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName?.toLowerCase?.() || '';
    const isTypingContext = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;

    if (e.key === 'Escape') {
      settingsModalController.handleEscape();
      authModalController.handleEscape();
      bookshelfController.handleEscape();
      vocabLibraryController.handleEscape();
      readerController.handleEscape();

      if (currentView === 'review' || currentView === 'vocab-library') {
        switchToBookshelf();
      }
      return;
    }

    if (!isTypingContext && currentView === 'review') {
      if (reviewController.handleKeyDown(e)) return;
    }

    if (!isTypingContext && currentView === 'reader') {
      if (readerController.handleKeyDown(e)) return;
    }
  });
}

function handleAfterSettingsSaved(settings) {
  void bookshelfController.refreshBookshelfReviewButtons();

  stopBackgroundSync();
  const bookId = readerController.getCurrentBookId();
  if (currentView === 'reader' && bookId) {
    startBackgroundSync(bookId);
    if (settings?.syncEnabled) syncNow(bookId);
  }
}

async function switchToReview(language = null) {
  if (currentView === 'reader') {
    void readerController.saveCurrentProgress();
    stopBackgroundSync();
  }

  viewRouter.navigate('review');
  currentView = 'review';
  try {
    await syncNow(null);
  } catch {
    // ignore
  }
  await reviewController.startReview(language);
}

function switchToBookshelf() {
  if (currentView === 'reader') {
    void readerController.saveCurrentProgress();
  }

  stopBackgroundSync();

  viewRouter.navigate('bookshelf');
  currentView = 'bookshelf';
  elements.readerView.classList.remove('page-mode');

  void bookshelfController.refreshBookshelf();
}

async function switchToVocabLibrary() {
  if (currentView === 'reader') {
    void readerController.saveCurrentProgress();
    stopBackgroundSync();
  }

  viewRouter.navigate('vocab-library');
  currentView = 'vocab-library';

  try {
    await syncNow(null);
  } catch {
    // ignore
  }
  await vocabLibraryController.loadVocabLibrary();
}

async function switchToReader(bookId) {
  const result = await readerController.openBook(bookId, {
    onShowReader: () => {
      viewRouter.navigate('reader');
      currentView = 'reader';
    }
  });

  if (result?.ok) {
    const id = readerController.getCurrentBookId();
    if (id) {
      startBackgroundSync(id);
      try {
        await syncNow(id);
      } catch {
        // ignore
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
