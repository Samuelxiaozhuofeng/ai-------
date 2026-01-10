/**
 * DOM References
 * Centralizes `document.getElementById` lookups.
 */

export const elements = {
  // Views
  bookshelfView: document.getElementById('bookshelfView'),
  readerView: document.getElementById('readerView'),
  reviewView: document.getElementById('reviewView'),

  // Bookshelf
  booksContainer: document.getElementById('booksContainer'),
  emptyBookshelf: document.getElementById('emptyBookshelf'),
  importBookBtn: document.getElementById('importBookBtn'),
  importBtnEmpty: document.getElementById('importBtnEmpty'),
  gridViewBtn: document.getElementById('gridViewBtn'),
  listViewBtn: document.getElementById('listViewBtn'),
  languageTabs: document.getElementById('languageTabs'),
  languageTabEn: document.getElementById('languageTabEn'),
  languageTabEs: document.getElementById('languageTabEs'),
  languageTabJa: document.getElementById('languageTabJa'),
  reviewButtonsContainer: document.getElementById('reviewButtonsContainer'),
  reviewBtn: document.getElementById('reviewBtn'),
  themeToggleBtnShelf: document.getElementById('themeToggleBtnShelf'),
  themeIconShelf: document.getElementById('themeIconShelf'),

  // Context Menu
  bookContextMenu: document.getElementById('bookContextMenu'),
  renameBookBtn: document.getElementById('renameBookBtn'),
  deleteBookBtn: document.getElementById('deleteBookBtn'),

  // Rename Modal
  renameModal: document.getElementById('renameModal'),
  newBookTitle: document.getElementById('newBookTitle'),
  closeRenameBtn: document.getElementById('closeRenameBtn'),
  cancelRenameBtn: document.getElementById('cancelRenameBtn'),
  confirmRenameBtn: document.getElementById('confirmRenameBtn'),

  // Delete Modal
  deleteModal: document.getElementById('deleteModal'),
  deleteConfirmText: document.getElementById('deleteConfirmText'),
  closeDeleteBtn: document.getElementById('closeDeleteBtn'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

  // File input
  fileInput: document.getElementById('fileInput'),

  // Reader Header
  backToShelfBtn: document.getElementById('backToShelfBtn'),
  bookTitle: document.getElementById('bookTitle'),
  toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIcon: document.getElementById('themeIcon'),
  syncIndicator: document.getElementById('syncIndicator'),

  // Main content
  mainContent: document.querySelector('.main-content'),
  readingPanel: document.querySelector('.reading-panel'),

  // Chapters / Progress
  chapterSelectBtn: document.getElementById('chapterSelectBtn'),
  chapterInfo: document.getElementById('chapterInfo'),
  chapterProgressFill: document.getElementById('chapterProgressFill'),
  bookProgressPercent: document.getElementById('bookProgressPercent'),
  bookProgressText: document.getElementById('bookProgressText'),

  // Chapter Select Modal
  chapterSelectModal: document.getElementById('chapterSelectModal'),
  closeChapterSelectBtn: document.getElementById('closeChapterSelectBtn'),
  chapterSelectList: document.getElementById('chapterSelectList'),

  // Reading
  readingContent: document.getElementById('readingContent'),
  chapterAnalysisBtn: document.getElementById('chapterAnalysisBtn'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),
  pageIndicator: document.getElementById('pageIndicator'),

  // Vocabulary Panel
  vocabPanel: document.getElementById('vocabPanel'),
  resizeHandle: document.getElementById('resizeHandle'),

  // Tabs
  tabVocabAnalysis: document.getElementById('tabVocabAnalysis'),
  tabChapterAnalysis: document.getElementById('tabChapterAnalysis'),
  vocabAnalysisTab: document.getElementById('vocabAnalysisTab'),
  chapterAnalysisTab: document.getElementById('chapterAnalysisTab'),

  // Analysis Content
  vocabAnalysisContent: document.getElementById('vocabAnalysisContent'),
  chapterAnalysisContent: document.getElementById('chapterAnalysisContent'),

  // Settings Modal
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),

  // Settings Form
  apiUrl: document.getElementById('apiUrl'),
  apiKey: document.getElementById('apiKey'),
  toggleKeyBtn: document.getElementById('toggleKeyBtn'),
  modelSelect: document.getElementById('modelSelect'),
  fetchModelsBtn: document.getElementById('fetchModelsBtn'),
  languageSelect: document.getElementById('languageSelect'),
  readingLevelSelect: document.getElementById('readingLevelSelect'),
  backendUrl: document.getElementById('backendUrl'),
  syncEnabledToggle: document.getElementById('syncEnabledToggle'),
  syncNowBtn: document.getElementById('syncNowBtn'),
  syncStatusText: document.getElementById('syncStatusText'),

  // FSRS Settings Form
  fsrsReviewModeGrouped: document.getElementById('fsrsReviewModeGrouped'),
  fsrsReviewModeMixed: document.getElementById('fsrsReviewModeMixed'),
  fsrsRequestRetention: document.getElementById('fsrsRequestRetention'),
  fsrsRequestRetentionValue: document.getElementById('fsrsRequestRetentionValue'),

  // Settings Tabs
  settingsTabAI: document.getElementById('settingsTabAI'),
  settingsTabAnki: document.getElementById('settingsTabAnki'),
  settingsTabSync: document.getElementById('settingsTabSync'),
  settingsTabFSRS: document.getElementById('settingsTabFSRS'),
  aiSettingsContent: document.getElementById('aiSettingsContent'),
  ankiSettingsContent: document.getElementById('ankiSettingsContent'),
  syncSettingsContent: document.getElementById('syncSettingsContent'),
  fsrsSettingsContent: document.getElementById('fsrsSettingsContent'),

  // Anki Settings Form
  ankiDeckSelect: document.getElementById('ankiDeckSelect'),
  ankiModelSelect: document.getElementById('ankiModelSelect'),
  refreshAnkiBtn: document.getElementById('refreshAnkiBtn'),
  fieldWord: document.getElementById('fieldWord'),
  fieldContext: document.getElementById('fieldContext'),
  fieldMeaning: document.getElementById('fieldMeaning'),
  fieldUsage: document.getElementById('fieldUsage'),
  fieldContextualMeaning: document.getElementById('fieldContextualMeaning'),

  // Auto Anki Toggle
  autoAnkiToggle: document.getElementById('autoAnkiToggle'),
  mobileAutoAnkiToggle: document.getElementById('mobileAutoAnkiToggle'),

  // Review
  mobileReviewBtn: document.getElementById('mobileReviewBtn'),
  mobileReviewBadge: document.getElementById('mobileReviewBadge'),
  backFromReviewBtn: document.getElementById('backFromReviewBtn'),
  reviewTitle: document.getElementById('reviewTitle'),
  reviewStats: document.getElementById('reviewStats'),
  reviewEmpty: document.getElementById('reviewEmpty'),
  reviewFinishBtn: document.getElementById('reviewFinishBtn'),
  reviewSession: document.getElementById('reviewSession'),
  reviewCard: document.getElementById('reviewCard'),
  reviewWord: document.getElementById('reviewWord'),
  reviewMeaning: document.getElementById('reviewMeaning'),
  reviewUsage: document.getElementById('reviewUsage'),
  reviewContext: document.getElementById('reviewContext'),
  reviewContextualMeaning: document.getElementById('reviewContextualMeaning'),
  reviewShowAnswerBtn: document.getElementById('reviewShowAnswerBtn'),
  reviewActions: document.getElementById('reviewActions'),
  reviewHint: document.getElementById('reviewHint'),
  reviewAgainBtn: document.getElementById('reviewAgainBtn'),
  reviewHardBtn: document.getElementById('reviewHardBtn'),
  reviewGoodBtn: document.getElementById('reviewGoodBtn'),
  reviewEasyBtn: document.getElementById('reviewEasyBtn'),
  reviewAgainInterval: document.getElementById('reviewAgainInterval'),
  reviewHardInterval: document.getElementById('reviewHardInterval'),
  reviewGoodInterval: document.getElementById('reviewGoodInterval'),
  reviewEasyInterval: document.getElementById('reviewEasyInterval'),

  // Vocabulary Library
  vocabLibraryBtn: document.getElementById('vocabLibraryBtn'),
  vocabLibraryView: document.getElementById('vocabLibraryView'),
  backFromVocabLibraryBtn: document.getElementById('backFromVocabLibraryBtn'),
  startReviewFromLibraryBtn: document.getElementById('startReviewFromLibraryBtn'),
  vocabStatsGrid: document.getElementById('vocabStatsGrid'),
  statLearningCount: document.getElementById('statLearningCount'),
  statDueCount: document.getElementById('statDueCount'),
  statTotalReps: document.getElementById('statTotalReps'),
  vocabLibraryGrid: document.getElementById('vocabLibraryGrid'),
  vocabLibraryEmpty: document.getElementById('vocabLibraryEmpty'),
  vocabLibraryBackBtn: document.getElementById('vocabLibraryBackBtn'),

  // Edit Vocabulary Modal
  editVocabModal: document.getElementById('editVocabModal'),
  closeEditVocabBtn: document.getElementById('closeEditVocabBtn'),
  cancelEditVocabBtn: document.getElementById('cancelEditVocabBtn'),
  saveEditVocabBtn: document.getElementById('saveEditVocabBtn'),
  editVocabWord: document.getElementById('editVocabWord'),
  editVocabMeaning: document.getElementById('editVocabMeaning'),
  editVocabUsage: document.getElementById('editVocabUsage'),
  editVocabContext: document.getElementById('editVocabContext'),
  editVocabContextualMeaning: document.getElementById('editVocabContextualMeaning'),

  // Delete Vocabulary Modal
  deleteVocabModal: document.getElementById('deleteVocabModal'),
  closeDeleteVocabBtn: document.getElementById('closeDeleteVocabBtn'),
  cancelDeleteVocabBtn: document.getElementById('cancelDeleteVocabBtn'),
  confirmDeleteVocabBtn: document.getElementById('confirmDeleteVocabBtn'),
  deleteVocabConfirmText: document.getElementById('deleteVocabConfirmText'),

  // Import: Language Select Modal
  languageSelectModal: document.getElementById('languageSelectModal'),
  closeLanguageSelectBtn: document.getElementById('closeLanguageSelectBtn'),
  cancelLanguageSelectBtn: document.getElementById('cancelLanguageSelectBtn'),
  languageSelectButtons: document.getElementById('languageSelectButtons'),

  // Mobile Vocab Bottom Sheet
  mobileVocabOverlay: document.getElementById('mobileVocabOverlay'),
  mobileVocabSheet: document.getElementById('mobileVocabSheet'),
  mobileVocabContent: document.getElementById('mobileVocabContent')
};

