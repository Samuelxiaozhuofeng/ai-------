import { ModalManager } from './modal-manager.js';

function ensureStyles() {
  if (document.getElementById('processingModalStyles')) return;
  const style = document.createElement('style');
  style.id = 'processingModalStyles';
  style.textContent = `
    .processing-modal {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    .processing-modal.open { display: flex; }
    .processing-modal-card {
      width: min(520px, calc(100vw - 32px));
      background: #111827;
      color: #f9fafb;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
    }
    .processing-modal-title { font-size: 16px; font-weight: 700; margin: 0 0 8px; }
    .processing-modal-sub { font-size: 13px; opacity: 0.9; margin: 0 0 12px; }
    .processing-modal-bar {
      height: 10px;
      background: rgba(255,255,255,0.08);
      border-radius: 999px;
      overflow: hidden;
      margin: 10px 0 8px;
    }
    .processing-modal-bar > div {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #6366f1, #22c55e);
      transition: width 200ms ease;
    }
    .processing-modal-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 12px;
    }
    .processing-modal-btn {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      color: #f9fafb;
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
    }
    .processing-modal-btn.primary {
      background: #6366f1;
      border-color: #6366f1;
    }
    .processing-modal-btn.danger {
      background: #ef4444;
      border-color: #ef4444;
    }
    .processing-modal-error { color: #fecaca; font-size: 12px; margin-top: 8px; white-space: pre-wrap; }
  `;
  document.head.appendChild(style);
}

function ensureModalEl() {
  let el = document.getElementById('processingModal');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'processingModal';
  el.className = 'processing-modal';
  el.innerHTML = `
    <div class="processing-modal-card" role="dialog" aria-modal="true">
      <h3 class="processing-modal-title">处理中…</h3>
      <p class="processing-modal-sub"></p>
      <div class="processing-modal-bar"><div></div></div>
      <div class="processing-modal-error" style="display:none;"></div>
      <div class="processing-modal-row">
        <button class="processing-modal-btn" data-action="close" style="display:none;">关闭</button>
        <button class="processing-modal-btn" data-action="retry" style="display:none;">重试</button>
        <button class="processing-modal-btn danger" data-action="cancel">取消</button>
        <button class="processing-modal-btn primary" data-action="wait">后台继续</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

export function createProcessingModal() {
  ensureStyles();
  const el = ensureModalEl();
  const manager = new ModalManager(el, { closeOnOverlayClick: false });

  const titleEl = el.querySelector('.processing-modal-title');
  const subEl = el.querySelector('.processing-modal-sub');
  const fillEl = el.querySelector('.processing-modal-bar > div');
  const errorEl = el.querySelector('.processing-modal-error');
  const btnClose = el.querySelector('[data-action="close"]');
  const btnRetry = el.querySelector('[data-action="retry"]');
  const btnCancel = el.querySelector('[data-action="cancel"]');
  const btnWait = el.querySelector('[data-action="wait"]');

  /** @type {null | ((action: string) => void)} */
  let onAction = null;

  el.addEventListener('click', (event) => {
    const action = event.target?.closest?.('[data-action]')?.dataset?.action || '';
    if (!action) return;
    try {
      onAction?.(action);
    } catch {
      // ignore
    }
  });

  function setButtons({ canCancel, canRetry, canClose }) {
    if (btnCancel) btnCancel.style.display = canCancel ? '' : 'none';
    if (btnRetry) btnRetry.style.display = canRetry ? '' : 'none';
    if (btnClose) btnClose.style.display = canClose ? '' : 'none';
    if (btnWait) btnWait.style.display = canClose ? 'none' : '';
  }

  return {
    open({ title, onAction: nextOnAction }) {
      onAction = typeof nextOnAction === 'function' ? nextOnAction : null;
      if (titleEl) titleEl.textContent = title || '处理中…';
      if (subEl) subEl.textContent = '';
      if (fillEl) fillEl.style.width = '0%';
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
      }
      setButtons({ canCancel: true, canRetry: false, canClose: false });
      manager.open();
    },
    close() {
      manager.close();
      onAction = null;
    },
    update({ status, progress, stage, error }) {
      const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
      if (fillEl) fillEl.style.width = `${safeProgress}%`;
      if (subEl) {
        const parts = [];
        if (status) parts.push(String(status));
        if (stage) parts.push(String(stage));
        parts.push(`${safeProgress}%`);
        subEl.textContent = parts.join(' · ');
      }
      if (errorEl) {
        if (error) {
          errorEl.textContent = String(error);
          errorEl.style.display = '';
        } else {
          errorEl.textContent = '';
          errorEl.style.display = 'none';
        }
      }

      const st = String(status || '');
      if (st === 'error' || st === 'cancelled') {
        setButtons({ canCancel: false, canRetry: true, canClose: true });
      } else if (st === 'done') {
        setButtons({ canCancel: false, canRetry: false, canClose: true });
      } else {
        setButtons({ canCancel: true, canRetry: false, canClose: false });
      }
    }
  };
}

