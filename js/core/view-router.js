/**
 * ViewRouter
 * Centralizes show/hide logic for single-page views.
 */

export class ViewRouter {
  /**
   * @param {Record<string, HTMLElement|null|undefined>} views
   */
  constructor(views) {
    this.views = { ...views };
    this.currentView = null;
  }

  /**
   * @param {string} viewName
   * @returns {{from: string|null, to: string}}
   */
  navigate(viewName) {
    const nextEl = this.views[viewName];
    if (!nextEl) {
      throw new Error(`Unknown view: ${viewName}`);
    }

    Object.entries(this.views).forEach(([, el]) => {
      if (!el) return;
      el.style.display = 'none';
    });

    nextEl.style.display = '';
    const from = this.currentView;
    this.currentView = viewName;
    return { from, to: viewName };
  }
}

