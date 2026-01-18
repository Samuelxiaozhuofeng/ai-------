export function createZenModeController(elements) {
  const EDGE_THRESHOLD_PX = 50;
  const UI_HIDE_DELAY_MS = 3000;

  let zenModeActive = false;
  let hideTimer = null;
  let sidebarWasCollapsed = false;

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

  function clearHideTimer() {
    if (hideTimer == null) return;
    clearTimeout(hideTimer);
    hideTimer = null;
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
      hideTimer = null;
      hideUi();
    }, UI_HIDE_DELAY_MS);
  }

  function handleMouseMove(event) {
    if (!zenModeActive || !isReaderVisible()) return;
    const viewportHeight = window.innerHeight || 0;
    if (!viewportHeight) return;
    const y = event.clientY;
    if (y <= EDGE_THRESHOLD_PX || y >= viewportHeight - EDGE_THRESHOLD_PX) {
      clearHideTimer();
      revealUi();
      return;
    }
    scheduleHide();
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

    clearHideTimer();
    setButtonState(true);
  }

  function exitZenMode({ revealSidebar = false } = {}) {
    if (!zenModeActive) return;
    zenModeActive = false;

    clearHideTimer();
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
  }

  return {
    init,
    enterZenMode,
    exitZenMode,
    toggleZenMode,
    isZenMode: () => zenModeActive
  };
}
