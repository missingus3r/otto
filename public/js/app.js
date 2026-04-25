// otto — minimal client JS
(function () {
  // mobile hamburger toggle
  const btn = document.getElementById('hamburger');
  const menu = document.getElementById('mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', function () {
      menu.classList.toggle('open');
    });
  }

  // toggle swap-for field on new-listing form
  const typeRadios = document.querySelectorAll('input[name="type"]');
  const swapWrap = document.getElementById('swapForWrap');
  function syncSwap() {
    const checked = document.querySelector('input[name="type"]:checked');
    if (!swapWrap) return;
    swapWrap.style.display = checked && checked.value === 'swap' ? 'block' : 'none';
  }
  typeRadios.forEach(function (r) {
    r.addEventListener('change', syncSwap);
  });
  syncSwap();

  // confirm dialogs on data-confirm forms
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      const msg = f.getAttribute('data-confirm') || 'Confirm?';
      if (!window.confirm(msg)) {
        e.preventDefault();
      }
    });
  });
})();
