import {
  DEFAULT_RADIUS_KM,
  detectOrigin,
  getAccount,
  getEvents,
  getSavedOrigin,
  saveOrigin
} from './api.js';

const PREF_KEY = 'eventradar.notifications.enabled';
const SESSION_NOTIFIED_KEY = 'eventradar.notifications.sessionNotified';

let panel = null;
let nearbyEvents = [];
let origin = null;

function ensureStyles() {
  if (document.getElementById('eventradar-notifications-styles')) return;
  const style = document.createElement('style');
  style.id = 'eventradar-notifications-styles';
  style.textContent = `
    .er-notifications-btn { position: relative; }
    .er-notifications-badge {
      position: absolute;
      top: -0.35rem;
      right: -0.35rem;
      min-width: 1.1rem;
      height: 1.1rem;
      padding: 0 .25rem;
      border-radius: 9999px;
      background: #ff453a;
      color: #fff;
      font-size: .65rem;
      font-weight: 700;
      display: grid;
      place-items: center;
      line-height: 1;
    }
    .er-notifications-panel {
      position: fixed;
      top: 4.5rem;
      right: 1rem;
      width: min(92vw, 24rem);
      max-height: 70vh;
      overflow: auto;
      z-index: 1001;
      background: rgba(28, 28, 30, .94);
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 1.25rem;
      box-shadow: 0 30px 80px rgba(0, 0, 0, .5);
      color: #f5f5f7;
      font-family: var(--font-sans, system-ui);
    }
    .er-notifications-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.1rem .75rem;
      border-bottom: 1px solid rgba(255, 255, 255, .08);
    }
    .er-notifications-header strong { font-size: 1rem; }
    .er-notifications-close {
      background: transparent;
      border: 0;
      color: rgba(235, 235, 245, .7);
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
    }
    .er-notifications-body { padding: .75rem 1.1rem; }
    .er-notifications-empty {
      color: rgba(235, 235, 245, .6);
      font-size: .9rem;
      line-height: 1.5;
    }
    .er-notification-item {
      display: block;
      padding: .75rem .85rem;
      margin-bottom: .5rem;
      border-radius: .9rem;
      background: rgba(255, 255, 255, .05);
      border: 1px solid rgba(255, 255, 255, .08);
      text-decoration: none;
      color: #f5f5f7;
    }
    .er-notification-item:hover { background: rgba(255, 255, 255, .1); }
    .er-notification-title { font-weight: 600; font-size: .9rem; margin-bottom: .25rem; }
    .er-notification-meta { font-size: .78rem; color: rgba(235, 235, 245, .6); }
    .er-notifications-actions {
      display: flex;
      gap: .5rem;
      padding: .75rem 1.1rem 1rem;
      border-top: 1px solid rgba(255, 255, 255, .08);
      flex-wrap: wrap;
    }
    .er-notifications-actions button {
      padding: .6rem .9rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, .14);
      background: rgba(255, 255, 255, .06);
      color: #f5f5f7;
      cursor: pointer;
      font-weight: 600;
      font-size: .85rem;
    }
    .er-notifications-actions button.primary {
      background: #0a84ff;
      border-color: #0a84ff;
      color: #fff;
    }
    .er-notifications-status {
      padding: .5rem 1.1rem 0;
      font-size: .78rem;
      color: rgba(235, 235, 245, .55);
    }
  `;
  document.head.appendChild(style);
}

function isEnabled() {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function setEnabled(value) {
  try {
    localStorage.setItem(PREF_KEY, value ? '1' : '0');
  } catch {
    // Ignorar si localStorage no está disponible.
  }
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

function formatDistanceKm(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${Math.round(value)} km`;
}

function createPanel() {
  panel = document.createElement('div');
  panel.className = 'er-notifications-panel';
  panel.id = 'erNotificationsPanel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="er-notifications-header">
      <strong>Eventos cercanos</strong>
      <button class="er-notifications-close" type="button" aria-label="Cerrar" data-close>×</button>
    </div>
    <div class="er-notifications-status" data-status></div>
    <div class="er-notifications-body" data-body>
      <div class="er-notifications-empty">Cargando eventos cercanos…</div>
    </div>
    <div class="er-notifications-actions">
      <button type="button" data-toggle>Activar notificaciones</button>
      <button type="button" data-refresh>Actualizar</button>
    </div>
  `;
  document.body.appendChild(panel);

  panel.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) {
      panel.style.display = 'none';
      return;
    }
    const item = event.target.closest('.er-notification-item');
    if (item) {
      const id = item.getAttribute('data-event-id');
      markSeen(id);
      return;
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      handleToggle();
      return;
    }
    const refresh = event.target.closest('[data-refresh]');
    if (refresh) {
      loadNearby(true);
    }
  });
}

function updateBadge() {
  const badge = document.getElementById('notificationsBadge');
  if (!badge) return;
  if (nearbyEvents.length > 0) {
    badge.style.display = 'grid';
    badge.textContent = nearbyEvents.length > 9 ? '9+' : String(nearbyEvents.length);
  } else {
    badge.style.display = 'none';
  }
}

function updateToggleLabel() {
  if (!panel) return;
  const button = panel.querySelector('[data-toggle]');
  if (!button) return;
  const supported = 'Notification' in window;
  if (!supported) {
    button.textContent = 'Notificaciones no soportadas';
    button.disabled = true;
    return;
  }
  if (Notification.permission === 'granted' && isEnabled()) {
    button.textContent = 'Notificaciones activas';
    button.classList.add('primary');
  } else if (Notification.permission === 'denied') {
    button.textContent = 'Permiso bloqueado';
    button.disabled = true;
  } else {
    button.textContent = 'Activar notificaciones';
    button.classList.remove('primary');
  }
}

function renderEvents() {
  if (!panel) return;
  const body = panel.querySelector('[data-body]');
  const status = panel.querySelector('[data-status]');
  if (!body) return;

  if (!origin) {
    body.innerHTML = '<div class="er-notifications-empty">Activa tu ubicación para ver eventos cercanos.</div>';
    if (status) status.textContent = '';
    return;
  }

  if (nearbyEvents.length === 0) {
    body.innerHTML = '<div class="er-notifications-empty">No hay eventos cercanos en tu zona.</div>';
  } else {
    body.innerHTML = nearbyEvents.map((event) => {
      const distance = formatDistanceKm(event.distanceKm);
      return `
        <a class="er-notification-item" href="#/match" data-event-id="${escapeHtml(event.id)}">
          <div class="er-notification-title">${escapeHtml(event.name || 'Evento')}</div>
          <div class="er-notification-meta">
            ${escapeHtml(event.venue || 'Recinto por confirmar')}
            ${event.city ? ` · ${escapeHtml(event.city)}` : ''}
            ${event.date ? ` · ${escapeHtml(event.date)}` : ''}
            ${distance ? ` · ${escapeHtml(distance)}` : ''}
          </div>
        </a>
      `;
    }).join('');
  }

  if (status) {
    const radius = origin.radiusKm || DEFAULT_RADIUS_KM;
    status.textContent = origin.city
      ? `Mostrando eventos cerca de ${origin.city} (radio ${radius} km).`
      : `Mostrando eventos cerca de tu ubicación (radio ${radius} km).`;
  }
}

async function loadNearby(notifyBrowser = false) {
  origin = getSavedOrigin();
  renderEvents();

  if (!origin) {
    // Intentar detectar ubicación automáticamente una sola vez.
    try {
      const result = await detectOrigin();
      if (result.origin) {
        origin = saveOrigin(result.origin);
      }
    } catch {
      // Ignorar errores de geolocalización.
    }

    // Si no se pudo obtener ubicación, usar Cusco como ubicación por defecto
    // para poder mostrar eventos cercanos.
    if (!origin) {
      origin = saveOrigin({
        lat: -13.53195,
        lng: -71.96746,
        label: 'Cusco',
        city: 'Cusco',
        country: 'Perú',
        countryCode: 'PE',
        radiusKm: DEFAULT_RADIUS_KM
      });
    }
    renderEvents();
  }

  if (!origin) {
    updateBadge();
    return;
  }

  const params = {
    size: 8,
    lat: origin.lat,
    lng: origin.lng,
    radius: origin.radiusKm || DEFAULT_RADIUS_KM,
    unit: 'km'
  };
  if (origin.countryCode) params.countryCode = origin.countryCode;
  if (origin.city) params.city = origin.city;

  const result = await getEvents(params);
  const seen = getSeen();
  nearbyEvents = (Array.isArray(result?.events) ? result.events : [])
    .filter((event) => !seen.has(String(event.id)));
  renderEvents();
  updateBadge();

  if (notifyBrowser && isEnabled() && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if (!sessionStorage.getItem(SESSION_NOTIFIED_KEY)) {
        sessionStorage.setItem(SESSION_NOTIFIED_KEY, '1');
        if (nearbyEvents.length > 0) {
          new Notification('Eventos cercanos a ti', {
            body: `Hay ${nearbyEvents.length} evento(s) cerca de tu ubicación.`
          });
        }
      }
    } catch {
      // Ignorar errores de notificación.
    }
  }
}

async function handleToggle() {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      updateToggleLabel();
      return;
    }
  }

  if (Notification.permission === 'granted') {
    setEnabled(true);
    updateToggleLabel();
    await loadNearby(true);
  } else {
    setEnabled(false);
    updateToggleLabel();
  }
}

const SEEN_KEY = 'eventradar.notifications.seen';

function getSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function saveSeen(set) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // Ignorar si localStorage no está disponible.
  }
}

function markSeen(id) {
  if (id == null) return;
  const seen = getSeen();
  seen.add(String(id));
  saveSeen(seen);
  nearbyEvents = nearbyEvents.filter((event) => String(event.id) !== String(id));
  renderEvents();
  updateBadge();
}

export async function initNotificationsUI() {
  ensureStyles();

  const button = document.getElementById('notificationsBtn');
  if (!button) return;

  const account = await getAccount();
  if (!account) {
    button.style.display = 'none';
    return;
  }

  button.classList.add('er-notifications-btn');
  if (!document.getElementById('notificationsBadge')) {
    const badge = document.createElement('span');
    badge.className = 'er-notifications-badge';
    badge.id = 'notificationsBadge';
    badge.style.display = 'none';
    button.appendChild(badge);
  }

  if (!panel) createPanel();

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!panel) createPanel();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', (event) => {
    if (!panel) return;
    if (panel.style.display === 'none') return;
    if (panel.contains(event.target) || button.contains(event.target)) return;
    panel.style.display = 'none';
  });

  updateToggleLabel();
  await loadNearby(isEnabled());
}
