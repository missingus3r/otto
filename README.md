# otto

Agent-mediated marketplace. Users list items with a price range (or item-for-item swap). A **single background LLM** scans every open listing, looks up market prices, and proposes deals to users. Nothing closes without an explicit one-tap human approval.

## Why this design

Inspired by Anthropic's [Project Deal](https://www.anthropic.com/features/project-deal). They ran a closed Claude-agent marketplace internally and noticed two things:

1. Agent-mediated commerce *works* — 186 deals in a week between 69 employees.
2. **Stronger LLMs got better deals while weaker-LLM users never noticed.**

The asymmetry from #2 is fatal in a public marketplace. So **otto inverts the architecture**: instead of every user running their own agent, the platform runs **one** model for everybody. No premium tier, no skill gap, equal terms. The user keeps full veto power on every proposed deal.

## Architecture (high level)

```
[user device] ──▶ [Express + EJS app] ──▶ [MongoDB]
                          ▲                    ▲
                          │                    │
                  ┌───────┴───────┐    ┌───────┴───────┐
                  │  Web routes   │    │ Agent service │
                  │  /listings    │    │  (cron 5min)  │
                  │  /matches     │    │  scans open   │
                  │  /admin       │    │  listings,    │
                  └───────────────┘    │  calls LLM,   │
                                       │  proposes     │
                                       │  matches      │
                                       └───────────────┘
                                               │
                                               ▼
                                        [OpenAI API]
                                        (gpt-4o-mini)
```

## Stack

- **Backend**: Node 20+, Express 4, Mongoose 8
- **Templates**: EJS (mobile-first, responsive)
- **DB**: MongoDB Atlas
- **Sessions**: connect-mongo + express-session
- **i18n**: ES / PT / EN (JSON files + middleware)
- **Agent**: node-cron + OpenAI SDK (single model, configurable)
- **Auth**: bcryptjs + sessions (basic email/password)

## Roles

- **user** — list items, browse, accept/reject proposed matches, complete deals
- **admin** — see every listing, user, transaction; pause/resume the agent; ledger view

## Running locally

```bash
git clone https://github.com/missingus3r/otto.git
cd otto
cp .env.example .env
# edit .env: set MONGO_URI, OPENAI_API_KEY, SESSION_SECRET
npm install
npm run dev
```

The server starts on `http://localhost:3000`. First boot creates an `admin` user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if no admin exists.

## The ledger

Every transaction (listing → match → accepted → completed) writes an immutable row to a ledger collection. The ledger is read-only from the app side and visible only to admin. It's the audit trail for "did the agent do its job fairly?".

## Roadmap

### v0.1 — skeleton
- [x] Skeleton, models, auth, basic CRUD on listings
- [x] Single-LLM agent with 5-min match cycle

### v0.2 — done
- [x] Image uploads (multer + thumbnails)
- [x] Reputation (reviews per transaction, aggregate score)
- [x] Push notifications (web push) on new match
- [x] Anti-spam + listing moderation queue
- [x] Public price baseline scraping (MercadoLibre / OLX) for the agent
- [x] i18n (ES/PT/EN) + middleware
- [x] Mark transaction complete (two-party confirm), cancel pending tx
- [x] Edit listing (owner, while open)
- [x] Password reset by email + email verification at registration
- [x] Auto-expire matches + reopen orphan listings
- [x] Direct chat between match parties (long-poll)
- [x] CSRF tokens on every state-changing form
- [x] Counter-offer on match
- [x] Temporary ban (admin)
- [x] Account deletion (GDPR-friendly, anonymize after grace period)
- [x] Geolocation (city/country) + agent prefers same-city matches
- [x] Manual search & filters (text, type, category, price, city)
- [x] Multiple photos per listing (gallery, max 6)
- [x] Structured categories (electronica/hogar/.../otros) — hard rule
- [x] NSFW image moderation (OpenAI moderation API, fallback no-op)
- [x] Pagination in admin tables
- [x] Push notification preferences (granular per kind)
- [x] PWA manifest + service worker (network-first cache)
- [x] Cookie consent banner + Terms + Privacy pages
- [x] Sitemap + robots.txt
- [x] Rate limit on POST /listings
- [x] Change password from profile / Change email with verification
- [x] Moderation appeal flow
- [x] More languages: FR + IT
- [x] Currency formatting via Intl.NumberFormat
- [x] Admin activity logs

### v0.3 — candidates
- [ ] Real escrow / payment integration (Mercado Pago, Stripe)
- [ ] In-person meetup safety: shared location pin (one-time)
- [ ] Saved searches → push when a new match shows up
- [ ] Native iOS/Android wrappers
- [ ] User-to-user blocking
- [ ] Two-factor authentication (TOTP)
- [ ] Webhooks for partner integrations
- [ ] LLM-driven duplicate detection across listings
- [ ] Per-listing analytics for owner (views, match attempts)
- [ ] Per-category sub-attributes (size, year, condition)

## License

MIT.
