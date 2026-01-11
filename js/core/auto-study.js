import { getAutoStudyPreference } from '../storage.js';

let isAutoStudyEnabled = false;

export function initAutoStudyEnabled() {
  isAutoStudyEnabled = getAutoStudyPreference();
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
