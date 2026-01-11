import {
  getFsrsSettings,
  getReadingSettings,
  getSettings,
  saveFsrsSettings,
  saveAutoStudyPreference,
  saveReadingSettings,
  applyReadingSettings,
  saveSettings
} from '../storage.js';
import { fetchModels } from '../ai-service.js';
import { ModalManager } from './modal-manager.js';
import { getAutoStudyEnabled, setAutoStudyEnabled } from '../core/auto-study.js';
import { showNotification } from './notifications.js';

/**
 * @param {import('./dom-refs.js').elements} elements
 */
export function createSettingsModalController(elements) {
  const settingsModalManager = new ModalManager(elements.settingsModal);
  settingsModalManager.registerCloseButton(elements.closeSettingsBtn);
  settingsModalManager.registerCloseButton(elements.cancelSettingsBtn);

  /** @type {{ onAfterSave: (settings: any) => void }} */
  let hooks = { onAfterSave: () => {} };

  /** @type {{ fontPreset: 'serif'|'sans'|'system', fontSize: number, lineHeight: number } | null} */
  let readingBaselineSettings = null;
  /** @type {{ fontPreset: 'serif'|'sans'|'system', fontSize: number, lineHeight: number } | null} */
  let readingPendingSettings = null;
  let readingDirty = false;

  function setHooks(nextHooks) {
    hooks = { ...hooks, ...nextHooks };
  }

  function getReadingDomRefs() {
    const tab = document.getElementById('settingsTabReading');
    const content = document.getElementById('readingSettingsContent');
    const fontPreset = document.getElementById('readingFontPreset');
    const fontSize = document.getElementById('readingFontSize');
    const fontSizeValue = document.getElementById('readingFontSizeValue');
    const lineHeight = document.getElementById('readingLineHeight');
    const lineHeightValue = document.getElementById('readingLineHeightValue');

    return { tab, content, fontPreset, fontSize, fontSizeValue, lineHeight, lineHeightValue };
  }

  function normalizeFontSize(value) {
    let next = Number(value);
    if (!Number.isFinite(next)) next = 20;
    next = Math.max(14, Math.min(28, next));
    next = Math.round(next / 2) * 2;
    return next;
  }

  function normalizeLineHeight(value) {
    let next = Number(value);
    if (!Number.isFinite(next)) next = 1.6;
    next = Math.max(1.4, Math.min(2.0, next));
    next = Math.round(next * 10) / 10;
    return next;
  }

  function readingFormToSettings() {
    const refs = getReadingDomRefs();
    const fontPresetRaw = refs.fontPreset?.value;
    const fontPreset = fontPresetRaw === 'sans' || fontPresetRaw === 'system' ? fontPresetRaw : 'serif';
    const fontSize = normalizeFontSize(refs.fontSize?.value);
    const lineHeight = normalizeLineHeight(refs.lineHeight?.value);
    return { fontPreset, fontSize, lineHeight };
  }

  function updateReadingUI(settings) {
    const refs = getReadingDomRefs();
    if (refs.fontPreset) refs.fontPreset.value = settings.fontPreset;
    if (refs.fontSize) refs.fontSize.value = String(settings.fontSize);
    if (refs.lineHeight) refs.lineHeight.value = String(settings.lineHeight);

    if (refs.fontSizeValue) refs.fontSizeValue.textContent = `${settings.fontSize}px`;
    if (refs.lineHeightValue) refs.lineHeightValue.textContent = settings.lineHeight.toFixed(1);
  }

  function loadReadingSettingsToForm() {
    const refs = getReadingDomRefs();
    if (!refs.content) return;

    const settings = getReadingSettings();
    readingBaselineSettings = settings;
    readingPendingSettings = { ...settings };
    readingDirty = false;
    updateReadingUI(settings);

    // Ensure the current persisted settings are applied when opening the modal.
    applyReadingSettings(settings);
  }

  function handleReadingInput() {
    const next = readingFormToSettings();
    readingPendingSettings = next;
    readingDirty = true;

    updateReadingUI(next);
    applyReadingSettings(next);
  }

  function revertPendingReadingSettings() {
    if (!readingDirty) return;
    if (!readingBaselineSettings) readingBaselineSettings = getReadingSettings();
    applyReadingSettings(readingBaselineSettings);
    readingDirty = false;
  }

	  function updateSyncUI(syncStatus) {
	    const state = syncStatus?.state || 'offline';
	    const lastSyncAt = syncStatus?.lastSyncAt || null;
	    const error = syncStatus?.error || null;

    let label = 'Offline';
	    if (state === 'syncing') label = 'Syncing…';
	    if (state === 'synced') label = lastSyncAt ? 'Synced' : 'Synced';

	    const indicators = [elements.syncIndicator, elements.syncIndicatorShelf].filter(Boolean);
	    indicators.forEach((el) => {
	      el.dataset.state = state;
	      el.title = error ? `Sync error: ${error}` : `Sync status: ${label}`;
	      const labelEl = el.querySelector?.('.sync-label') || el.querySelector?.('.mobile-hide');
	      if (labelEl) {
	        labelEl.textContent = label;
	      } else {
	        el.textContent = label;
	      }
	    });
	    if (elements.syncStatusText) {
	      elements.syncStatusText.textContent = error ? `Offline (${error})` : label;
	    }
	  }

  function loadSettingsToForm(getSyncStatus) {
    const settings = getSettings();
    elements.apiUrl.value = settings.apiUrl || '';
    elements.apiKey.value = settings.apiKey || '';
    elements.languageSelect.value = settings.language || '中文';
    elements.readingLevelSelect.value = settings.readingLevel || 'intermediate';
    elements.backendUrl.value = settings.backendUrl || '';
    elements.syncEnabledToggle.checked = !!settings.syncEnabled;

    const fsrsSettings = getFsrsSettings();
    const reviewMode = fsrsSettings?.reviewMode === 'mixed' ? 'mixed' : 'grouped';
    if (elements.fsrsReviewModeGrouped) elements.fsrsReviewModeGrouped.checked = reviewMode === 'grouped';
    if (elements.fsrsReviewModeMixed) elements.fsrsReviewModeMixed.checked = reviewMode === 'mixed';
    if (elements.fsrsRequestRetention) {
      const value = Number(fsrsSettings?.requestRetention);
      const clamped = Number.isFinite(value) ? Math.max(0.7, Math.min(0.97, value)) : 0.9;
      elements.fsrsRequestRetention.value = clamped.toFixed(2);
      if (elements.fsrsRequestRetentionValue) elements.fsrsRequestRetentionValue.textContent = clamped.toFixed(2);
    }

    const isAutoStudy = getAutoStudyEnabled();
    if (elements.autoStudyToggle) elements.autoStudyToggle.checked = isAutoStudy;
    if (elements.mobileAutoStudyToggle) elements.mobileAutoStudyToggle.checked = isAutoStudy;

    if (settings.model) {
      const existing = Array.from(elements.modelSelect.options).find((opt) => opt.value === settings.model);
      if (!existing) {
        const option = document.createElement('option');
        option.value = settings.model;
        option.textContent = settings.model;
        option.selected = true;
        elements.modelSelect.appendChild(option);
      } else {
        existing.selected = true;
      }
    }

    loadReadingSettingsToForm();
    updateSyncUI(getSyncStatus());
  }

  function open(getSyncStatus) {
    loadSettingsToForm(getSyncStatus);
    settingsModalManager.open();
  }

  function close() {
    settingsModalManager.close();
  }

  async function handleFetchModels() {
    const apiUrl = elements.apiUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();

    if (!apiUrl || !apiKey) {
      showNotification('Please enter API URL and API Key first', 'error');
      return;
    }

    elements.fetchModelsBtn.disabled = true;
    elements.fetchModelsBtn.textContent = 'Fetching...';

    try {
      const models = await fetchModels(apiUrl, apiKey);
      elements.modelSelect.innerHTML = '<option value="">Select a model...</option>';
      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id || model.name || model;
        option.textContent = model.id || model.name || model;
        elements.modelSelect.appendChild(option);
      });
      showNotification(`Found ${models.length} models`, 'success');
    } catch (error) {
      showNotification(`Failed to fetch models: ${error.message}`, 'error');
    } finally {
      elements.fetchModelsBtn.disabled = false;
      elements.fetchModelsBtn.textContent = 'Fetch Models';
    }
  }

  function switchSettingsTab(tabName) {
    const readingRefs = getReadingDomRefs();
    elements.settingsTabAI.classList.toggle('active', tabName === 'ai');
    readingRefs.tab?.classList.toggle('active', tabName === 'reading');
    elements.settingsTabSync.classList.toggle('active', tabName === 'sync');
    elements.settingsTabFSRS?.classList.toggle('active', tabName === 'fsrs');

    elements.aiSettingsContent.classList.toggle('active', tabName === 'ai');
    readingRefs.content?.classList.toggle('active', tabName === 'reading');
    elements.syncSettingsContent.classList.toggle('active', tabName === 'sync');
    elements.fsrsSettingsContent?.classList.toggle('active', tabName === 'fsrs');
  }

  function handleAutoStudyToggle(e) {
    const enabled = Boolean(e.target.checked);
    
    // Sync UI
    if (elements.autoStudyToggle) elements.autoStudyToggle.checked = enabled;
    if (elements.mobileAutoStudyToggle) elements.mobileAutoStudyToggle.checked = enabled;

    setAutoStudyEnabled(enabled);
    saveAutoStudyPreference(enabled);

    showNotification(enabled ? '自动加入学习已开启' : '自动加入学习已关闭', 'success');
  }

  function handleSave() {
    const readingSettingsToSave = readingPendingSettings || readingFormToSettings();
    if (!saveReadingSettings(readingSettingsToSave)) {
      showNotification('保存阅读设置失败', 'error');
      return;
    }
    applyReadingSettings(readingSettingsToSave);
    readingBaselineSettings = readingSettingsToSave;
    readingDirty = false;

    const settings = {
      apiUrl: elements.apiUrl.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      model: elements.modelSelect.value,
      language: elements.languageSelect.value,
      readingLevel: elements.readingLevelSelect.value,
      backendUrl: elements.backendUrl.value.trim(),
      syncEnabled: !!elements.syncEnabledToggle.checked
    };

    if (!saveSettings(settings)) {
      showNotification('保存设置失败', 'error');
      return;
    }

    const fsrsReviewMode = elements.fsrsReviewModeMixed?.checked ? 'mixed' : 'grouped';
    const requestRetention = Number(elements.fsrsRequestRetention?.value);
    saveFsrsSettings({ reviewMode: fsrsReviewMode, requestRetention });

    showNotification('设置已保存', 'success');
    close();
    hooks.onAfterSave(settings);
  }

  function handleEscape() {
    revertPendingReadingSettings();
    settingsModalManager.close();
  }

  function openTab(tabName, getSyncStatus) {
    loadSettingsToForm(getSyncStatus);
    switchSettingsTab(tabName);
    settingsModalManager.open();
  }

  function init({ getSyncStatus, onAfterSave, onSyncNow }) {
    setHooks({ onAfterSave });

    const isAutoStudy = getAutoStudyEnabled();
    if (elements.autoStudyToggle) elements.autoStudyToggle.checked = isAutoStudy;
    if (elements.mobileAutoStudyToggle) elements.mobileAutoStudyToggle.checked = isAutoStudy;

    elements.settingsBtn.addEventListener('click', () => open(getSyncStatus));
    elements.typographyBtn?.addEventListener('click', () => openTab('reading', getSyncStatus));
    elements.saveSettingsBtn.addEventListener('click', handleSave);
    elements.fetchModelsBtn.addEventListener('click', handleFetchModels);

    elements.toggleKeyBtn.addEventListener('click', () => {
      const type = elements.apiKey.type === 'password' ? 'text' : 'password';
      elements.apiKey.type = type;
      elements.toggleKeyBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });

    elements.settingsTabAI.addEventListener('click', () => switchSettingsTab('ai'));
    const readingRefs = getReadingDomRefs();
    readingRefs.tab?.addEventListener('click', () => switchSettingsTab('reading'));
    elements.settingsTabSync.addEventListener('click', () => switchSettingsTab('sync'));
    elements.settingsTabFSRS?.addEventListener('click', () => switchSettingsTab('fsrs'));

    readingRefs.fontPreset?.addEventListener('change', handleReadingInput);
    readingRefs.fontSize?.addEventListener('input', handleReadingInput);
    readingRefs.lineHeight?.addEventListener('input', handleReadingInput);

    // Revert unsaved reading settings when dismissing the modal.
    elements.closeSettingsBtn?.addEventListener('click', () => revertPendingReadingSettings(), true);
    elements.cancelSettingsBtn?.addEventListener('click', () => revertPendingReadingSettings(), true);
    elements.settingsModal?.addEventListener(
      'click',
      (event) => {
        if (event.target === elements.settingsModal) revertPendingReadingSettings();
      },
      true
    );

    elements.syncNowBtn.addEventListener('click', onSyncNow);

    elements.autoStudyToggle?.addEventListener('change', handleAutoStudyToggle);
    elements.mobileAutoStudyToggle?.addEventListener('change', handleAutoStudyToggle);

    elements.fsrsRequestRetention?.addEventListener('input', () => {
      const value = Number(elements.fsrsRequestRetention.value);
      if (elements.fsrsRequestRetentionValue) {
        elements.fsrsRequestRetentionValue.textContent = Number.isFinite(value) ? value.toFixed(2) : '0.90';
      }
    });
  }

  return {
    init,
    open,
    openTab,
    close,
    updateSyncUI,
    handleEscape
  };
}
