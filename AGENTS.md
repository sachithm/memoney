<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# memoney — Project Guide for AI Agents

A personal finance dashboard (Next.js 16 App Router) that pulls bank accounts
via **TrueLayer Data API v3**, market data via **Trading 212**, and supports
**Salt Edge** as a secondary banking aggregator. Includes manual entry forms
for balance tracking, income/expense logging, and a net-worth time-series chart.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack by default) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss` PostCSS plugin) |
| ORM | **Prisma 7** with driver adapters |
| Database | SQLite (local dev) → PostgreSQL (production on Render) |
| Charts | recharts (AreaChart for net-worth graph) |
| Auth/OAuth | `jose` (JWT signing), `node:crypto` (HMAC webhook verification) |
| Testing | Vitest + Testing Library (unit), Playwright (E2E) |
| Deployment | Render (web service + managed Postgres) |

## Directory Structure

```
src/
├── app/                     # Next.js App Router — pages and API routes
│   ├── (route)/page.tsx     # UI pages (mix of server + client components)
│   ├── api/                 # API route handlers (App Router — .tsx files)
│   │   ├── auth/            # OAuth: TrueLayer connect, callback
│   │   ├── data/            # Bank account/transaction data endpoints
│   │   ├── saltedge/        # Salt Edge OAuth + data sync webhook
│   │   ├── trading212/      # Trading 212 account/positions/dividends
│   │   ├── webhooks/        # TrueLayer webhook (signature-verified)
│   │   └── manual/          # Manual balance/income/expense CRUD
│   ├── auth/callback/       # OAuth redirect page (client-side polling)
│   └── layout.tsx           # Root layout (Geist font, Tailwind globals)
├── components/              # React components (client + server)
│   ├── *(calculator).tsx     # Finance calculators (all "use client")
│   ├── dashboard-client.tsx  # Dashboard interactive layer
│   ├── networth-chart.tsx   # Recharts area chart (server-side data)
│   └── ui/page-header.tsx
├── lib/
│   ├── truelayer.ts         # TrueLayer API client + HMAC webhook verify
│   ├── saltedge.ts          # Salt Edge API client
│   ├── trading212.ts        # Trading 212 API client (rate-limited)
│   ├── prisma.ts            # Prisma client factory (adapter selector)
│   ├── dashboard-data.ts    # getInitialData() — SSR data loader for dashboard
│   ├── types.ts             # Shared domain types
│   └── (calc).ts            # Calculator logic (pure, tested)
├── generated/prisma/        # Prisma client (gitignored, generated at build)
public/                      # Static assets (SVGs, favicon)
prisma/
├── schema.prisma            # Dev schema (provider = "sqlite")
├── schema.production.prisma # Production schema (provider = "postgresql")
├── prisma.config.ts         # Prisma CLI config (datasource URL from env)
└── migrations/              # Migration SQL files (SQLite-specific for local dev)
```

## Architecture Patterns

### Server vs. Client Components
- **Server components** (no `"use client"` directive): Can run Prisma queries
  directly, call external APIs server-side, and access `process.env`. Used for
  page data loading (e.g., `net-worth-tracker/page.tsx` calls `getInitialData()`).
- **Client components** (`"use client"` directive): Used for interactive UI,
  browser-only hooks (`useSearchParams`, `useEffect`). Wrapped in `<Suspense>`
  when they use `useSearchParams()` because Next.js 16 requires it.

### API Routes
All API routes live in `src/app/api/*/` as App Router route handlers. They
export `POST(req: NextRequest)` or `GET()` functions. Key patterns:
- Use `NextResponse.json()` for JSON responses
- Import `prisma` from `@/lib/prisma` for database access
- Error handling: catch errors, return appropriate HTTP status codes
- Mark routes as `dynamic = "force-dynamic"` if they must run on the server
  (e.g., webhooks, refresh endpoints)

### Prisma Client (`src/lib/prisma.ts`)
The Prisma client is created dynamically based on `DATABASE_URL`:
- `postgresql://` or `postgres://` → uses `@prisma/adapter-pg`
- `file:./dev.db` (SQLite) → uses `@prisma/adapter-libsql`

The client is a singleton (stored on `global.prisma` to prevent hot-reload
spawning in dev). The generated client lives in `src/generated/prisma/`
(gitignored — generated at build/deploy time).

### Data Fetching Flow (Dashboard)
1. `net-worth-tracker/page.tsx` (server component) calls `getInitialData()`
2. `getInitialData()` in `src/lib/dashboard-data.ts`:
   - Queries Prisma directly (connections, accounts)
   - Uses `fetch()` to call internal API routes (`/api/trading212/data`,
     `/api/manual/networth`) with Next.js route cache revalidation
   - Returns a `DashboardInitialData` object with all data
3. Data is passed as props to `DashboardClient` (client component)
4. Client component manages interactive state (form submissions, refreshes)

### Calculator Pattern
Each calculator is a standalone client component following the same pattern:
- `useSearchParams()` to read/persist form state in URL params
- `usePathname()` for navigation
- Local state for form values (synced to URL on change)
- Pure calculation functions in `src/lib/` (separated from UI, fully tested)
- Wrapped in `<Suspense>` in the page wrapper (required by Next.js 16)

## Data Integrations

### TrueLayer Data API v3 (UK Open Banking)
- **Auth**: `client_credentials` OAuth2 with `client_secret` (sandbox only)
  - JWT `client_assertion` (ES512/P-521) is the enterprise fallback but
    **not supported by the sandbox auth server**
- **Scope**: `"info accounts transactions connections:create"`
- **Flow**:
  1. POST `/v3/data-connections` → `link_uri` + `connection_id`
  2. User visits `link_uri` → selects bank → consents → returns to redirect URI
  3. Webhook `connection.authorized` fires (signature-verified via HMAC-SHA256)
  4. GET `/v3/connected-accounts` (with `Connection-Id` header) → accounts + balances
  5. POST `/v3/connected-accounts/{id}/transactions/requests` → async, webhook fires when ready
  6. GET the transactions result using the `request_id`
- **Token caching**: ~1 hour (in-memory, per process)
- **Config**: `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`,
  `TRUELAYER_ENV`, `TRUELAYER_WEBHOOK_SECRET`, `TRUELAYER_REDIRECT_URI`

### Salt Edge v6
- **Auth**: HTTP Basic auth (`base64(app_id:api_key)`)
- **Flow**: Create customer → create connection → user redirected to bank →
  callback webhook syncs accounts + transactions to DB
- **Config**: `SALTEDGE_APP_ID`, `SALTEDGE_API_KEY`, `SALTEDGE_API_BASE`,
  `SALTEDGE_CALLBACK_URL`

### Trading 212
- **Auth**: HTTP Basic auth (`api_key:api_secret`) or raw API key
- **Rate limit**: 1 request per 5 seconds (client-side serialized queue)
- **Caching**: 5-minute in-memory cache with stale-data fallback
- **Config**: `TRADING212_API_KEY`, `TRADING212_API_SECRET`,
  `TRADING212_ENV` (demo/live), `TRADING212_ENABLED`

## Environment Variables

See `.env.example` for the full template. In production (Render):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Render Postgres connection string (auto-set via `fromDatabase`) |
| `NEXTAUTH_URL` | Yes | Public app URL (update after first deploy) |
| `TRUELAYER_CLIENT_ID` | Yes | TrueLayer sandbox app client ID |
| `TRUELAYER_CLIENT_SECRET` | Yes | TrueLayer client secret |
| `TRUELAYER_WEBHOOK_SECRET` | Yes | For verifying TrueLayer webhook signatures |
| `TRUELAYER_ENV` | No | `sandbox` (default) or `production` |
| `SALTEDGE_APP_ID` | Only if using | Salt Edge application ID |
| `SALTEDGE_API_KEY` | Only if using | Salt Edge API key |
| `TRADING212_API_KEY` | Only if using | Trading 212 API key |
| `TRADING212_API_SECRET` | No | Trading 212 API secret (for 2-factor auth) |

**Security note**: `*.pem` files and real `.env` files are in `.gitignore`.
The `TRUELAYER_SIGNING_KEY_PATH` env var points to a PEM file for enterprise
JWT auth — only needed for production TrueLayer (not sandbox). Never commit
real secrets to git.

## Development

```bash
# Install dependencies
npm install

# Copy env template (sandbox + demo mode works out of the box for local dev)
cp .env.example .env.local

# Run dev server (SQLite DB, TrueLayer sandbox, T212 demo)
npm run dev

# Run unit tests
npm test

# Run E2E tests (requires running dev server)
npm run test:e2e

# Generate Prisma client (if schema changes)
npx prisma generate

# Dev DB (SQLite)
npx prisma migrate dev  # after changing schema.prisma
```

### Prisma Schema: Two Files
- `prisma/schema.prisma` — dev schema (`provider = "sqlite"`). Local migrations
  are SQLite-specific (PRAGMA, DATETIME).
- `prisma/schema.production.prisma` — production schema (`provider =
  "postgresql"`). Used by the Render build for `prisma generate` and
  `prisma db push`. Keep in sync with the dev schema when adding models.

### Testing
- **Unit tests**: Vitest (`vitest.config.ts` + `vitest.setup.ts`). Tests live
  next to the code (e.g., `src/lib/mortgage-calculations.test.ts`,
  `src/components/compound-interest-calculator.test.tsx`). Pure logic tests
  are in `src/lib/*.test.ts`; component tests are in `src/components/*.test.tsx`.
- **E2E tests**: Playwright (`e2e/tests/app.spec.ts`). Requires the dev server
  running on `localhost:3000`.

## Deployment (Render)

The repo is pre-configured for Render via `render.yaml` (Blueprint / IaC).
See the README.md for step-by-step instructions.

**Build command** (from render.yaml):
```bash
npm install --include=dev
npx prisma generate --schema prisma/schema.production.prisma
npx prisma db push --schema prisma/schema.production.prisma
npm run build
```

**Key deployment notes**:
1. `@tailwindcss/postcss` and `tailwindcss` are in `dependencies` (not
   devDependencies) because Render sets `NODE_ENV=production` which makes
   npm skip devDependencies by default.
2. Next.js 16 removed `next lint` and the `eslint` next.config.js option.
   ESLint is configured via `eslint.config.mjs` and run via the ESLint CLI
   (not during `next build`).
3. `prisma db push` is used instead of `prisma migrate deploy` because
   existing migration SQL files are SQLite-specific and can't run against
   Postgres. The `schema.production.prisma` file drives the Postgres schema.
4. Calculator pages use `<Suspense>` wrappers because their client components
   call `useSearchParams()` — required by Next.js 16.

## Common Gotchas for AI Agents

1. **Never edit `src/generated/prisma/*`** — it's auto-generated. Always run
   `npx prisma generate` after schema changes.
2. **Date serialization** — Prisma returns `Date` objects for `DateTime`
   fields. When passing data to client components, convert with
   `.toISOString()` (see `dashboard-data.ts` and `manual/page.tsx`).
3. **Rate limiting** — Trading 212 has a 1 req/5s limit. The client enforces
   this with a serialized promise queue. Don't add uncached T212 API calls.
4. **Webhook signatures** — Always verify with `verifyWebhookSignatureWithTimestamp()`
   in `src/lib/truelayer.ts`. Never trust webhook payloads without verification.
5. **`NEXTAUTH_URL` on Render** — Must be set to the actual Render URL after
   first deploy, or internal `fetch()` calls from server components to API
   routes will fail.
6. **SQLite vs Postgres** — Local dev uses SQLite. The Prisma client adapter
   is selected at runtime based on `DATABASE_URL` prefix. Don't assume
   Postgres-specific SQL features are available in local dev or vice versa.
7. **`fs` access in `truelayer.ts`** — Uses `fs.readFileSync` for the ES512
   PEM key. This is server-only code (OAuth JWT signing) and marked with
   `/*turbopackIgnore: true*/` to prevent bundling issues.
