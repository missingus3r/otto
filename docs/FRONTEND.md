# otto — frontend / app pages reference

Documentación funcional de las páginas que ve el usuario logueado: campos de cada form, qué hace cada acción, qué valida, qué errores devuelve, y cómo navega.

> Las rutas viven en `src/routes/*.js` y los templates en `views/app/*.ejs` (usuario) y `views/admin/*.ejs` (admin). Este doc cubre el lado usuario (admin tiene su propio reference más adelante).

---

## Auth requerida en todas

Todas estas páginas pasan por el middleware `requireAuth`:
- Si no hay `req.session.userId` → redirige a `/auth/login` con flash.
- Si la sesión existe pero el user no se encuentra (banned/borrado) → cierra sesión y redirige.

---

## `/listings` — Mis publicaciones + Explorar

### Qué hace
Página de aterrizaje del usuario logueado. Dos secciones:

1. **"Mis publicaciones"** (`mine`):
   - Trae todas las listings del user (`Listing.find({ userId: req.user._id })`)
   - Ordenadas por `createdAt` desc
   - Sin filtro por status — incluye `open / matched / closed / cancelled`
   - Cada card muestra: thumbnail (prefiere `thumbPath` → fallback `photoPath`), título, type pill (sell/swap/buy), rango (priceMin–priceMax + currency), status pill
   - Click en card → `/listings/:id`

2. **"Explorar"** (`explore`):
   - Listings de **otros usuarios** (`userId: { $ne: req.user._id }`)
   - Solo `status: 'open'` y `moderationStatus: 'approved'`
   - Limit 50 (orden createdAt desc)
   - Las listings auto-flagged o pendientes de moderación NO aparecen acá
   - Misma card layout

### Errores
- Cualquier error de DB → `next(err)` → renderiza `views/error.ejs` con status 500

### Vista
- `views/app/home.ejs`
- Layout: hero pequeño, sección "Mis", grid de cards, sección "Explorar", grid de cards
- Botón flotante / link superior "Nueva publicación" → `/listings/new`

---

## `/listings/new` — Nueva publicación (form)

### Campos del form
| Campo | Tipo | Validación | Notas |
|---|---|---|---|
| `title` | text | required, max 200 chars (post-sanitize) | Sanitizado con sanitize-html (strip tags) |
| `description` | textarea | optional | Sanitizado |
| `type` | radio | enum `sell` / `swap` / `buy`, default `sell` | Si llega otro valor → `sell` |
| `priceMin` | number | parseFloat ≥ 0 | NaN → 0 |
| `priceMax` | number | parseFloat ≥ priceMin | Si < priceMin → se iguala a priceMin |
| `currency` | text | uppercase, max 6 chars | Default `UYU` |
| `swapForDescription` | textarea | solo si `type=swap` | Si type ≠ swap → vacío |
| `photo` | file | image (png/jpe?g/webp/gif), max 5MB | multer rechaza otros mimetypes |

### Flujo POST `/listings`
1. Multer guarda la imagen en `public/uploads/<timestamp>-<hex8>.<ext>` (filename hasheado, no usa el nombre original).
2. Se sanitizan title/description/swapForDescription.
3. Se valida `title` no vacío → si vacío: 400 + re-render del form con `error: 'Title required'`.
4. **Auto-flag (moderación)**: `runAutoFlag({title, description, priceMin, priceMax})` chequea:
   - Keywords spam (viagra, casino, escort, btc multiply, etc) en title o description (case-insensitive)
   - `priceMax > priceMin * 50` → rango sospechoso
   - Si flagged → `moderationStatus: 'pending'`, `flagReason: 'auto: <reason>'`
   - Si no → `moderationStatus: 'approved'`
5. Crea el `Listing` doc.
6. **Thumbnail (fire-and-forget)**: si hay `photo`, sharp genera `600×600 cover webp` en `public/uploads/thumbs/<filename>.webp`. NO bloquea la response. Cuando termina, hace `Listing.updateOne($set: thumbPath)`.
7. Redirect → `/listings`.

### Errores
- Multer rechaza el file (mimetype/size) → llega al handler como error → `views/error.ejs` 500. **Mejorable** (ahora no avisa "imagen muy grande" en el form, solo crashea la response).
- Title vacío → 400 con re-render del mismo form mostrando el mensaje en `<div class="error-msg">`.
- DB falla → `next(err)`.

### Vista
- `views/app/new-listing.ejs`
- Form `enctype="multipart/form-data"` apuntando a `POST /listings`
- Radio group para type, fields condicionales (swapForDescription solo si swap, lo maneja JS o se manda igual y se ignora server-side)

---

## `/listings/:id` — Detalle de publicación

### Qué hace
- Trae el listing con `populate('userId', 'displayName email')`
- Si no existe → 404
- Lookup de **reputación del seller** vía `User.reputationFor(ownerId)` → `{avgRating, count}` (en best-effort try/catch — si falla, sigue con `{null, 0}`)
- Trae todos los `Match` involucrando este listing (como A o B), ordenados por createdAt desc

### Vista (`views/app/listing-detail.ejs`)
- Foto grande (thumbPath → fallback photoPath)
- Título, type pill, status pill, currency + rango
- Bloque seller: displayName + reputation pill ("★ 4.5 (12 reseñas)")
- Description y swapForDescription si aplica
- Lista de matches (con score + rationale + status)
- Si el listing es del user actual: botón "Cancelar publicación" (POST `/listings/:id/cancel`)
- Si el listing es de OTRO user: form "Reportar" (POST `/listings/:id/flag` + textarea reason)

### Acciones
- `POST /listings/:id/cancel`:
  - Solo el dueño (chequea `userId === req.user._id`, sino 403)
  - Solo si status `open` o `matched` → cambia a `cancelled`
  - Redirect `/listings`
- `POST /listings/:id/flag`:
  - Cualquier user logueado
  - Idempotente: si ya está flagged, no-op
  - Setea `flagged=true`, `flaggedAt=now`, `flagReason='user:<userId>:<reason 200 chars>'`
  - Redirect al detalle

### Errores
- 404 si listing no existe
- 403 si intentás cancelar listing ajeno

---

## `/matches` — Inbox de matches

### Qué hace
1. Trae **todas** las listings del user → arma array de IDs
2. Trae todos los `Match` donde `listingA` o `listingB` esté en esos IDs, ordenados desc
3. Populate de listingA y listingB (para mostrar título/foto/type)
4. Para cada Match, busca su `Transaction` correspondiente (si existe)
5. Para cada Transaction completed, chequea si el user actual ya dejó Review (Set `reviewedTxIds`)
6. Construye un `reviewInfo` map: `{ matchId → { transactionId, completed, reviewed } }`

### Vista (`views/app/matches.ejs`)
Cada match-card muestra:
- Score grande en serif italic amber (Bodoni Moda)
- Header: "Tu publicación X ↔ Su publicación Y"
- **Rationale del agente** en blockquote italic amber (lo que el LLM escribió justificando el match)
- Precio propuesto + currency
- Status pill: `proposed / accepted_a / accepted_b / accepted_both / rejected / expired`
- Botones según status:
  - `proposed` o el otro lado ya aceptó: **Aceptar** + **Rechazar**
  - `accepted_both`: solo info "Cerrado, transacción creada"
  - `rejected` / `expired`: solo info
- Si la transacción está `completed` y el user no dejó review aún: botón "Dejar reseña" → `/reviews/new/:transactionId`

### Acciones
- `POST /matches/:id/accept`:
  - Verifica que el user es dueño de listingA O listingB (sino 403)
  - State machine:
    - `proposed` + ownerA acepta → `accepted_a`
    - `proposed` + ownerB acepta → `accepted_b`
    - `accepted_b` + ownerA acepta → `accepted_both`
    - `accepted_a` + ownerB acepta → `accepted_both`
  - Si llega a `accepted_both`:
    - Determina buyerId/sellerId (sell+buy → claro; swap+swap → arbitrario A=buyer, B=seller)
    - Crea `Transaction` con status `pending`, `finalPrice = match.proposedPrice`
    - Escribe `LedgerEntry` action `match_accepted` (append-only)
    - Cierra ambos listings (`status: 'closed'`)
  - Si NO llegó a accepted_both:
    - Marca ambos listings como `matched` (si estaban `open`) — para que no aparezcan en explore
  - Redirect `/matches`

- `POST /matches/:id/reject`:
  - Cualquier dueño puede rechazar
  - Match → `rejected`
  - Si los listings estaban `matched` (no `closed`), vuelven a `open`
  - Redirect `/matches`

### Estados de Match
| Status | Significado |
|---|---|
| `proposed` | El agente lo creó, ninguna parte vio/aceptó aún |
| `accepted_a` | Solo el dueño de listingA aceptó |
| `accepted_b` | Solo el dueño de listingB aceptó |
| `accepted_both` | Ambos aceptaron → Transaction creada, listings closed |
| `rejected` | Alguno rechazó |
| `expired` | Pasaron las 48h sin acción (lo marca el agente en próximo run) |

### Errores
- 404 si match no existe
- 403 si no sos dueño de ninguno de los dos listings

---

## `/profile` — Perfil del usuario

### GET `/profile`
Trae:
- `listingsCount` — total de listings del user (incluye todos los status)
- `dealsCount` — Transactions completed donde es buyer o seller
- `reputation` — `User.reputationFor(req.user._id)` → `{avgRating, count}` agregado de todas las Reviews recibidas
- `reviewsReceived` — últimas 20 Reviews que le dejaron, populated con quien la dejó
- `reviewsLeft` — últimas 20 que él dejó a otros
- Flag `saved` (true si vino de `?saved=1` post-update) → muestra flash "Guardado"

### Vista (`views/app/profile.ejs`)
- Header con email + displayName
- Tile reputación: estrella + avg + count ("★ 4.7 (23 reseñas)")
- Stats: listings totales · deals completados
- Botón **"Activar notificaciones"** → llama JS `enableNotifications()` (registra service worker, pide permiso, suscribe a push)
- Form de edición:
  - `displayName` text (max 80)
  - `lang` select ES/PT/EN
- Sección "Reseñas recibidas" (lista con star + comment + autor)
- Sección "Reseñas que dejaste"

### POST `/profile`
- Sanitiza `displayName` (max 80)
- Valida `lang` ∈ [es, pt, en], si no → mantiene el actual
- Updatea User
- Setea `req.session.lang` (para que el i18n middleware lo tome inmediatamente)
- Redirect `/profile?saved=1`

### Errores
- DB falla → `next(err)`

---

## Feature transversal: idioma (i18n)

Cada página renderiza en uno de 3 idiomas (es/pt/en). La resolución por request:
1. `?lang=xx` query param
2. `req.session.lang` (seteado al login o al guardar perfil)
3. `req.user.lang` (preferencia persistida del User model)
4. Header `Accept-Language` del browser
5. `process.env.DEFAULT_LANG` (es)

`res.locals.t(key)` está disponible en todas las vistas.

---

## Feature transversal: Push notifications

- En `/profile` aparece "Activar notificaciones".
- JS: `public/js/push.js` — registra `/sw.js`, fetch `/push/key` para VAPID public key, `pushManager.subscribe()`, POST `/push/subscribe` con `{ endpoint, keys: { p256dh, auth } }`.
- El service worker (`public/sw.js`) escucha eventos `push`, parsea `{title, body, url}` y muestra notificación. Click → abre `url`.
- Cuando el agente crea un Match, llama `notifyUser(userId, payload)` para ambas partes. **El payload usa el lang del recipient** (resuelto via `User.findById().select('lang')`).
- Si la suscripción ya no es válida (410/404 de push service), se borra automáticamente.

---

## Feature transversal: Manejo de errores global

- 404: cualquier ruta no matcheada renderiza `views/error.ejs` con status 404 + mensaje del i18n key `error.notFound`.
- 500: el error handler global captura cualquier exception, hace `console.error('[error]', err)` y renderiza `views/error.ejs` con el mensaje del error (o `error.serverError`).
- En vistas de form (login, register, new-listing, etc.), errores específicos se renderizan inline en `<div class="error-msg">` con border-left rojo.

---

## Lo que NO existe todavía (out of scope hoy)

- Editar listing existente (solo se puede cancelar)
- Borrar review
- Recover password / reset
- Email verification
- Image gallery (solo 1 foto por listing)
- Marcar Transaction como `completed` (queda en `pending` para siempre, lo cual bloquea las reviews — TODO)
- Push notification preference toggles (todo o nada)
- Mensajería entre usuarios (el agente media, los humanos no chatean)
