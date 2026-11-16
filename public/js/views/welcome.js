import { DEFAULT_RADIUS_KM, getAccount, getEvents, getSavedOrigin } from '../api.js';
import { openAuthModal } from '../auth-ui.js';
import { artistHash, emptyState, escapeHtml, eventImage, formatEventDate, safeHttpUrl } from '../utils.js';

export class WelcomeView {
  constructor(container) {
    this.container = container;
    this.events = [];
    this.onOrigin = () => this.loadEvents();
  }

  async render() {
    const account = await getAccount();
    const isLoggedIn = Boolean(account);

    this.container.innerHTML = `
      <section class="welcome-hero">
        <span class="welcome-kicker"><span class="material-symbols-outlined">radar</span> EventRadar &amp; Festival Match</span>
        <h1>Descubre los conciertos que encajan con tu música</h1>
        <p>Explora conciertos reales, planifica tu ruta y revisa el pronóstico del recinto.${isLoggedIn ? ` Sesión iniciada como ${escapeHtml(account.username)}.` : ' Puedes entrar como visitante o crear una cuenta.'}</p>
        <div class="welcome-actions">
          ${isLoggedIn ? `
            <a class="welcome-login" href="#/match">
              <span class="material-symbols-outlined">radar</span>
              Explorar eventos
            </a>
          ` : `
            <button class="welcome-login" id="welcomeLoginBtn" type="button">
              <span class="material-symbols-outlined">person</span>
              Iniciar sesión
            </button>
            <button class="welcome-secondary" id="welcomeRegisterBtn" type="button">
              <span class="material-symbols-outlined">person_add</span>
              Registrarse
            </button>
            <a class="welcome-secondary" href="#/match">
              <span class="material-symbols-outlined">visibility</span>
              Entrar como visitante
            </a>
          `}
        </div>
      </section>

      <section class="welcome-events">
        <div class="events-header">
          <h2 class="events-title">Próximos eventos <span class="events-count" id="welcomeCount">—</span></h2>
          <span class="events-sort">Datos de Ticketmaster</span>
        </div>
        <div id="welcomeEvents" class="events-grid no-sidebar">
          <div class="view-loading" role="status"><span class="material-symbols-outlined">progress_activity</span><span>Cargando eventos…</span></div>
        </div>
      </section>
    `;

    this.onClick = (event) => {
      const loginButton = event.target.closest('#welcomeLoginBtn');
      const registerButton = event.target.closest('#welcomeRegisterBtn');
      if (loginButton) {
        openAuthModal('login');
      } else if (registerButton) {
        openAuthModal('register');
      }
    };
    this.container.addEventListener('click', this.onClick);
    window.addEventListener('eventradar:origin', this.onOrigin);

    await this.loadEvents();
  }

  async loadEvents() {
    const origin = getSavedOrigin();
    const params = { size: 6 };
    if (origin) {
      params.lat = origin.lat;
      params.lng = origin.lng;
      params.radius = origin.radiusKm || DEFAULT_RADIUS_KM;
      params.unit = 'km';
      if (origin.countryCode) params.countryCode = origin.countryCode;
      if (origin.city) params.city = origin.city;
    }

    const result = await getEvents(params);
    this.events = result.events || [];
    const list = this.container.querySelector('#welcomeEvents');
    const count = this.container.querySelector('#welcomeCount');
    if (!list) return;
    if (count) count.textContent = String(this.events.length);

    if (result.error) {
      list.innerHTML = emptyState({
        icon: 'cloud_off',
        title: 'No se pudieron cargar los eventos',
        message: result.error.message || 'Revisa la configuración de Ticketmaster e inténtalo de nuevo.',
        action: '<button class="event-card-ref-btn glass" type="button" data-retry>Reintentar</button>'
      });
      list.querySelector('[data-retry]')?.addEventListener('click', () => this.loadEvents());
      return;
    }

    if (this.events.length === 0) {
      list.innerHTML = emptyState({
        icon: 'event_busy',
        title: 'No hay eventos próximos',
        message: 'Ticketmaster no devolvió eventos de música para las fechas consultadas.'
      });
      return;
    }

    list.innerHTML = this.events.map((event) => {
      const image = eventImage(event);
      const ticketUrl = safeHttpUrl(event.url);
      const firstArtist = event.artists?.[0]?.name;
      return `
        <article class="apple-glass-card welcome-event-card">
          ${image
            ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(event.name)}" loading="lazy">`
            : '<div class="event-image-fallback" aria-hidden="true"><span class="material-symbols-outlined">music_note</span></div>'}
          <div class="welcome-event-body">
            <span class="event-card-ref-badge-left">${escapeHtml(formatEventDate(event))}</span>
            <h3>${escapeHtml(event.name)}</h3>
            <p><span class="material-symbols-outlined">location_on</span>${escapeHtml(event.venue || 'Recinto por confirmar')}${event.city ? ` · ${escapeHtml(event.city)}` : ''}</p>
            ${firstArtist ? `<a class="welcome-artist-link" href="${artistHash(firstArtist)}">${escapeHtml(firstArtist)}</a>` : ''}
            <div class="welcome-event-actions">
              ${ticketUrl ? `<a class="event-card-ref-btn glass" href="${escapeHtml(ticketUrl)}" target="_blank" rel="noopener noreferrer">Entradas</a>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');


  }

  destroy() {
    if (this.onClick) this.container.removeEventListener('click', this.onClick);
    window.removeEventListener('eventradar:origin', this.onOrigin);
  }
}
