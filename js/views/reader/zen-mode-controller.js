export function createZenModeController(elements, callbacks = {}) {
  const EDGE_THRESHOLD_PX = 50;
  const UI_HIDE_DELAY_MS = 3000;
  const CARD_WIDTH_PX = 340;
  const CARD_GAP_PX = 20;
  const CARD_MIN_TOP_PX = 80;
  const CARD_BOTTOM_GAP_PX = 20;
  const CARD_MAX_HEIGHT_RATIO = 0.8;
  const POINTER_PADDING_PX = 16;

  let zenModeActive = false;
  let hideTimer = null;
  let sidebarWasCollapsed = false;
  let escKeyHandler = null;
  let lastWordEl = null;

  function isReaderVisible() {
    if (!elements.readerView) return false;
    return elements.readerView.style.display !== 'none';
  }

  function setButtonState(active) {
    if (!elements.zenModeBtn) return;
    elements.zenModeBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    elements.zenModeBtn.classList.toggle('is-active', active);
    elements.zenModeBtn.title = active ? '退出沉浸模式 (Z)' : '沉浸模式 (Z)';
  }

  function showZenSidebar(wordEl = null) {
    if (!zenModeActive || !elements.vocabPanel) return;
    if (wordEl) lastWordEl = wordEl;
    elements.vocabPanel.classList.add('zen-sidebar-visible');
    updateZenSidebarPosition(lastWordEl);
    bindEscClose();
  }

  function hideZenSidebar() {
    if (!elements.vocabPanel) return;
    elements.vocabPanel.classList.remove('zen-sidebar-visible');
    elements.readerView?.classList.remove('zen-note-fallback');
    unbindEscClose();
  }

  function isZenSidebarVisible() {
    return Boolean(elements.vocabPanel?.classList.contains('zen-sidebar-visible'));
  }

  function clearHideTimer() {
    if (hideTimer == null) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function getContentMaxWidth() {
    const rawValue = getComputedStyle(document.documentElement)
      .getPropertyValue('--reader-content-max-width')
      .trim();
    const parsed = parseInt(rawValue, 10);
    if (Number.isFinite(parsed)) return parsed;
    return 720;
  }

  function updateZenSidebarPosition(wordEl) {
    if (!elements.vocabPanel || !elements.readingContent || !elements.readerView) return;
    if (!wordEl || typeof wordEl.getBoundingClientRect !== 'function') return;
    if (!wordEl.isConnected || !elements.readingContent.contains(wordEl)) return;

    const contentRect = elements.readingContent.getBoundingClientRect();
    const contentMaxWidth = getContentMaxWidth();
    const effectiveWidth = Math.min(contentRect.width, contentMaxWidth);
    const readingColumnRight = contentRect.left + (contentRect.width / 2) + (effectiveWidth / 2);

    const availableSpace = (window.innerWidth || 0) - readingColumnRight;
    const requiredSpace = CARD_WIDTH_PX + 40;
    const shouldFallback = availableSpace < requiredSpace;
    elements.readerView.classList.toggle('zen-note-fallback', shouldFallback);

    const wordRect = wordEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 0;
    if (!viewportHeight) return;
    const maxHeight = Math.round(viewportHeight * CARD_MAX_HEIGHT_RATIO);
    const maxTop = Math.max(CARD_MIN_TOP_PX, viewportHeight - maxHeight - CARD_BOTTOM_GAP_PX);
    const cardTop = Math.max(CARD_MIN_TOP_PX, Math.min(wordRect.top, maxTop));
    const cardLeft = readingColumnRight + CARD_GAP_PX;
    const pointerOffset = (wordRect.top + wordRect.height / 2) - cardTop;
    const initialPointer = Math.max(POINTER_PADDING_PX, pointerOffset);

    elements.vocabPanel.style.setProperty('--vocab-note-left', `${Math.round(cardLeft)}px`);
    elements.vocabPanel.style.setProperty('--vocab-note-top', `${Math.round(cardTop)}px`);
    elements.vocabPanel.style.setProperty('--vocab-note-pointer-offset', `${Math.round(initialPointer)}px`);

    window.requestAnimationFrame(() => {
      if (!elements.vocabPanel?.classList.contains('zen-sidebar-visible')) return;
      const panelRect = elements.vocabPanel.getBoundingClientRect();
      const pointerMax = Math.max(POINTER_PADDING_PX, panelRect.height - POINTER_PADDING_PX);
      const clamped = Math.min(pointerMax, Math.max(POINTER_PADDING_PX, pointerOffset));
      elements.vocabPanel.style.setProperty('--vocab-note-pointer-offset', `${Math.round(clamped)}px`);
    });
  }

  function bindEscClose() {
    if (escKeyHandler) return;
    escKeyHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hideZenSidebar();
    };
    document.addEventListener('keydown', escKeyHandler, true);
  }

  function unbindEscClose() {
    if (!escKeyHandler) return;
    document.removeEventListener('keydown', escKeyHandler, true);
    escKeyHandler = null;
  }

  function revealUi() {
    if (!elements.readerView) return;
    elements.readerView.classList.add('ui-revealed');
  }

  function hideUi() {
    if (!elements.readerView) return;
    elements.readerView.classList.remove('ui-revealed');
  }

  function scheduleHide() {
    if (!elements.readerView?.classList.contains('ui-revealed')) return;
    if (hideTimer != null) return;
    hideTimer = window.setTimeout(() => {
      // Don't hide UI if user is interacting with the sidebar
      if (isZenSidebarVisible()) {
        hideTimer = null;
        scheduleHide(); 
        return;
      }
      hideTimer = null;
      hideUi();
    }, UI_HIDE_DELAY_MS);
  }

  function handleMouseMove(event) {
    if (!zenModeActive || !isReaderVisible()) return;
    // Mouse edge detection is disabled in Zen mode for full immersion.
    return;
  }

  function enterZenMode() {
    if (zenModeActive) return;
    zenModeActive = true;

    if (elements.readerView) {
      elements.readerView.classList.add('zen-mode');
      elements.readerView.classList.remove('ui-revealed');
    }

    sidebarWasCollapsed = Boolean(elements.vocabPanel?.classList.contains('collapsed'));
    if (!sidebarWasCollapsed) {
      elements.vocabPanel?.classList.add('collapsed');
    }
    
    // Ensure sidebar is hidden initially in Zen Mode
    hideZenSidebar();

    clearHideTimer();
    setButtonState(true);

    if (typeof callbacks.onStateChange === 'function') {
      callbacks.onStateChange(true);
    }
  }

  function exitZenMode({ revealSidebar = false } = {}) {
    if (!zenModeActive) return;
    zenModeActive = false;

    clearHideTimer();
    hideZenSidebar();

    if (elements.readerView) {
      elements.readerView.classList.remove('zen-mode');
      elements.readerView.classList.remove('ui-revealed');
    }

    if (revealSidebar) {
      elements.vocabPanel?.classList.remove('collapsed');
    } else if (!sidebarWasCollapsed) {
      elements.vocabPanel?.classList.remove('collapsed');
    }

    setButtonState(false);

    if (typeof callbacks.onStateChange === 'function') {
      callbacks.onStateChange(false);
    }
  }

  function toggleZenMode() {
    if (zenModeActive) {
      exitZenMode();
      return;
    }
    enterZenMode();
  }

  function init() {
    elements.zenModeBtn?.addEventListener('click', toggleZenMode);
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', () => {
      if (!zenModeActive || !isZenSidebarVisible()) return;
      if (!lastWordEl) return;
      updateZenSidebarPosition(lastWordEl);
    }, { passive: true });
  }

  return {
    init,
    enterZenMode,
    exitZenMode,
    toggleZenMode,
    isZenMode: () => zenModeActive,
    showZenSidebar,
    hideZenSidebar,
    isZenSidebarVisible
  };
}
