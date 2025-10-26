/* js/app.js */
(() => {
  'use strict';

  /* ---------------------------
   * Utils
   * --------------------------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------------------------
   * 1) Footer year
   * --------------------------- */
  function setDynamicYear() {
    const y = $('#y');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  /* ---------------------------
   * 2) Cookies + Legal modal
   * --------------------------- */
  function initCookieBanner() {
    const banner = $('#cookie-banner');
    const acceptBtn = $('#accept-cookies');
    if (!banner || !acceptBtn) return;

    if (!localStorage.getItem('cookiesAccepted')) {
      banner.style.display = 'block';
    }

    acceptBtn.addEventListener('click', () => {
      localStorage.setItem('cookiesAccepted', 'true');
      banner.style.display = 'none';
    });

    const modal = $('#modal-legal');
    const close = $('.close-legal');

    $$('#cookie-banner a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (modal) modal.style.display = 'flex';
      });
    });

    if (close && modal) {
      close.addEventListener('click', () => (modal.style.display = 'none'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }
  }

  /* ---------------------------
   * 3) "Ver más" / "Ver precio"
   *    - sin bloqueos ni dependencias del estado inicial
   * --------------------------- */
  function initVerMasToggle() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button.ver-mas');
      if (!btn) return;

      const id = btn.getAttribute('aria-controls');
      const panel = id ? document.getElementById(id) : null;

      const isVisible = panel ? panel.hidden === false : (btn.getAttribute('aria-expanded') === 'true');
      const willExpand = !isVisible;

      btn.setAttribute('aria-expanded', String(willExpand));
      if (panel) panel.hidden = !willExpand;
      btn.textContent = willExpand ? 'Ver precio' : 'Ver más';
    }, false);
  }

  /* ---------------------------
   * 4) Hero video: performance
   *    - respeta reduced-motion
   *    - pausa fuera de viewport
   * --------------------------- */
 function initHeroVideo() {
  const section = document.querySelector('.hero--contact');
  const video   = document.querySelector('.hero__video');
  if (!section || !video) return;

  // Requisitos para autoplay en iOS
  video.muted = true;
  video.setAttribute('playsinline', '');
  if (!video.hasAttribute('preload')) video.setAttribute('preload', 'metadata');

  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Si el usuario prefiere menos movimiento, no uses vídeo.
  if (prefersReduced) {
    section.classList.add('no-video');
    try { video.pause(); } catch {}
    return;
  }

  // Intento de reproducción
  const tryPlay = () => {
    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // iOS/Safari ha bloqueado autoplay → usa poster como fondo, oculta el video
        section.classList.add('no-video');
        try { video.pause(); } catch {}
      });
    }
  };

  // iOS puede bloquear al cargar: reintenta tras el primer toque
  const onFirstUserInteraction = () => {
    tryPlay();
    window.removeEventListener('touchstart', onFirstUserInteraction, { passive: true });
    window.removeEventListener('click', onFirstUserInteraction, true);
  };

  // Si el navegador lo permite, reproduce
  tryPlay();

  // Reintento en iOS al primer toque
  window.addEventListener('touchstart', onFirstUserInteraction, { passive: true });
  window.addEventListener('click', onFirstUserInteraction, true);

  // Si el documento se oculta y vuelve, reintenta
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !section.classList.contains('no-video')) tryPlay();
  });
}


  /* ---------------------------
   * 5) Securización de enlaces
   *    - rápida y con caché por <a>
   * --------------------------- */
  const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
  if (location.protocol === 'file:') ALLOWED_PROTOCOLS.add('file:'); // solo dev local

  const isHashOnly = (href) => typeof href === 'string' && href.trim().startsWith('#');
  const isLikelyRelative = (href) => (
    href && !href.includes(':') // sin protocolo explícito → relativo (contacto.html, ./, ../, /ruta)
  );

  /** Normaliza/valida una URL respecto a baseURI. Devuelve string seguro o null. */
  function sanitizeHref(href) {
    if (!href) return null;
    if (isHashOnly(href)) return href;

    // Fast-path para relativos: asúmelos same-origin pero normaliza igualmente
    let url;
    try {
      url = new URL(href, document.baseURI);
    } catch {
      return null;
    }
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
    return url.href;
  }

  /** Aplica atributos de seguridad a un <a>. */
  function hardenAnchorAttributes(a, safeHref) {
    if (a.getAttribute('href') !== safeHref) a.setAttribute('href', safeHref);

    // Marcado externo por origen (más fiable que startsWith('http'))
    const url = new URL(safeHref, document.baseURI);
    const isExternal = url.origin !== location.origin;

    if (isExternal && a.target === '_blank') {
      const rel = (a.getAttribute('rel') || '').split(/\s+/);
      if (!rel.includes('noopener')) rel.push('noopener');
      if (!rel.includes('noreferrer')) rel.push('noreferrer');
      a.setAttribute('rel', rel.filter(Boolean).join(' '));
    }
    if (isExternal && !a.hasAttribute('referrerpolicy')) {
      a.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    }
  }

  /** Endurece todos los enlaces existentes (una sola pasada). */
  function hardenAnchorsInitialPass() {
    $$('a[href]').forEach(a => {
      const raw = a.getAttribute('href');
      const safe = sanitizeHref(raw);
      if (!safe) {
        a.removeAttribute('href');
        a.setAttribute('aria-disabled', 'true');
        a.classList.add('is-disabled-link');
        return;
      }
      hardenAnchorAttributes(a, safe);
      // cachea resultado para ahorrar trabajo en clicks sucesivos
      a.dataset.safehref = safe;
    });
  }

  /** Guard de click: ligero y sin captura global */
  function initAnchorClickGuard() {
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest('a[href]');
      if (!a) return;

      // Usa el valor cacheado si existe
      let safe = a.dataset.safehref;
      if (!safe) {
        safe = sanitizeHref(a.getAttribute('href'));
        if (safe) {
          a.dataset.safehref = safe;
          hardenAnchorAttributes(a, safe);
        }
      }

      if (!safe) {
        ev.preventDefault();
        console.warn('Bloqueado href no seguro:', a.getAttribute('href'));
        return;
      }
      // No forzamos setAttribute aquí para evitar mutaciones innecesarias.
      // El href ya quedó normalizado en la pasada inicial (o arriba).
    }, false);
  }

  /* ---------------------------
   * Init
   * --------------------------- */
  function init() {
    setDynamicYear();
    initCookieBanner();
    initVerMasToggle();
    initHeroVideo();

    // Seguridad de enlaces
    hardenAnchorsInitialPass();
    initAnchorClickGuard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// --- Menú móvil accesible ---
function initMobileNav(){
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('primary-nav');
  if (!header || !toggle || !nav) return;

  const close = () => {
    header.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
  };
  const open = () => {
    header.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Cerrar menú');
  };

  toggle.addEventListener('click', () => {
    const isOpen = header.classList.contains('is-open');
    isOpen ? close() : open();
  });

  // Cierra al navegar por un enlace o pulsar Escape
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

// Llama a la init en tu función init()
/* ... */
function init(){
  /* lo que ya tienes ... */
  initMobileNav();
  /* ... */
}

