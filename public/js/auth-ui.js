import { apiRequest, clearCurrentUserCache, getAccount, logoutAccount } from './api.js';

let currentUser = null;
let modalRoot = null;

function ensureStyles() {
  if (document.getElementById('eventradar-auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'eventradar-auth-styles';
  style.textContent = `
    .er-auth-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, .62);
      backdrop-filter: blur(12px);
      padding: 1rem;
    }
    .er-auth-modal {
      width: min(100%, 26rem);
      background: rgba(28, 28, 30, .92);
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 1.5rem;
      padding: 1.5rem;
      box-shadow: 0 30px 80px rgba(0, 0, 0, .5);
      color: #f5f5f7;
      font-family: var(--font-sans, system-ui);
    }
    .er-auth-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .er-auth-title { font-size: 1.25rem; font-weight: 700; margin: 0; }
    .er-auth-close {
      background: transparent;
      border: 0;
      color: rgba(235, 235, 245, .7);
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
    }
    .er-auth-tabs {
      display: flex;
      gap: .5rem;
      margin-bottom: 1rem;
    }
    .er-auth-tab {
      flex: 1;
      padding: .65rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, .12);
      background: rgba(255, 255, 255, .05);
      color: #f5f5f7;
      cursor: pointer;
      font-weight: 600;
    }
    .er-auth-tab.active {
      background: #0a84ff;
      border-color: #0a84ff;
      color: #fff;
    }
    .er-auth-form { display: grid; gap: .75rem; }
    .er-auth-form label { font-size: .85rem; font-weight: 600; color: rgba(235, 235, 245, .82); }
    .er-auth-form input {
      width: 100%;
      padding: .8rem 1rem;
      border-radius: .85rem;
      border: 1px solid rgba(255, 255, 255, .16);
      background: rgba(255, 255, 255, .06);
      color: #fff;
      font-size: 1rem;
      outline: none;
    }
    .er-auth-form input:focus { border-color: #0a84ff; box-shadow: 0 0 0 3px rgba(10, 132, 255, .18); }
    .er-auth-submit {
      margin-top: .25rem;
      padding: .85rem 1rem;
      border: 0;
      border-radius: 9999px;
      background: #0a84ff;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .er-auth-error {
      padding: .75rem 1rem;
      border-radius: .85rem;
      background: rgba(255, 69, 58, .12);
      border: 1px solid rgba(255, 69, 58, .3);
      color: #ffb4ab;
      font-size: .9rem;
    }
    .er-auth-hint { font-size: .8rem; color: rgba(235, 235, 245, .5); line-height: 1.5; }
    .er-auth-visitor {
      width: 100%;
      margin-top: .5rem;
      padding: .75rem 1rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, .14);
      background: transparent;
      color: #f5f5f7;
      cursor: pointer;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
}

function closeModal() {
  if (modalRoot) {
    modalRoot.remove();
    modalRoot = null;
  }
}

function updateNav() {
  const loginBtn = document.getElementById('accountLoginBtn');
  const profile = document.getElementById('accountProfile');
  const name = document.getElementById('accountProfileName');
  const logoutBtn = document.getElementById('accountLogoutBtn');

  if (currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (profile) profile.style.display = 'flex';
    if (name) {
      name.textContent = currentUser.username;
      name.title = currentUser.username;
    }
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (profile) profile.style.display = 'none';
  }

  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', async () => {
      await logoutAccount();
      currentUser = null;
      clearCurrentUserCache();
      updateNav();
      window.location.reload();
    });
  }
}

export function getCurrentAccount() {
  return currentUser;
}

export async function refreshAccount() {
  currentUser = await getAccount();
  updateNav();
  return currentUser;
}

function renderForm(mode, error = '') {
  const isRegister = mode === 'register';
  return `
    <div class="er-auth-overlay" role="dialog" aria-modal="true">
      <div class="er-auth-modal">
        <div class="er-auth-header">
          <h2 class="er-auth-title">${isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
          <button class="er-auth-close" type="button" aria-label="Cerrar" data-close>×</button>
        </div>
        <div class="er-auth-tabs">
          <button class="er-auth-tab ${!isRegister ? 'active' : ''}" type="button" data-mode="login">Iniciar sesión</button>
          <button class="er-auth-tab ${isRegister ? 'active' : ''}" type="button" data-mode="register">Registrarse</button>
        </div>
        ${error ? `<div class="er-auth-error" role="alert">${escapeHtml(error)}</div>` : ''}
        <form class="er-auth-form" data-form="${mode}">
          <label>
            Usuario
            <input name="username" type="text" autocomplete="username" required minlength="3" maxlength="32">
          </label>
          ${isRegister ? `
            <label>
              Correo (opcional)
              <input name="email" type="email" autocomplete="email">
            </label>
          ` : ''}
          <label>
            Contraseña
            <input name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" required minlength="6">
          </label>
          ${isRegister ? `
            <label>
              Repetir contraseña
              <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="6">
            </label>
          ` : ''}
          <button class="er-auth-submit" type="submit">${isRegister ? 'Crear cuenta' : 'Entrar'}</button>
        </form>
        <button class="er-auth-visitor" type="button" data-visitor>Entrar como visitante</button>
        <p class="er-auth-hint">Los datos se guardan en la base de datos local del servidor. Puedes seguir explorando eventos sin iniciar sesión.</p>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

export function openAuthModal(mode = 'login') {
  ensureStyles();
  closeModal();
  modalRoot = document.createElement('div');
  modalRoot.innerHTML = renderForm(mode);
  document.body.appendChild(modalRoot);

  const overlay = modalRoot.firstElementChild;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-close]')) {
      closeModal();
    }
    const tab = event.target.closest('[data-mode]');
    if (tab) {
      openAuthModal(tab.getAttribute('data-mode'));
      return;
    }
    const visitor = event.target.closest('[data-visitor]');
    if (visitor) {
      closeModal();
      window.location.hash = '#/match';
    }
  });

  const form = overlay.querySelector('[data-form]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');
    const email = data.get('email') ? String(data.get('email')).trim() : null;
    const confirmPassword = data.get('confirmPassword') != null
      ? String(data.get('confirmPassword'))
      : null;

    const mode = form.getAttribute('data-form');
    const payload = { username, password };
    if (mode === 'register') {
      payload.email = email;
      payload.confirmPassword = confirmPassword;
    }

    const submitButton = form.querySelector('.er-auth-submit');
    if (submitButton) submitButton.disabled = true;

    try {
      const result = mode === 'register'
        ? await apiRequest('/api/account/register', { method: 'POST', body: JSON.stringify(payload) })
        : await apiRequest('/api/account/login', { method: 'POST', body: JSON.stringify(payload) });

      currentUser = result.user;
      clearCurrentUserCache();
      updateNav();
      closeModal();
      window.location.reload();
    } catch (error) {
      const message = error?.payload?.error?.message || error?.message || 'No se pudo completar la operación.';
      const errorBox = overlay.querySelector('.er-auth-error');
      if (errorBox) {
        errorBox.textContent = message;
      } else {
        const formEl = overlay.querySelector('.er-auth-form');
        const div = document.createElement('div');
        div.className = 'er-auth-error';
        div.setAttribute('role', 'alert');
        div.textContent = message;
        formEl.parentNode.insertBefore(div, formEl);
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

export async function initAccountUI() {
  ensureStyles();
  const loginBtn = document.getElementById('accountLoginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => openAuthModal('login'));
  }
  await refreshAccount();
}
