import { apiRequest, getAccount, getSession } from './api.js';

let modalRoot = null;
let categories = [];
let selected = new Set();
let saveTimer = null;

function ensureStyles() {
  if (document.getElementById('eventradar-tastes-styles')) return;
  const style = document.createElement('style');
  style.id = 'eventradar-tastes-styles';
  style.textContent = `
    .er-tastes-overlay {
      position: fixed;
      inset: 0;
      z-index: 1002;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, .62);
      backdrop-filter: blur(12px);
      padding: 1rem;
    }
    .er-tastes-modal {
      width: min(92vw, 32rem);
      max-height: 80vh;
      overflow: auto;
      background: rgba(28, 28, 30, .94);
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 1.5rem;
      padding: 1.5rem;
      color: #f5f5f7;
      font-family: var(--font-sans, system-ui);
    }
    .er-tastes-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .er-tastes-title { font-size: 1.2rem; font-weight: 700; margin: 0; }
    .er-tastes-close {
      background: transparent;
      border: 0;
      color: rgba(235, 235, 245, .7);
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
    }
    .er-tastes-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .5rem;
      margin: 1rem 0;
    }
    .er-taste-chip {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .65rem .8rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, .12);
      background: rgba(255, 255, 255, .05);
      cursor: pointer;
      user-select: none;
    }
    .er-taste-chip.selected {
      background: #0a84ff;
      border-color: #0a84ff;
      color: #fff;
    }
    .er-tastes-actions {
      display: flex;
      gap: .5rem;
      justify-content: flex-end;
      margin-top: 1rem;
    }
    .er-tastes-actions button {
      padding: .7rem 1rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, .14);
      background: rgba(255, 255, 255, .06);
      color: #f5f5f7;
      cursor: pointer;
      font-weight: 600;
    }
    .er-tastes-actions button.primary {
      background: #0a84ff;
      border-color: #0a84ff;
      color: #fff;
    }
    .er-tastes-status {
      font-size: .85rem;
      color: rgba(235, 235, 245, .6);
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

function renderModal(status = '') {
  const available = categories.filter((cat) => !selected.has(cat.nombre));
  const chosen = categories.filter((cat) => selected.has(cat.nombre));

  const availableGrid = available.map((cat) => `
    <button type="button" class="er-taste-chip" data-category="${escapeHtml(cat.nombre)}">
      ${escapeHtml(cat.nombre)}
    </button>
  `).join('');

  const chosenChips = chosen.map((cat) => `
    <button type="button" class="er-taste-chip selected" data-category="${escapeHtml(cat.nombre)}">
      ${escapeHtml(cat.nombre)}
    </button>
  `).join('');

  modalRoot.innerHTML = `
    <div class="er-tastes-overlay" role="dialog" aria-modal="true">
      <div class="er-tastes-modal">
        <div class="er-tastes-header">
          <h2 class="er-tastes-title">Mis gustos musicales</h2>
          <button class="er-tastes-close" type="button" aria-label="Cerrar" data-close>×</button>
        </div>
        <p class="er-tastes-status">${escapeHtml(status || 'Selecciona los géneros que te gustan.')}</p>
        ${chosen.length ? `
          <p class="er-tastes-status"><strong>Seleccionados:</strong></p>
          <div class="er-tastes-grid">${chosenChips}</div>
        ` : ''}
        <p class="er-tastes-status"><strong>Disponibles:</strong></p>
        <div class="er-tastes-grid">${availableGrid || '<span class="er-tastes-status">No hay más géneros disponibles.</span>'}</div>
        <div class="er-tastes-actions">
          <button type="button" data-clear>Limpiar</button>
          <button type="button" data-close>Cerrar</button>
        </div>
      </div>
    </div>
  `;

  const overlay = modalRoot.firstElementChild;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-close]')) {
      closeModal();
      return;
    }

    const chip = event.target.closest('.er-taste-chip');
    if (chip) {
      const name = chip.getAttribute('data-category');
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      renderModal('Guardando gustos…');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveTastes, 400);
      return;
    }

    if (event.target.closest('[data-clear]')) {
      selected = new Set();
      renderModal('Guardando gustos…');
      clearTimeout(saveTimer);
      saveTastes();
      return;
    }
  });
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

async function loadCategories() {
  const data = await apiRequest('/api/categories');
  categories = Array.isArray(data?.categories) ? data.categories : [];
}

async function loadTastes() {
  const data = await apiRequest('/api/tastes');
  const tastes = Array.isArray(data?.tastes) ? data.tastes : [];
  selected = new Set(tastes.map((item) => item.nombre));
}

async function saveTastes() {
  const button = modalRoot?.querySelector('[data-save]');
  if (button) button.disabled = true;
  try {
    const data = await apiRequest('/api/tastes', {
      method: 'POST',
      body: JSON.stringify({ categories: [...selected] })
    });
    const tastes = Array.isArray(data?.tastes) ? data.tastes : [];
    selected = new Set(tastes.map((item) => item.nombre));
    renderModal('Gustos guardados correctamente.');
  } catch (error) {
    const message = error?.payload?.error?.message || error?.message || 'No se pudieron guardar los gustos.';
    renderModal(message);
  } finally {
    if (button) button.disabled = false;
  }
}

export async function openTastesModal() {
  ensureStyles();
  closeModal();
  selected = new Set();
  modalRoot = document.createElement('div');
  document.body.appendChild(modalRoot);
  renderModal('Cargando gustos…');

  try {
    await loadCategories();
    await loadTastes();
    renderModal('Selecciona los géneros que te gustan.');
  } catch (error) {
    const message = error?.payload?.error?.message || error?.message || 'No se pudieron cargar los gustos.';
    renderModal(message);
  }
}

export async function initTastesUI() {
  ensureStyles();
  const button = document.getElementById('tastesBtn');
  if (!button) return;

  const account = await getAccount();
  const session = await getSession();
  const hasAccess = Boolean(account) || Boolean(session?.authenticated);
  if (!hasAccess) {
    button.style.display = 'none';
    return;
  }

  button.style.display = 'inline-flex';
  button.addEventListener('click', () => openTastesModal());
}
