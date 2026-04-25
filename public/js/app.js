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

  // ─── Cookie consent banner ───
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : null;
  }
  function setCookie(name, value, days) {
    const exp = new Date(Date.now() + days * 86400 * 1000);
    document.cookie =
      name + '=' + encodeURIComponent(value) + '; expires=' + exp.toUTCString() + '; path=/; SameSite=Lax';
  }
  const banner = document.getElementById('cookieBanner');
  if (banner && !getCookie('cookie_consent')) {
    banner.style.display = 'flex';
    const accept = document.getElementById('cookieAccept');
    const necessary = document.getElementById('cookieNecessary');
    if (accept) {
      accept.addEventListener('click', function () {
        setCookie('cookie_consent', 'all', 365);
        banner.style.display = 'none';
      });
    }
    if (necessary) {
      necessary.addEventListener('click', function () {
        setCookie('cookie_consent', 'necessary', 365);
        banner.style.display = 'none';
      });
    }
  }

  // ─── Listing detail gallery (clickable thumbs) ───
  const main = document.querySelector('[data-gallery-main]');
  if (main) {
    document.querySelectorAll('[data-gallery-thumb]').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('[data-gallery-thumb]').forEach(function (x) {
          x.classList.remove('active');
        });
        t.classList.add('active');
        main.src = t.dataset.full || t.src;
      });
    });
  }

  // ─── Chat long-poll ───
  const chat = document.querySelector('[data-chat]');
  if (chat) {
    const matchId = chat.dataset.matchId;
    const myId = chat.dataset.myId;
    const list = chat.querySelector('[data-chat-list]');
    let since = chat.dataset.now || new Date(0).toISOString();
    function fmtTime(d) {
      try { return new Date(d).toLocaleTimeString(); } catch (e) { return ''; }
    }
    async function poll() {
      try {
        const r = await fetch('/messages/' + matchId + '/poll?since=' + encodeURIComponent(since));
        if (!r.ok) return;
        const data = await r.json();
        if (data && data.now) since = data.now;
        if (data && Array.isArray(data.messages) && data.messages.length) {
          for (const m of data.messages) {
            const div = document.createElement('div');
            div.className = 'chat-msg ' + (m.fromUserId === myId ? 'mine' : 'theirs');
            div.textContent = m.body;
            const t = document.createElement('span');
            t.className = 'chat-msg-time';
            t.textContent = fmtTime(m.createdAt);
            div.appendChild(t);
            list.appendChild(div);
          }
          list.scrollTop = list.scrollHeight;
        }
      } catch (e) {
        // silent
      }
    }
    if (list) list.scrollTop = list.scrollHeight;
    setInterval(poll, 5000);
  }
})();
