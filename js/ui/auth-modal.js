import { ModalManager } from './modal-manager.js';
import { showNotification } from './notifications.js';
import { getSupabaseConfig } from '../supabase/client.js';
import { getCurrentUser, onAuthStateChange, signIn, signOut, signUp } from '../supabase/auth.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function readPassword(value) {
  return String(value || '');
}

function formatUserLabel(user) {
  const email = user?.email || '';
  if (!email) return '已登录';
  if (email.length <= 18) return email;
  return `${email.slice(0, 10)}…${email.slice(-6)}`;
}

/**
 * @param {import('./dom-refs.js').elements} elements
 */
export function createAuthModalController(elements) {
  const modalManager = new ModalManager(elements.authModal, { focusTarget: elements.authEmail });
  modalManager.registerCloseButton(elements.closeAuthBtn);
  modalManager.registerCloseButton(elements.cancelAuthBtn);

  let mode = 'signIn'; // 'signIn' | 'signUp'
  let currentUser = null;
  let unsubscribe = () => {};

  function setError(message) {
    if (!elements.authError) return;
    if (!message) {
      elements.authError.textContent = '';
      elements.authError.style.display = 'none';
      return;
    }
    elements.authError.textContent = message;
    elements.authError.style.display = '';
  }

  function setMode(next) {
    mode = next === 'signUp' ? 'signUp' : 'signIn';
    if (elements.authModalTitle) elements.authModalTitle.textContent = mode === 'signUp' ? '🧾 注册' : '🔐 登录';
    if (elements.submitAuthBtn) elements.submitAuthBtn.textContent = mode === 'signUp' ? '注册' : '登录';
    if (elements.authSwitchHint) elements.authSwitchHint.textContent = mode === 'signUp' ? '已有账号？' : '没有账号？';
    if (elements.authSwitchBtn) elements.authSwitchBtn.textContent = mode === 'signUp' ? '去登录' : '去注册';

    if (elements.authPassword) {
      elements.authPassword.autocomplete = mode === 'signUp' ? 'new-password' : 'current-password';
    }
    setError('');
  }

  function updateAuthButton() {
    if (!elements.authBtn) return;
    const icon = currentUser ? '👤' : '🔐';
    const label = currentUser ? formatUserLabel(currentUser) : '登录';

    const iconEl = elements.authBtn.querySelector?.('.auth-icon') || null;
    const labelEl = elements.authBtn.querySelector?.('.auth-label') || null;
    if (iconEl && labelEl) {
      iconEl.textContent = icon;
      labelEl.textContent = label;
    } else {
      elements.authBtn.textContent = currentUser ? `${icon} ${label}` : `${icon} 登录`;
    }

    if (elements.mobileAuthMenuItem) {
      const menuIconEl = elements.mobileAuthMenuItem.querySelector?.('.icon') || null;
      const menuLabelEl = elements.mobileAuthMenuItem.querySelector?.('.menu-label') || null;
      if (menuIconEl) menuIconEl.textContent = icon;
      elements.mobileAuthMenuItem.title = currentUser ? `已登录：${label}` : '登录 / 注册';
      if (menuLabelEl) menuLabelEl.textContent = currentUser ? label : '登录 / 账户';
    }
  }

  function renderConfigHint() {
    const { configured } = getSupabaseConfig();
    if (!elements.authConfigHint) return;
    elements.authConfigHint.style.display = configured ? 'none' : '';
  }

  async function refreshUser() {
    currentUser = await getCurrentUser();
    updateAuthButton();
    return currentUser;
  }

  async function handleSubmit() {
    setError('');
    const { configured } = getSupabaseConfig();
    if (!configured) {
      setError('Supabase 未配置：请创建 `env.js`（参考 `env.example.js`）并填写 URL 和 Anon Key。');
      return;
    }

    const email = normalizeEmail(elements.authEmail?.value);
    const password = readPassword(elements.authPassword?.value);

    if (!email || !email.includes('@')) {
      setError('请输入有效邮箱');
      return;
    }
    if (!password || password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    try {
      if (mode === 'signUp') {
        await signUp(email, password);
        showNotification('注册成功：请检查邮箱完成验证（如果启用）', 'success');
      } else {
        await signIn(email, password);
        showNotification('登录成功', 'success');
      }
      await refreshUser();
      modalManager.close();
    } catch (error) {
      const message = error?.message || String(error);
      setError(message);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      showNotification('已登出', 'success');
      currentUser = null;
      updateAuthButton();
      modalManager.close();
    } catch (error) {
      showNotification('登出失败: ' + (error?.message || String(error)), 'error');
    }
  }

  function open() {
    renderConfigHint();
    setError('');

    if (currentUser) {
      setMode('signIn');
      if (elements.authEmail) elements.authEmail.value = currentUser.email || '';
      if (elements.authPassword) elements.authPassword.value = '';
      if (elements.submitAuthBtn) elements.submitAuthBtn.style.display = 'none';
      if (elements.signOutBtn) elements.signOutBtn.style.display = '';
      if (elements.authSwitchRow) elements.authSwitchRow.style.display = 'none';
      modalManager.open({ focusTarget: elements.signOutBtn });
      return;
    }

    if (elements.submitAuthBtn) elements.submitAuthBtn.style.display = '';
    if (elements.signOutBtn) elements.signOutBtn.style.display = 'none';
    if (elements.authSwitchRow) elements.authSwitchRow.style.display = '';

    modalManager.open({ focusTarget: elements.authEmail });
  }

  function handleSwitchMode() {
    setMode(mode === 'signUp' ? 'signIn' : 'signUp');
  }

  function handleEscape() {
    modalManager.close();
  }

  function init({ onUserChanged } = {}) {
    setMode('signIn');
    updateAuthButton();

    elements.authBtn?.addEventListener('click', open);
    elements.submitAuthBtn?.addEventListener('click', handleSubmit);
    elements.authSwitchBtn?.addEventListener('click', handleSwitchMode);
    elements.signOutBtn?.addEventListener('click', handleSignOut);

    elements.authPassword?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      }
    });

    unsubscribe = onAuthStateChange((_event, user) => {
      currentUser = user;
      updateAuthButton();
      try {
        onUserChanged?.(user);
      } catch {
        // ignore
      }
    });

    void refreshUser().then((user) => {
      try {
        onUserChanged?.(user);
      } catch {
        // ignore
      }
    });
  }

  function destroy() {
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  }

  return {
    init,
    destroy,
    handleEscape,
    getCurrentUser: () => currentUser
  };
}
