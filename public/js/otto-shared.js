/* ──────────────────────────────────────────────────────────
   otto · shared client helpers
   Ported from _design-pack-2026-04-25/app/_shared.js, with
   all mock-data helpers removed. Only UI helpers live here:
   banner, modal, hamburger, escapeHtml, fmt.
   ────────────────────────────────────────────────────────── */
(function () {
  // ── helpers ────────────────────────────────────────────────
  function fmt(n, cur) {
    if (n === null || n === undefined || n === '') return '';
    return new Intl.NumberFormat('es-AR').format(n) + ' ' + (cur || '');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ── banner injection ───────────────────────────────────────
  function ottoBanner(opts) {
    opts = opts || {};
    var kind = opts.kind || 'error';
    var stamp = opts.stamp || 'ERROR';
    var title = opts.title || '';
    var text = opts.text || '';
    var slot = document.getElementById('banner-slot');
    if (!slot) return;
    var klass = kind === 'success' ? 'success' : kind === 'warn' ? 'warn' : '';
    slot.innerHTML =
      '<div class="banner ' + klass + '">' +
        '<div class="banner-stamp">' + escapeHtml(stamp) + '</div>' +
        '<div class="banner-body">' +
          '<div class="banner-title">' + escapeHtml(title) + '</div>' +
          '<div class="banner-text">' + text + '</div>' +
        '</div>' +
        '<button class="banner-close" type="button" aria-label="cerrar">×</button>' +
      '</div>';
    var close = slot.querySelector('.banner-close');
    if (close) close.addEventListener('click', function () { slot.innerHTML = ''; });
  }

  // ── modal helpers ──────────────────────────────────────────
  function ottoOpenModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function ottoCloseModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    document.body.style.overflow = '';
  }
  document.addEventListener('click', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(function (m) {
        m.classList.remove('open');
      });
      document.body.style.overflow = '';
    }
  });

  // ── hamburger (works with the design's app-nav markup) ─────
  function wireHamburger() {
    var ham = document.getElementById('hamburger');
    var lnk = document.getElementById('navLinks');
    if (!ham || !lnk) return;
    ham.addEventListener('click', function () {
      var open = ham.classList.toggle('open');
      lnk.classList.toggle('open', open);
      document.body.classList.toggle('nav-open', open);
    });
  }

  // expose
  window.fmt = fmt;
  window.escapeHtml = escapeHtml;
  window.ottoBanner = ottoBanner;
  window.ottoOpenModal = ottoOpenModal;
  window.ottoCloseModal = ottoCloseModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireHamburger);
  } else {
    wireHamburger();
  }
})();
