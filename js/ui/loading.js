/**
 * 统一的加载提示（仍保留控制台输出）。
 * @param {string} message
 */
export function showLoading(message) {
  console.log(`⏳ ${message}`);
}

export function hideLoading() {
  // 兼容旧调用：暂不处理全局遮罩。
}

export function showReaderLoading(message = '正在加载...') {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('readingContent');
  if (!container) return;
  container.innerHTML = `
    <div class="loading-spinner" role="status" aria-live="polite">
      <span class="loading-spinner-icon" aria-hidden="true"></span>
      <span class="loading-spinner-text">${message}</span>
    </div>
  `;
}

export function showReviewLoading(message = '正在加载...') {
  if (typeof document === 'undefined') return;
  const card = document.getElementById('reviewCard');
  if (!card) return;
  card.classList.add('is-loading');
  let loading = card.querySelector('.review-loading');
  if (!loading) {
    loading = document.createElement('div');
    loading.className = 'review-loading';
    card.appendChild(loading);
  }
  loading.textContent = message;
}

export function hideReviewLoading() {
  if (typeof document === 'undefined') return;
  const card = document.getElementById('reviewCard');
  if (!card) return;
  card.classList.remove('is-loading');
  const loading = card.querySelector('.review-loading');
  if (loading) loading.remove();
}
