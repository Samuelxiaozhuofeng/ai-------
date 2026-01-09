import { getAnkiSettings } from '../storage.js';

let isAutoStudyEnabled = false;

export function initAutoStudyEnabled() {
  const ankiSettings = getAnkiSettings();
  isAutoStudyEnabled = ankiSettings.autoAddToStudy ?? ankiSettings.autoAddToAnki ?? false;
  return isAutoStudyEnabled;
}

export function getAutoStudyEnabled() {
  return isAutoStudyEnabled;
}

/**
 * @param {boolean} value
 */
export function setAutoStudyEnabled(value) {
  isAutoStudyEnabled = Boolean(value);
  return isAutoStudyEnabled;
}

