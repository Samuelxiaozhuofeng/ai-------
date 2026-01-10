import {
  getAnkiSettings,
  getFsrsSettings,
  getSettings,
  saveAnkiSettings,
  saveFsrsSettings,
  saveSettings
} from '../storage.js';
import { fetchModels } from '../ai-service.js';
import { getDeckNames, getModelFieldNames, getModelNames } from '../anki-service.js';
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

  function setHooks(nextHooks) {
    hooks = { ...hooks, ...nextHooks };
  }

  function updateSyncUI(syncStatus) {
    const state = syncStatus?.state || 'offline';
    const lastSyncAt = syncStatus?.lastSyncAt || null;
    const error = syncStatus?.error || null;

    let label = 'Offline';
    if (state === 'syncing') label = 'Syncing…';
    if (state === 'synced') label = lastSyncAt ? 'Synced' : 'Synced';

    if (elements.syncIndicator) {
      elements.syncIndicator.textContent = label;
      elements.syncIndicator.dataset.state = state;
      elements.syncIndicator.title = error ? `Sync error: ${error}` : `Sync status: ${label}`;
    }
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

    const ankiSettings = getAnkiSettings();
    const isAutoStudy = Boolean(ankiSettings.autoAddToStudy ?? ankiSettings.autoAddToAnki ?? false);
    elements.autoAnkiToggle.checked = isAutoStudy;
    if (elements.mobileAutoAnkiToggle) elements.mobileAutoAnkiToggle.checked = isAutoStudy;

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
    elements.settingsTabAI.classList.toggle('active', tabName === 'ai');
    elements.settingsTabAnki.classList.toggle('active', tabName === 'anki');
    elements.settingsTabSync.classList.toggle('active', tabName === 'sync');
    elements.settingsTabFSRS?.classList.toggle('active', tabName === 'fsrs');

    elements.aiSettingsContent.classList.toggle('active', tabName === 'ai');
    elements.ankiSettingsContent.classList.toggle('active', tabName === 'anki');
    elements.syncSettingsContent.classList.toggle('active', tabName === 'sync');
    elements.fsrsSettingsContent?.classList.toggle('active', tabName === 'fsrs');
  }

  function clearFieldSelects() {
    const fieldSelects = [
      elements.fieldWord,
      elements.fieldContext,
      elements.fieldMeaning,
      elements.fieldUsage,
      elements.fieldContextualMeaning
    ];
    fieldSelects.forEach((select) => {
      select.innerHTML = '<option value="">不映射</option>';
    });
  }

  async function loadModelFields(modelName, currentMapping = {}) {
    try {
      const fields = await getModelFieldNames(modelName);
      const fieldSelects = [
        elements.fieldWord,
        elements.fieldContext,
        elements.fieldMeaning,
        elements.fieldUsage,
        elements.fieldContextualMeaning
      ];
      const mappingKeys = ['word', 'context', 'meaning', 'usage', 'contextualMeaning'];

      fieldSelects.forEach((select, index) => {
        select.innerHTML = '<option value="">不映射</option>';
        fields.forEach((field) => {
          const option = document.createElement('option');
          option.value = field;
          option.textContent = field;
          if (currentMapping[mappingKeys[index]] === field) {
            option.selected = true;
          }
          select.appendChild(option);
        });
      });
    } catch (error) {
      console.error('Failed to load model fields:', error);
      showNotification(error.message, 'error');
    }
  }

  async function refreshAnkiOptions() {
    const ankiSettings = getAnkiSettings();

    try {
      const decks = await getDeckNames();
      elements.ankiDeckSelect.innerHTML = '<option value="">选择牌组...</option>';
      decks.forEach((deck) => {
        const option = document.createElement('option');
        option.value = deck;
        option.textContent = deck;
        if (deck === ankiSettings.deckName) option.selected = true;
        elements.ankiDeckSelect.appendChild(option);
      });

      const models = await getModelNames();
      elements.ankiModelSelect.innerHTML = '<option value="">选择笔记类型...</option>';
      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        if (model === ankiSettings.modelName) option.selected = true;
        elements.ankiModelSelect.appendChild(option);
      });

      if (ankiSettings.modelName) {
        await loadModelFields(ankiSettings.modelName, ankiSettings.fieldMapping);
      }
    } catch (error) {
      console.error('Failed to refresh Anki options:', error);
      showNotification(error.message, 'error');
    }
  }

  async function handleAnkiModelChange() {
    const modelName = elements.ankiModelSelect.value;
    if (modelName) {
      await loadModelFields(modelName, {});
    } else {
      clearFieldSelects();
    }
  }

  function handleAutoStudyToggle(e) {
    const enabled = Boolean(e.target.checked);
    
    // Sync UI
    if (elements.autoAnkiToggle) elements.autoAnkiToggle.checked = enabled;
    if (elements.mobileAutoAnkiToggle) elements.mobileAutoAnkiToggle.checked = enabled;

    setAutoStudyEnabled(enabled);

    const ankiSettings = getAnkiSettings();
    ankiSettings.autoAddToStudy = enabled;
    ankiSettings.autoAddToAnki = enabled;
    saveAnkiSettings(ankiSettings);

    showNotification(enabled ? '自动加入学习已开启' : '自动加入学习已关闭', 'success');
  }

  function handleSave() {
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

    const autoStudy = getAutoStudyEnabled();
    const ankiSettings = {
      deckName: elements.ankiDeckSelect.value,
      modelName: elements.ankiModelSelect.value,
      fieldMapping: {
        word: elements.fieldWord.value,
        context: elements.fieldContext.value,
        meaning: elements.fieldMeaning.value,
        usage: elements.fieldUsage.value,
        contextualMeaning: elements.fieldContextualMeaning.value
      },
      autoAddToStudy: autoStudy,
      autoAddToAnki: autoStudy
    };
    saveAnkiSettings(ankiSettings);

    showNotification('设置已保存', 'success');
    close();
    hooks.onAfterSave(settings);
  }

  function handleEscape() {
    settingsModalManager.close();
  }

  function init({ getSyncStatus, onAfterSave, onSyncNow }) {
    setHooks({ onAfterSave });

    elements.settingsBtn.addEventListener('click', () => open(getSyncStatus));
    elements.saveSettingsBtn.addEventListener('click', handleSave);
    elements.fetchModelsBtn.addEventListener('click', handleFetchModels);

    elements.toggleKeyBtn.addEventListener('click', () => {
      const type = elements.apiKey.type === 'password' ? 'text' : 'password';
      elements.apiKey.type = type;
      elements.toggleKeyBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });

    elements.settingsTabAI.addEventListener('click', () => switchSettingsTab('ai'));
    elements.settingsTabAnki.addEventListener('click', () => {
      switchSettingsTab('anki');
      void refreshAnkiOptions();
    });
    elements.settingsTabSync.addEventListener('click', () => switchSettingsTab('sync'));
    elements.settingsTabFSRS?.addEventListener('click', () => switchSettingsTab('fsrs'));

    elements.refreshAnkiBtn.addEventListener('click', () => void refreshAnkiOptions());
    elements.ankiModelSelect.addEventListener('change', handleAnkiModelChange);

    elements.syncNowBtn.addEventListener('click', onSyncNow);

    elements.autoAnkiToggle.addEventListener('change', handleAutoStudyToggle);
    if (elements.mobileAutoAnkiToggle) {
      elements.mobileAutoAnkiToggle.addEventListener('change', handleAutoStudyToggle);
    }

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
    close,
    updateSyncUI,
    handleEscape
  };
}

