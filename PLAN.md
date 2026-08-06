# memoney — TrueLayer Bank Overview App

Personal ("me money") dashboard to view an overview of all bank accounts visible
through **TrueLayer Data API v3**. Web MVP first (Next.js), Expo/RN mobile later.

## Workspace state (what already exists)

- `memoney/` project name. Next.js 16.3 app scaffolded at repo root with TypeScript + Tailwind + App Router.
- `.devcontainer/DOCKERFILE` — Node 22, `expo` + `eas-cli` global, ports
  8081/19000–19002 forwarded. Set up for the *future* Expo step.
- `ec512-private-key.pem` / `ec512-public-key.pem` — **EC P-521 keys**
  (signature alg **ES512**). Verified JWT signing works via `node:crypto.createPrivateKey()`
  + jose `SignJWT`. However, TrueLayer sandbox auth (`/connect/token`) does **NOT**
  accept `client_assertion` JWT — it only accepts `client_secret`. The PEM keys are kept
  as a fallback but are not needed for sandbox auth.

## Key facts about TrueLayer Data API v3 (2026 docs)

- **Latest/current**: use v3, not the legacy "connect-an-account" page (that
  example is the old Verification API: `authorization_code` + `client_id`/
  `client_secret`). v3 uses `client_credentials` + a `Connection-Id` model.
- **UK ONLY** for v3 Data API (`console.truelayer.com/providers` to confirm
  your banks are supported). Non-UK accounts → fall back to Data API v1.
- **Server-side required.** Bearer app token via:
  `POST https://auth.truelayer-sandbox.com/connect/token` with
  `grant_type=client_credentials` and `client_secret` auth. The `scope` param
  takes individual space-separated scope names (e.g. `"info accounts transactions
  connections:create"`), **NOT** `"data"` (which returns `invalid_scope`). JWT
  `client_assertion` (ES512) returns `invalid_client` — not supported by the
  sandbox auth server. If `TRUELAYER_CLIENT_SECRET` is empty, the client falls
  back to JWT `client_assertion` (for enterprise accounts that register a
  signing key). Private key must NEVER ship to a browser/Expo bundle → backend
  is mandatory.
- **Base URLs**: `https://api.truelayer.com` (prod),
  `https://api.truelayer-sandbox.com` (sandbox, mock banks — use for dev).
- **Connection model**:
  1. `POST /v3/data-connections` (`scopes: info, accounts, transactions`)
     → returns `link_uri` + `connection_id`.
  2. Frontend opens `link_uri` (browser tab/popup). Non-regulated clients
     **must** use TrueLayer's ready-made bank picker/UI.
  3. User returns to your `redirect_uri`; `connection.authorized` webhook
     fires (verify signature) → persist `connection_id`.
  4. `GET /v3/connected-accounts` with header `Connection-Id: <id>`
     → accounts + balances (filter `type=account|card`, max 50/page).
  5. Transactions are **async**: request → completion webhook →
     `GET /v3/connected-accounts/{account_id}/transactions/requests/{request_id}`.
- **Webhooks**: connection events + transactions-request events; verify
  `Webhook-Signature` header.
- Sandbox free; production may require approval/pricing. Tokens cached ~1h;
  no per-user refresh tokens to manage (connections re-auth on bank side).

## Architecture decision

**Next.js (App Router) backend + web, Expo/RN mobile later.**

- API routes = backend (proxy to TrueLayer, host webhooks, keep signing key
  server-side) + web frontend in one repo. Deploys easily (Vercel/Render).
- Same REST API serves the future Expo app → no rework.
- Defer splitting a dedicated Node service until the mobile app is actively
  built (simpler for a personal project).
- Data: SQLite locally → Postgres on deploy. ORM: Prisma (or Drizzle).
- The devcontainer's pre-installed Expo/EAS is for the Phase 4 mobile step.

> Why not Expo-only (no backend)? Impossible: v3's `client_credentials`+signing
> key flow has no safe store in a mobile bundle. A backend is required.

## Data model (Prisma sketch)

- `Connection` (id, providerId, linkUri, status
  pending|authorized|failed|deleted, lastAuthorizedAt, scopes)
- `Account` (id, connectionId, type account|card, name, currency,
  iban/sortCode, balance, availableBalance, lastUpdated)
- `Transaction` (id, accountId, bookedAt, description, amount, currency,
  category, merchantName)
- `RefreshLog` (lastFetchAt, status) — for the daily poller.

## v3 API flow (core to implement)

1. Auth: POST `…/connect/token` with `client_secret` auth → app
   bearer token (cached ~1h). Scope: `"info accounts transactions connections:create"`.
2. Start connection: `POST /v3/data-connections` → `link_uri`.
3. Frontend opens `link_uri`; user picks bank, consents, logs in, returns to
   your `redirect_uri`.
4. Webhook `connection.authorized` (signature-verified) → persist
   `connection_id`.
5. `GET /v3/connected-accounts` (Connection-Id header) → accounts + balances.
6. Transactions: async request → completion webhook →
   `GET /v3/connected-accounts/{account_id}/transactions/requests/{request_id}`.
7. Background cron (node-cron) re-runs steps 5–6 nightly per authorized
   connection.

## Implementation plan (milestones)

### Phase 0 — Scaffold + secrets  ✅ DONE
- `npx create-next-app@latest` (TS + Tailwind + App Router) in repo root; updated devcontainer
  `postCreateCommand` to `npm install && npx prisma generate`.
- Prisma schema (4 tables) + `.env` / `.env.example` for
  `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`, signing-key path/env, `TRUELAYER_WEBHOOK_SECRET`, DB URL.
  Sandbox `client_id` = `sandbox-memoney-2eb02d` (confirmed working).
  `TRUELAYER_CLIENT_SECRET` set from `sandbox-memoney-2eb02d-secret-*.txt` in repo root.
- Sandbox app in Console: client_id + client_secret verified (token fetches
  successfully). **Data API v3 product still needs to be enabled** in Console
  (currently 403 on `/v3/data-connections`).
- **Prisma 7 note:** requires `@prisma/adapter-libsql` (SQLite adapter);
  `datasource db` in `schema.prisma` no longer takes `url` (moved to
  `prisma.config.ts`). ES512 PEM key is SEC1 format — parsed via
  `node:crypto createPrivateKey()` (supports both SEC1 and PKCS#8).

### Phase 1 — TrueLayer client + connection flow  ✅ CODE DONE
- `lib/truelayer.ts`: token fetch+cache (`client_secret` auth; JWT `client_assertion` as fallback),
  connection create/status, accounts fetch, transactions request+fetch, webhook signature
  verification (HMAC-SHA256, supports both raw and timestamped `t=…,v1=…` format).
- API routes: `/api/auth/connect` (→ `link_uri`), `/api/webhooks/truelayer`
  (signature-verified), `/api/data/accounts`, `/api/data/connections`,
  `/api/data/transactions`, `/api/data/refresh`.
- Frontend: dashboard page (server-rendered data + client interactivity),
  connect button, refresh, callback page.
- Seed: connect one sandbox bank end-to-end; store `connection_id`.  ⏳ **blocked**: 403 Forbidden on `/v3/data-connections` — sandbox app needs Data API v3 product enabled in TrueLayer Console.

### Phase 1.5 — Trading 212 integration ✅ DONE
- `lib/trading212-types.ts`: All TypeScript types for T212 API responses.
- `lib/trading212.ts`: API client with HTTP Basic auth (api_key:api_secret), rate limiting (1 req/5s), and 30s response caching. Supports all endpoints: account summary, positions, transactions, dividends, orders, instruments, exchanges.
- API routes: `/api/trading212/account`, `/api/trading212/positions`, `/api/trading212/transactions`, `/api/trading212/dividends`, `/api/trading212/data` (combined).
- Dashboard updated: Net Worth section shows combined bank + Trading 212 totals. Trading 212 section shows account summary, positions, and recent transactions.
- Demo account verified: £5,000 cash, £0 investments, 1 deposit transaction.

### Phase 1.75 — Salt Edge integration ✅ DONE
- `lib/saltedge-types.ts`: TypeScript types for Salt Edge v6 API (Country, Provider, ProviderShow, Customer, Connection, ConnectionShow, Account, Transaction, Callback, PaginatedResponse).
- `lib/saltedge.ts`: API client with HTTP Basic auth (`base64(app_id:api_key)`), concurrency limiter, request helper. Methods: createCustomer, listCustomers, listCountries, listProviders, getProvider, createConnection, listConnections, getConnection, reconnectConnection, refreshConnection, listAccounts, getAccount, listTransactions, revokeConsent.
- API routes: `/api/saltedge/providers` (GET — list UK banks), `/api/saltedge/connect` (POST — create customer + connection → return redirect URL), `/api/saltedge/callback` (POST — webhook handler, syncs accounts + transactions to DB), `/api/saltedge/accounts` (GET), `/api/saltedge/transactions` (GET).
- Schema: Added `source: ConnectionSource` enum to Prisma `Connection` model to distinguish TRUELAYER vs SALTEDGE connections. Migration applied.
- Dashboard: Added UK bank dropdown (Monzo, Revolut, HSBC, Barclays, Starling, TSB, NatWest, Lloyds, Santander) + "Connect via Open Banking" button.
- `.env.example`: Added SALTEDGE_APP_ID, SALTEDGE_API_KEY, SALTEDGE_API_BASE, SALTEDGE_CALLBACK_URL.
- **Credentials pending**: Set SALTEDGE_APP_ID + SALTEDGE_API_KEY in `.env` to test against real API.

### Phase 1.9 — Manual entries + net worth graph ✅ DONE
- Prisma: `BalanceEntry`, `IncomeEntry`, `ExpenseEntry` models with soft-delete (`deletedAt`).
- API routes: `/api/manual/balances` (+ `/[id]` for PUT/DELETE), `/api/manual/income` (+ `/[id]`), `/api/manual/expenses` (+ `/[id]`), `/api/manual/networth`.
- `/api/manual/networth` returns time-series net worth (assets - liabilities + T212 + bank accounts), income/expense breakdown by category, and summary (net worth, savings rate, monthly savings).
- Components: `NetWorthChart` (recharts AreaChart), `BalanceForm`, `IncomeForm`, `ExpenseForm`.
- Dashboard: Integrated chart, summary cards, and data entry forms with "balance source" labeling.

### Phase 3 — Harden + deploy (1 session)
- SQLite → Postgres; host backend (Render/Railway/Fly) + web (Vercel). Set env
  on host. Register production webhook URL + redirect URI in Console.
- Reconnection / account-removal UI.

### Phase 4 — Expo mobile (after web is stable)
- `npx create-expo-app`; reuse backend REST APIs + shared TS types.
- `expo-web-browser` for the TrueLayer auth tab; deep link as `redirect_uri`.
- EAS build + store submit.

## Open questions to resolve before Phase 0

1. **Single user?** Assume yes → no app user-auth. ✅
2. **Your banks UK-open-banking?** Data API v3 is UK-only. ✅
3. **Keep existing `ec512-*.pem` (P-521/ES512)?** ✅ JWT signing works
   via `node:crypto.createPrivateKey()` + jose `SignJWT`. **However**, the
   TrueLayer sandbox auth server does NOT accept `client_assertion` (returns
   `invalid_client`). We use `client_secret` auth instead — `TRUELAYER_CLIENT_SECRET`
   is set in `.env` from `sandbox-memoney-2eb02d-secret-*.txt`.
4. **Deploy target?** Defer to Phase 3.

## Pending (blocked on TrueLayer Console configuration)

- **`TRUELAYER_WEBHOOK_SECRET`** — set in TrueLayer Console after configuring the webhook URL. Not yet provided.
- **Enable Data API v3 product** on the sandbox app (`sandbox-memoney-2eb02d`) in the TrueLayer Console. Currently returns 403 Forbidden on `POST /v3/data-connections` — token auth works but the Data API v3 product is not provisioned.
- **Webhook URL**: ngrok tunnel running at `https://snuggle-cranberry-fifty.ngrok-free.dev` — needs to be set in Console and webhook secret obtained.

## Findings: TrueLayer auth

- **Auth method**: `client_secret` (not JWT `client_assertion`). ES512 JWT returns `invalid_client` from sandbox auth server.
- **Scope**: `"info accounts transactions connections:create"` — NOT `"data"` (which returns `invalid_scope`).
- **Auth URL**: `https://auth.truelayer-sandbox.com/connect/token` (sandbox only).
- **Token**: `access_token`, `expires_in=3600`, `token_type=Bearer`.

## Alternative: Direct bank Open Banking APIs

If TrueLayer Console access is unavailable:
- **Monzo**: Simple OAuth2 (`auth.monzo.com` → `api.monzo.com`), no FCA auth needed. Easiest to start with.
- **UK Open Banking standard**: v4.0.1 spec at standards.openbanking.org.uk — requires FCA AISP authorization + eIDAS cert + per-bank registration. Covers HSBC, Barclays, Revolut, Zopa, etc.
- **Salt Edge**: Aggregator with free developer tier, handles FCA auth for all UK OB banks.
- **GoCardless Bank Account Data**: UK-focused aggregator, sandbox available.
- **Trading 212**: No public API available.
