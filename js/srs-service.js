/**
 * SRS Service (FSRS)
 * Wraps ts-fsrs scheduling and persists global card state in IndexedDB.
 */

import { normalizeWord } from './word-status.js';
import { getFsrsSettings } from './storage.js';
import {
  countDueCards,
  countDueCardsByLanguage,
  countGlobalVocabByStatus,
  countGlobalVocabByStatusAndLanguage,
  deleteGlobalVocabItem,
  getGlobalVocabItem,
  listDueCards,
  listDueCardsByLanguage,
  listGlobalVocab,
  upsertGlobalVocabItem
} from './db.js';

const TS_FSRS_URL = 'https://esm.sh/ts-fsrs@5';

/** @type {Promise<any>|null} */
let tsFsrsPromise = null;

async function loadTsFsrs() {
  if (!tsFsrsPromise) {
    tsFsrsPromise = import(TS_FSRS_URL);
  }
  return tsFsrsPromise;
}

function getRatingConstants(mod) {
  if (mod?.Rating) return mod.Rating;
  return { Again: 1, Hard: 2, Good: 3, Easy: 4 };
}

function createFallbackEmptyCard(now) {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: now
  };
}

function toDate(value, fallback = null) {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function globalItemToFsrsCard(item, now) {
  const due = toDate(item?.due, now);
  const lastReview = toDate(item?.last_review, null);
  return {
    due,
    stability: typeof item?.stability === 'number' ? item.stability : 0,
    difficulty: typeof item?.difficulty === 'number' ? item.difficulty : 0,
    elapsed_days: typeof item?.elapsed_days === 'number' ? item.elapsed_days : 0,
    scheduled_days: typeof item?.scheduled_days === 'number' ? item.scheduled_days : 0,
    reps: typeof item?.reps === 'number' ? item.reps : 0,
    lapses: typeof item?.lapses === 'number' ? item.lapses : 0,
    state: typeof item?.state === 'number' ? item.state : 0,
    ...(lastReview ? { last_review: lastReview } : {})
  };
}

function fsrsCardToFields(card) {
  return {
    due: card?.due instanceof Date ? card.due.toISOString() : new Date().toISOString(),
    stability: typeof card?.stability === 'number' ? card.stability : 0,
    difficulty: typeof card?.difficulty === 'number' ? card.difficulty : 0,
    elapsed_days: typeof card?.elapsed_days === 'number' ? card.elapsed_days : 0,
    scheduled_days: typeof card?.scheduled_days === 'number' ? card.scheduled_days : 0,
    reps: typeof card?.reps === 'number' ? card.reps : 0,
    lapses: typeof card?.lapses === 'number' ? card.lapses : 0,
    state: typeof card?.state === 'number' ? card.state : 0,
    last_review: card?.last_review instanceof Date ? card.last_review.toISOString() : null
  };
}

function getRequestRetention() {
  const settings = getFsrsSettings();
  const value = Number(settings?.requestRetention);
  if (!Number.isFinite(value)) return 0.9;
  return Math.max(0.7, Math.min(0.97, value));
}

function getScheduler(mod, requestRetention = 0.9) {
  if (typeof mod?.FSRS === 'function') {
    const instance = new mod.FSRS();
    if (typeof instance?.repeat === 'function') return instance;
  }

  if (typeof mod?.fsrs === 'function') {
    const config = { request_retention: requestRetention, requestRetention };
    const params = typeof mod?.generatorParameters === 'function' ? mod.generatorParameters(config) : config;
    const scheduler = mod.fsrs(params);
    if (typeof scheduler?.repeat === 'function') return scheduler;
  }

  throw new Error('FSRS library unavailable');
}

function readRepeatOutcome(repeatResult, ratingValue) {
  if (!repeatResult) return null;
  if (Array.isArray(repeatResult)) {
    return repeatResult[ratingValue] || repeatResult[ratingValue - 1] || null;
  }
  return repeatResult[ratingValue] || repeatResult[String(ratingValue)] || null;
}

function formatIntervalDays(days, due, now) {
  if (typeof days === 'number' && Number.isFinite(days)) {
    if (days < 1) return '<1d';
    if (days === 1) return '1d';
    if (days < 7) return `${Math.round(days)}d`;
    const weeks = Math.round(days / 7);
    return `${weeks}w`;
  }

  if (due instanceof Date && now instanceof Date) {
    const ms = Math.max(0, due.getTime() - now.getTime());
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return '<1h';
    if (hours < 24) return `${Math.round(hours)}h`;
    const d = hours / 24;
    if (d < 7) return `${Math.round(d)}d`;
    const w = d / 7;
    return `${Math.round(w)}w`;
  }

  return '';
}

function normalizeAnalysisFields(analysis) {
  if (!analysis) return {};
  return {
    meaning: analysis.meaning || null,
    usage: analysis.usage || null,
    contextualMeaning: analysis.contextualMeaning || null
  };
}

/**
 * Ensure a global vocabulary item has an FSRS card shape.
 * @param {any} item
 * @returns {Promise<any>}
 */
export async function ensureFsrsCardFields(item) {
  if (!item) return null;
  const hasDue = typeof item?.due === 'string' && item.due;
  const seemsUninitialized = hasDue
    && item?.reps === 0
    && item?.lapses === 0
    && item?.stability === 0
    && item?.difficulty === 0
    && item?.state === 0
    && item?.elapsed_days === 0
    && item?.scheduled_days === 0;
  if (hasDue && !seemsUninitialized) return item;

  const now = new Date();
  try {
    const mod = await loadTsFsrs();
    const createEmpty = typeof mod?.createEmptyCard === 'function' ? mod.createEmptyCard : null;
    const emptyCard = createEmpty ? createEmpty(now) : createFallbackEmptyCard(now);
    const fields = fsrsCardToFields(emptyCard);

    if (hasDue) {
      const existingDue = new Date(item.due);
      if (!Number.isNaN(existingDue.getTime()) && existingDue.getTime() <= now.getTime()) {
        fields.due = item.due;
      }
    }

    return { ...item, ...fields };
  } catch {
    const fields = fsrsCardToFields(createFallbackEmptyCard(now));

    if (hasDue) {
      const existingDue = new Date(item.due);
      if (!Number.isNaN(existingDue.getTime()) && existingDue.getTime() <= now.getTime()) {
        fields.due = item.due;
      }
    }

    return { ...item, ...fields };
  }
}

/**
 * Add/ensure a learning card in the global vocabulary store.
 * @param {{language:string, normalizedWord:string, displayWord?:string, bookId?:string|null, analysis?:any|null, contextSentence?:string|null}} params
 * @returns {Promise<any>}
 */
export async function ensureGlobalLearningCard(params) {
  const language = typeof params?.language === 'string' ? params.language.trim() : '';
  if (!language) throw new Error('Invalid language');
  const normalized = normalizeWord(params?.normalizedWord || '');
  if (!normalized) throw new Error('Invalid word');

  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await getGlobalVocabItem(normalized, language);
  const existingSourceBooks = Array.isArray(existing?.sourceBooks) ? existing.sourceBooks : [];
  const nextSourceBooks = params?.bookId && !existingSourceBooks.includes(params.bookId)
    ? [...existingSourceBooks, params.bookId]
    : existingSourceBooks;

  const analysisFields = normalizeAnalysisFields(params?.analysis);
  const merged = await ensureFsrsCardFields({
    ...(existing || {}),
    language,
    normalizedWord: normalized,
    displayWord: existing?.displayWord || params?.displayWord || normalized,
    status: 'learning',
    sourceBooks: nextSourceBooks,
    meaning: existing?.meaning || analysisFields.meaning,
    usage: existing?.usage || analysisFields.usage,
    contextualMeaning: existing?.contextualMeaning || analysisFields.contextualMeaning,
    contextSentence: existing?.contextSentence || params?.contextSentence || null,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso
  });

  if (!existing) {
    const dueDate = toDate(merged?.due, null);
    if (!dueDate || dueDate.getTime() > now.getTime()) {
      merged.due = nowIso;
      merged.scheduled_days = 0;
      merged.elapsed_days = 0;
      merged.last_review = merged.last_review || nowIso;
    }
  }

  return upsertGlobalVocabItem(merged);
}

/**
 * Remove a book from a global learning card; delete card if no sources remain.
 * @param {string} normalizedWord
 * @param {string} bookId
 * @param {string|null} [language]
 * @returns {Promise<void>}
 */
export async function removeBookFromGlobalLearningCard(normalizedWord, bookId, language = null) {
  const normalized = normalizeWord(normalizedWord || '');
  if (!normalized || !bookId) return;
  const lang = typeof language === 'string' ? language.trim() : '';
  const existing = lang ? await getGlobalVocabItem(normalized, lang) : await getGlobalVocabItem(normalized);
  if (!existing) return;

  const sourceBooks = Array.isArray(existing.sourceBooks) ? existing.sourceBooks : [];
  const nextSourceBooks = sourceBooks.filter((id) => id !== bookId);
  if (nextSourceBooks.length === 0) {
    await deleteGlobalVocabItem(normalized, lang || null);
    return;
  }

  await upsertGlobalVocabItem({
    ...existing,
    sourceBooks: nextSourceBooks,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update stored analysis for a global learning card (no-op if card doesn't exist).
 * @param {string} normalizedWord
 * @param {any} analysis
 * @param {string|null} contextSentence
 * @param {string|null} displayWord
 * @param {string|null} [language]
 * @returns {Promise<any|null>}
 */
export async function upsertGlobalAnalysis(normalizedWord, analysis, contextSentence = null, displayWord = null, language = null) {
  const normalized = normalizeWord(normalizedWord || '');
  if (!normalized) return null;
  const lang = typeof language === 'string' ? language.trim() : '';
  const existing = lang ? await getGlobalVocabItem(normalized, lang) : await getGlobalVocabItem(normalized);
  if (!existing) return null;

  const analysisFields = normalizeAnalysisFields(analysis);
  return upsertGlobalVocabItem({
    ...existing,
    displayWord: existing.displayWord || displayWord || normalized,
    meaning: analysisFields.meaning || existing.meaning || null,
    usage: analysisFields.usage || existing.usage || null,
    contextualMeaning: analysisFields.contextualMeaning || existing.contextualMeaning || null,
    contextSentence: existing.contextSentence || contextSentence || null,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get due cards for review.
 * @param {Date} [now]
 * @returns {Promise<Array<any>>}
 */
export async function getDueCards(now = new Date(), language = null) {
  const due = language ? await listDueCardsByLanguage(now, language) : await listDueCards(now);
  if (!due.length) return [];

  const hydrated = await Promise.all(due.map((it) => ensureFsrsCardFields(it)));
  const nowIso = now.toISOString();
  return hydrated
    .filter((it) => it?.status === 'learning' && typeof it?.due === 'string' && it.due <= nowIso)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
}

/**
 * Compute review stats (due/new/total).
 * @param {Date} [now]
 * @returns {Promise<{due:number,new:number,total:number}>}
 */
export async function getReviewStats(now = new Date(), language = null) {
  const [due, total, all] = await Promise.all([
    language ? countDueCardsByLanguage(now, language) : countDueCards(now),
    language ? countGlobalVocabByStatusAndLanguage('learning', language) : countGlobalVocabByStatus('learning'),
    listGlobalVocab()
  ]);
  const filtered = language ? (all || []).filter((it) => it?.language === language) : (all || []);
  const newCount = filtered.filter((it) => it?.status === 'learning' && (it?.state === 0 || it?.reps === 0)).length;
  return { due, new: newCount, total };
}

/**
 * Preview next intervals (Again/Hard/Good/Easy) for a card.
 * @param {any} item
 * @param {Date} [now]
 * @returns {Promise<{again:string,hard:string,good:string,easy:string}>}
 */
export async function previewNextIntervals(item, now = new Date()) {
  const normalizedItem = await ensureFsrsCardFields(item);
  if (!normalizedItem) return { again: '', hard: '', good: '', easy: '' };

  try {
    const mod = await loadTsFsrs();
    const Rating = getRatingConstants(mod);
    const scheduler = getScheduler(mod, getRequestRetention());
    const card = globalItemToFsrsCard(normalizedItem, now);
    const result = scheduler.repeat(card, now);

    const againOutcome = readRepeatOutcome(result, Rating.Again);
    const hardOutcome = readRepeatOutcome(result, Rating.Hard);
    const goodOutcome = readRepeatOutcome(result, Rating.Good);
    const easyOutcome = readRepeatOutcome(result, Rating.Easy);

    const againCard = againOutcome?.card || againOutcome;
    const hardCard = hardOutcome?.card || hardOutcome;
    const goodCard = goodOutcome?.card || goodOutcome;
    const easyCard = easyOutcome?.card || easyOutcome;

    return {
      again: formatIntervalDays(againCard?.scheduled_days, againCard?.due, now),
      hard: formatIntervalDays(hardCard?.scheduled_days, hardCard?.due, now),
      good: formatIntervalDays(goodCard?.scheduled_days, goodCard?.due, now),
      easy: formatIntervalDays(easyCard?.scheduled_days, easyCard?.due, now)
    };
  } catch {
    return { again: '', hard: '', good: '', easy: '' };
  }
}

/**
 * Review a card and persist the updated schedule.
 * @param {any} item
 * @param {'again'|'hard'|'good'|'easy'} rating
 * @param {Date} [now]
 * @returns {Promise<any>}
 */
export async function reviewCard(item, rating, now = new Date()) {
  const normalizedItem = await ensureFsrsCardFields(item);
  if (!normalizedItem) throw new Error('Card not found');

  const mod = await loadTsFsrs();
  const Rating = getRatingConstants(mod);
  const scheduler = getScheduler(mod, getRequestRetention());

  const ratingValue =
    rating === 'again' ? Rating.Again :
      rating === 'hard' ? Rating.Hard :
        rating === 'easy' ? Rating.Easy :
          Rating.Good;

  const card = globalItemToFsrsCard(normalizedItem, now);
  const result = scheduler.repeat(card, now);
  const outcome = readRepeatOutcome(result, ratingValue);
  const nextCard = outcome?.card || outcome;
  if (!nextCard) throw new Error('Invalid FSRS result');

  const updated = await upsertGlobalVocabItem({
    ...normalizedItem,
    ...fsrsCardToFields(nextCard),
    updatedAt: now.toISOString()
  });

  return updated;
}
