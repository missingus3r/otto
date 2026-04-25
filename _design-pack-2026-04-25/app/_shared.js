/* ──────────────────────────────────────────────────────────
   otto · shared mock data + interactions
   ────────────────────────────────────────────────────────── */

// Fake current user (read from localStorage so register/login can mutate it)
const OTTO_USER_DEFAULT = {
  id: "u_8814",
  displayName: "Ana Marini",
  email: "ana@otto.market",
  role: "user",
  region: "AR · Buenos Aires",
  joined: "2025-09-12",
  lastLoginAt: "2025-12-18 09:14",
  reputation: { score: 4.8, deals: 12 },
  lang: "es",
};

function ottoUser() {
  try {
    const stored = JSON.parse(localStorage.getItem("otto_user") || "null");
    return stored || OTTO_USER_DEFAULT;
  } catch { return OTTO_USER_DEFAULT; }
}
function ottoSetUser(u) { localStorage.setItem("otto_user", JSON.stringify(u)); }
function ottoLogout() { localStorage.removeItem("otto_user"); }
function ottoIsLoggedIn() {
  return !!localStorage.getItem("otto_user");
}

// Mock listings — varied by region
const OTTO_LISTINGS = [
  {
    id: "L-001", owner: "u_8814", ownerName: "Ana Marini",
    title: "Polaroid SX-70 Land Camera",
    desc: "Cámara analógica vintage. Funcionando, fuelle restaurado en 2024. Incluye cinta original y film 600 sin abrir.",
    region: "AR · Buenos Aires", currency: "USD",
    rangeMin: 220, rangeMax: 340, kind: "sell",
    status: "open", moderation: "approved",
    createdAt: "2025-12-12", views: 47,
    photo: "https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=900&q=70&auto=format",
  },
  {
    id: "L-002", owner: "u_4471", ownerName: "Lucas Rivero",
    title: "Bicicleta urbana Trek 7.2",
    desc: "Cuadro aluminio talle M, 21 cambios, frenos hidráulicos. Service reciente. Andó conmigo de Belgrano a Palermo durante 2 años.",
    region: "AR · Buenos Aires", currency: "ARS",
    rangeMin: 180000, rangeMax: 240000, kind: "sell",
    status: "open", moderation: "approved",
    createdAt: "2025-12-04", views: 134,
    photo: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=900&q=70&auto=format",
  },
  {
    id: "L-003", owner: "u_2210", ownerName: "Sofía Cabrera",
    title: "Mate de calabaza con bombilla de alpaca",
    desc: "Pieza artesanal de Salta, calabaza curada hace 3 años. Bombilla de alpaca con detalle de plata. Sin uso reciente.",
    region: "UY · Montevideo", currency: "UYU",
    rangeMin: 1800, rangeMax: 2600, kind: "sell",
    status: "open", moderation: "approved",
    createdAt: "2025-12-09", views: 22,
    photo: "https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=900&q=70&auto=format",
  },
  {
    id: "L-004", owner: "u_6092", ownerName: "Pedro Almeida",
    title: "Violão Giannini clássico GS-1",
    desc: "Modelo descontinuado em alta procura. Tampo de cedro, escala de pau-rosa. Estado 8/10. Sai com case rígido.",
    region: "BR · São Paulo", currency: "BRL",
    rangeMin: 850, rangeMax: 1300, kind: "sell",
    status: "open", moderation: "approved",
    createdAt: "2025-12-12", views: 89,
    photo: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=900&q=70&auto=format",
  },
  {
    id: "L-005", owner: "u_8814", ownerName: "Ana Marini",
    title: "Monitor LG UltraWide 34\"",
    desc: "34 pulgadas, 3440x1440, IPS. Comprado en 2024, garantía hasta 2026. Acepto trueque por tablet de dibujo.",
    region: "AR · Buenos Aires", currency: "USD",
    rangeMin: 320, rangeMax: 420, kind: "trade",
    status: "open", moderation: "approved",
    createdAt: "2025-12-15", views: 12,
    photo: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=900&q=70&auto=format",
  },
  {
    id: "L-006", owner: "u_8814", ownerName: "Ana Marini",
    title: "Sillón de cuero Eames replica",
    desc: "Sillón estilo lounge chair, cuero negro, base de palisandro. Estado bueno, marcas leves de uso. No envío, retiro en CABA.",
    region: "AR · Buenos Aires", currency: "ARS",
    rangeMin: 280000, rangeMax: 360000, kind: "sell",
    status: "draft", moderation: "pending",
    createdAt: "2025-12-17", views: 0,
    photo: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=900&q=70&auto=format",
  },
  {
    id: "L-007", owner: "u_3320", ownerName: "Marina Souza",
    title: "Tênis Nike Air Max 90 — tam. 42",
    desc: "Pouco uso, comprado em viagem aos EUA. Cor branco/cinza. Caixa original. Não negocio abaixo do piso.",
    region: "BR · Rio de Janeiro", currency: "BRL",
    rangeMin: 380, rangeMax: 540, kind: "sell",
    status: "open", moderation: "approved",
    createdAt: "2025-12-16", views: 41,
    photo: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=70&auto=format",
  },
  {
    id: "L-008", owner: "u_5511", ownerName: "Diego Faria",
    title: "Vintage Leica M3 — body only",
    desc: "1958 model, fully working, recent CLA from Don's Cameras Brooklyn. Light brassing, character. Strap not included.",
    region: "US · Brooklyn, NY", currency: "USD",
    rangeMin: 1400, rangeMax: 1900, kind: "sell",
    status: "open", moderation: "approved",
    createdAt: "2025-12-14", views: 218,
    photo: "https://images.unsplash.com/photo-1606986628253-49e09a91c75f?w=900&q=70&auto=format",
  },
  {
    id: "L-009", owner: "u_7740", ownerName: "Isabella Reyes",
    title: "Vinilos jazz 60s — lote x14",
    desc: "Coltrane, Miles Davis, Mingus, Bill Evans. Algunos primeras prensas. Estado VG+ a NM. Vendo el lote completo.",
    region: "UY · Montevideo", currency: "USD",
    rangeMin: 280, rangeMax: 380, kind: "sell",
    status: "open", moderation: "flagged",
    createdAt: "2025-12-13", views: 34,
    photo: "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=900&q=70&auto=format",
  },
  {
    id: "L-010", owner: "u_9921", ownerName: "Tomás Greco",
    title: "iPad Pro 12.9 M2 — 256GB",
    desc: "Color space gray, con Apple Pencil 2da gen y funda Smart Folio. Garantía Apple Care hasta 2026. Sin marcas.",
    region: "US · Austin, TX", currency: "USD",
    rangeMin: 850, rangeMax: 1100, kind: "sell",
    status: "open", moderation: "approved",
    createdAt: "2025-12-11", views: 167,
    photo: "https://images.unsplash.com/photo-1561154464-82e9adf32764?w=900&q=70&auto=format",
  },
];

// Mock matches — span the state machine
const OTTO_MATCHES = [
  {
    id: "M-921",
    listingId: "L-001", listingTitle: "Polaroid SX-70 Land Camera",
    counterparty: "Bob Lerner", counterpartyId: "u_8830",
    role: "seller",
    score: 92,
    proposedPrice: 295, currency: "USD",
    status: "accepted_both",
    transactionId: "T-12",
    proposedAt: "2025-12-15 11:24",
    reasoning: "eBay sold-comps median $310 last 90 days. Buyer rated 4.9 across 12 deals. Within Ana's range and Bob's budget.",
    timeline: [
      { state: "proposed", at: "2025-12-15 11:24", actor: "otto" },
      { state: "accepted_a", at: "2025-12-15 11:51", actor: "Bob (buyer)" },
      { state: "accepted_b", at: "2025-12-15 14:02", actor: "Ana (seller, you)" },
      { state: "accepted_both", at: "2025-12-15 14:02", actor: "system" },
      { state: "transaction_created", at: "2025-12-15 14:02", actor: "system" },
    ],
  },
  {
    id: "M-918",
    listingId: "L-005", listingTitle: "Monitor LG UltraWide 34\"",
    counterparty: "Camila Vidal", counterpartyId: "u_4480",
    role: "seller",
    score: 78,
    proposedPrice: 360, currency: "USD",
    status: "accepted_a",
    proposedAt: "2025-12-17 08:11",
    reasoning: "Ofrece tablet Wacom Cintiq Pro 16 + USD 80 en efectivo. Wacom retail USD 280 usado, dentro de tu rango total.",
    timeline: [
      { state: "proposed", at: "2025-12-17 08:11", actor: "otto" },
      { state: "accepted_a", at: "2025-12-17 09:22", actor: "Camila (buyer)" },
    ],
  },
  {
    id: "M-915",
    listingId: "L-005", listingTitle: "Monitor LG UltraWide 34\"",
    counterparty: "Rafael Souza", counterpartyId: "u_6610",
    role: "seller",
    score: 64,
    proposedPrice: 340, currency: "USD",
    status: "proposed",
    proposedAt: "2025-12-18 06:48",
    reasoning: "Comprador con 2 trades cerrados. Rango ofrecido USD 300-380, score reducido por reputación corta.",
    timeline: [
      { state: "proposed", at: "2025-12-18 06:48", actor: "otto" },
    ],
  },
  {
    id: "M-902",
    listingId: "L-008", listingTitle: "Vintage Leica M3",
    counterparty: "Diego Faria", counterpartyId: "u_5511",
    role: "buyer",
    score: 88,
    proposedPrice: 1650, currency: "USD",
    status: "accepted_both",
    transactionId: "T-09",
    proposedAt: "2025-12-14 19:33",
    reasoning: "Listing dentro de tu rango. Vendedor 4.7/5 con 18 trades. CLA reciente verificada por shop público.",
    timeline: [
      { state: "proposed", at: "2025-12-14 19:33", actor: "otto" },
      { state: "accepted_a", at: "2025-12-14 20:01", actor: "Ana (buyer, you)" },
      { state: "accepted_b", at: "2025-12-15 02:47", actor: "Diego (seller)" },
      { state: "accepted_both", at: "2025-12-15 02:47", actor: "system" },
      { state: "transaction_created", at: "2025-12-15 02:47", actor: "system" },
    ],
    reviewLeft: false,
  },
  {
    id: "M-887",
    listingId: "L-099", listingTitle: "Cafetera La Marzocco Linea Mini",
    counterparty: "Joaquín Pérez", counterpartyId: "u_2202",
    role: "buyer",
    score: 71,
    proposedPrice: 5400, currency: "USD",
    status: "rejected",
    proposedAt: "2025-12-10 13:20",
    rejectedAt: "2025-12-11 09:00",
    rejectedBy: "Ana (you)",
    reasoning: "Por encima de tu rango por USD 400. Vendedor no flexibilizó.",
    timeline: [
      { state: "proposed", at: "2025-12-10 13:20", actor: "otto" },
      { state: "rejected", at: "2025-12-11 09:00", actor: "Ana (buyer, you)" },
    ],
  },
];

const OTTO_REVIEWS = {
  given: [
    { to: "Bob Lerner", forMatch: "M-921", stars: 5, text: "Comunicación clara, encuentro puntual, pago como pactado.", at: "2025-12-16" },
    { to: "Camila Vidal", forMatch: "M-918", stars: 4, text: "Buen trato, demoró un par de días en confirmar el encuentro.", at: "2025-12-01" },
  ],
  received: [
    { from: "Bob Lerner", forMatch: "M-921", stars: 5, text: "Cámara tal cual descripta. Ana respondió rápido a las preguntas.", at: "2025-12-16" },
    { from: "Diego Faria", forMatch: "M-902", stars: 5, text: "Smooth deal. Asked smart questions, paid on time.", at: "2025-12-15" },
    { from: "Marina Souza", forMatch: "M-840", stars: 4, text: "Trato bom, demorou um pouco no encontro mas tudo certo.", at: "2025-11-22" },
  ],
};

// ── NAV partial ────────────────────────────────────────────
function ottoRenderNav(activePage = "") {
  const u = ottoUser();
  const loggedIn = ottoIsLoggedIn();

  const links = [
    { href: "listings.html", id: "listings", label: "Listings", auth: true },
    { href: "matches.html", id: "matches", label: "Matches", auth: true },
    { href: "how-it-works.html", id: "how", label: "Cómo funciona" },
  ];

  const linkHtml = links
    .filter(l => !l.auth || loggedIn)
    .map(l => `<a href="${l.href}" class="${l.id === activePage ? "active" : ""}">${l.label}</a>`)
    .join("");

  const langHtml = `
    <div class="lang">
      <button class="active" data-l="es">ES</button>
      <button data-l="pt">PT</button>
      <button data-l="en">EN</button>
    </div>`;

  const userHtml = loggedIn
    ? `<a href="profile.html" class="user-chip ${activePage === "profile" ? "active" : ""}">
        <span class="av">${(u.displayName || "?")[0]}</span>
        <span><span class="name">${u.displayName.split(" ")[0]}</span><br/><span class="role">${u.role.toUpperCase()}</span></span>
      </a>`
    : `<a href="login.html" class="btn ghost sm">Login</a>
       <a href="register.html" class="btn sm">Registro</a>`;

  return `
    <nav class="app-nav">
      <div class="inner">
        <a href="${loggedIn ? "listings.html" : "../Otto Noir Landing.html"}" class="brand">otto</a>
        <button class="hamburger" id="hamburger" aria-label="Menú"><span></span><span></span><span></span></button>
        <div class="nav-links" id="navLinks">
          ${linkHtml}
          ${langHtml}
          ${userHtml}
        </div>
      </div>
    </nav>
  `;
}

function ottoMountNav(activePage = "") {
  const slot = document.getElementById("nav-slot");
  if (!slot) return;
  slot.outerHTML = ottoRenderNav(activePage);

  // hamburger behavior
  const ham = document.getElementById("hamburger");
  const lnk = document.getElementById("navLinks");
  if (ham && lnk) {
    ham.addEventListener("click", () => {
      const open = ham.classList.toggle("open");
      lnk.classList.toggle("open", open);
      document.body.classList.toggle("nav-open", open);
    });
  }
  // lang toggle (decorative)
  document.querySelectorAll(".lang button").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".lang button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
    });
  });
}

// ── helpers ────────────────────────────────────────────────
function fmt(n, cur) {
  return new Intl.NumberFormat("es-AR").format(n) + " " + (cur || "");
}
function relTime(d) {
  // simple: just return the string
  return d;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ── banner injection ───────────────────────────────────────
function ottoBanner({ kind = "error", stamp = "ERROR", title, text }) {
  const slot = document.getElementById("banner-slot");
  if (!slot) return;
  slot.innerHTML = `
    <div class="banner ${kind === "success" ? "success" : kind === "warn" ? "warn" : ""}">
      <div class="banner-stamp">${stamp}</div>
      <div class="banner-body">
        <div class="banner-title">${escapeHtml(title)}</div>
        <div class="banner-text">${text}</div>
      </div>
      <button class="banner-close" onclick="this.parentElement.remove()">×</button>
    </div>
  `;
}

// ── modal helpers ──────────────────────────────────────────
function ottoOpenModal(id) {
  document.getElementById(id)?.classList.add("open");
  document.body.style.overflow = "hidden";
}
function ottoCloseModal(id) {
  document.getElementById(id)?.classList.remove("open");
  document.body.style.overflow = "";
}
document.addEventListener("click", (e) => {
  if (e.target.classList?.contains("modal-backdrop")) {
    e.target.classList.remove("open");
    document.body.style.overflow = "";
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-backdrop.open").forEach(m => m.classList.remove("open"));
    document.body.style.overflow = "";
  }
});
