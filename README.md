# dealr

Agent-mediated marketplace. Users list items with a price range (or item-for-item swap). A **single background LLM** scans every open listing, looks up market prices, and proposes deals to users. Nothing closes without an explicit one-tap human approval.

## Why this design

Inspired by Anthropic's [Project Deal](https://www.anthropic.com/features/project-deal). They ran a closed Claude-agent marketplace internally and noticed two things:

1. Agent-mediated commerce *works* — 186 deals in a week between 69 employees.
2. **Stronger LLMs got better deals while weaker-LLM users never noticed.**

The asymmetry from #2 is fatal in a public marketplace. So **dealr inverts the architecture**: instead of every user running their own agent, the platform runs **one** model for everybody. No premium tier, no skill gap, equal terms. The user keeps full veto power on every proposed deal.

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
git clone https://github.com/missingus3r/dealr.git
cd dealr
cp .env.example .env
# edit .env: set MONGO_URI, OPENAI_API_KEY, SESSION_SECRET
npm install
npm run dev
```

The server starts on `http://localhost:3000`. First boot creates an `admin` user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if no admin exists.

## The ledger

Every transaction (listing → match → accepted → completed) writes an immutable row to a ledger collection. The ledger is read-only from the app side and visible only to admin. It's the audit trail for "did the agent do its job fairly?".

## Roadmap

- [x] Skeleton, models, auth, basic CRUD on listings
- [x] Single-LLM agent with 5-min match cycle
- [ ] Image uploads (multer + thumbnails)
- [ ] Reputation / escrow (v0.2)
- [ ] Push notifications (web push) on new match
- [ ] Anti-spam + listing moderation queue
- [ ] Public price baseline scraping (MercadoLibre / OLX) for the agent

## License

MIT.
