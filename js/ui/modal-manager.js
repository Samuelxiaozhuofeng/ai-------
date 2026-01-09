/**
 * ModalManager
 * Handles consistent open/close behavior for overlay-style modals.
 */

export class ModalManager {
  /**
   * @param {HTMLElement|null} modalEl
   * @param {{
   *   openClass?: string,
   *   closeOnOverlayClick?: boolean,
   *   focusTarget?: HTMLElement|null
   * }} [options]
   */
  constructor(modalEl, options = {}) {
    this.modalEl = modalEl || null;
    this.openClass = options.openClass || 'open';
    this.closeOnOverlayClick = options.closeOnOverlayClick ?? true;
    this.defaultFocusTarget = options.focusTarget || null;

    /** @type {Set<HTMLElement>} */
    this.closeButtons = new Set();

    this._onOverlayClick = (event) => {
      if (!this.modalEl || !this.closeOnOverlayClick) return;
      if (event.target === this.modalEl) this.close();
    };

    if (this.modalEl) {
      this.modalEl.addEventListener('click', this._onOverlayClick);
    }
  }

  /**
   * @param {{focusTarget?: HTMLElement|null}} [options]
   */
  open(options = {}) {
    if (!this.modalEl) return;
    this.modalEl.classList.add(this.openClass);
    const focusTarget = options.focusTarget ?? this.defaultFocusTarget;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      queueMicrotask(() => {
        try {
          focusTarget.focus();
          if (typeof focusTarget.select === 'function') focusTarget.select();
        } catch {
          // ignore
        }
      });
    }
  }

  close() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove(this.openClass);
  }

  isOpen() {
    if (!this.modalEl) return false;
    return this.modalEl.classList.contains(this.openClass);
  }

  /**
   * Registers a close button that closes the modal on click.
   * @param {HTMLElement|null} buttonEl
   */
  registerCloseButton(buttonEl) {
    if (!this.modalEl || !buttonEl) return;
    if (this.closeButtons.has(buttonEl)) return;
    this.closeButtons.add(buttonEl);
    buttonEl.addEventListener('click', () => this.close());
  }

  /**
   * Escape handler meant to be called from a shared keydown listener.
   * @returns {boolean} true if it closed an open modal
   */
  handleEscape() {
    if (!this.isOpen()) return false;
    this.close();
    return true;
  }
}

/**
 * Creates a Promise-based "choose one option" modal helper.
 * Caller controls what values mean (e.g. language codes).
 *
 * @param {{
 *   manager: ModalManager,
 *   buttonsRoot: HTMLElement|null,
 *   matchSelector: string,
 *   getValue: (el: HTMLElement) => string|null
 * }} options
 */
export function createAsyncChoiceModal(options) {
  const manager = options.manager;
  const buttonsRoot = options.buttonsRoot;
  const matchSelector = options.matchSelector;
  const getValue = options.getValue;

  /** @type {((value: string|null) => void) | null} */
  let pendingResolve = null;

  function close(value) {
    manager.close();
    const resolve = pendingResolve;
    pendingResolve = null;
    try {
      resolve?.(value ?? null);
    } catch {
      // ignore
    }
  }

  if (buttonsRoot) {
    buttonsRoot.addEventListener('click', (event) => {
      const target = event.target?.closest?.(matchSelector);
      if (!target) return;
      close(getValue(target));
    });
  }

  return {
    /**
     * @returns {Promise<string|null>}
     */
    prompt() {
      if (pendingResolve) {
        try {
          pendingResolve(null);
        } catch {
          // ignore
        }
        pendingResolve = null;
      }

      manager.open();
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
    /**
     * @param {string|null} value
     */
    close
  };
}

