/**
 * Notifications
 * Small helper for toast-like messages.
 *
 * NOTE: Keeps existing behavior from legacy `app.js`.
 * @param {string} message
 * @param {'info'|'success'|'error'} [type]
 */
export function showNotification(message, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} ${message}`);

  const indicator = document.createElement('div');
  indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6366f1'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
  indicator.textContent = message;
  document.body.appendChild(indicator);

  setTimeout(() => {
    indicator.style.opacity = '0';
    indicator.style.transition = 'opacity 0.3s';
    setTimeout(() => indicator.remove(), 300);
  }, 3000);
}

