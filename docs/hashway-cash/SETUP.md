# Hashway Cash Command Center — setup, migration, testing, deployment

The app lives inside the pressroom repo but uses its **own Supabase project** for data
and logins. Nothing it does touches the pressroom database.

| Piece | Where |
|---|---|
| UI | `src/cash/` → served at **`/cash`** (lazy-loaded bundle) |
| API | `api/_hashway-cash.js`, dispatched by `api/hashway-ops.js?endpoint=cash` (rewrite: `/api/hashway-cash`) — no extra Vercel function |
| Financial engine (pure) | `api/_cash-engine.js` — shared by API, UI and tests |
| Import definitions | `api/_cash-imports.js` |
| DB adapter | `api/_cash-db.js` (postgres.js in prod, PGlite in tests/dev) |
| Demo data | `api/_cash-demo.js` (loaded only into the `demo` book) |
| Schema | `supabase/migrations/20261004000000_hashway_cashflow.sql` |
| Tests | `tests/cash-*.test.mjs` |
| Local dev | `scripts/cash-dev.mjs` |

## 1. Run it locally (no cloud needed)

```bash
npm install
```

```bash
npm run cash:dev
```

Open http://localhost:5180/cash. The local server runs the real API on PGlite (Postgres compiled
to WASM, persisted in `.cash-dev/`, git-ignored) with the real migration. Login is skipped in dev;
pick a role from the dropdown in the header to try Admin / Finance / Operations / Viewer.
Switch to the **Demo** book → Settings → **Load / reset demo data**. Delete `.cash-dev/` to start over.

## 2. Create the finance Supabase project

1. supabase.com → New project, e.g. `hashway-finance`. **Pick the region closest to the Vercel
   functions** (Vercel defaults to `iad1` / US-East → choose `us-east-1`). Cross-region adds
   ~200 ms per query.
2. SQL editor → paste and run `supabase/migrations/20261004000000_hashway_cashflow.sql`
   (or `supabase db push` with the CLI linked to the new project). The migration is
   idempotent (`if not exists` / `on conflict do nothing`).
3. Authentication → Providers → Email: enabled. Turn **off** public sign-ups
   (Authentication → Sign In / Up → "Allow new users to sign up") — users are invited by an admin.
4. Authentication → Users → **Add user** for the founder email with a password.
   The migration already grants `shivam03299@gmail.com` the `admin` role in `cf_users`; edit
   the last statement of the migration first if the founder email differs.
5. Project Settings → Database → Connection string → **Transaction pooler** (port 6543) → this
   is `CASH_DATABASE_URL`.

## 3. Environment variables (Vercel)

See `docs/hashway-cash/.env.example`. Required: `CASH_DATABASE_URL`, `CASH_SUPABASE_URL`,
`CASH_SUPABASE_ANON_KEY`, `VITE_CASH_SUPABASE_URL`, `VITE_CASH_SUPABASE_ANON_KEY`.
Optional: `CASH_SUPABASE_SERVICE_ROLE_KEY` (invite emails), `CASH_SLACK_WEBHOOK_URL`,
`CASH_APP_URL`. `CRON_SECRET` is already used by the existing cron and is reused.

No secret is in the source. `VITE_*` values are compiled into the browser bundle by design:
the anon key cannot read any `cf_*` table because RLS is on with no policies; all data access
goes through the API, which verifies the user's token and role.

## 4. Deploy

Push to `main` → Vercel builds. `vercel.json` adds:
- rewrites `/cash`, `/cash/*` → SPA, `/api/hashway-cash` → `/api/hashway-ops?endpoint=cash`
- cron `30 4 * * *` (10:00 IST) → `/api/hashway-ops?endpoint=cash&action=cron_daily`
- `maxDuration: 60` for `api/hashway-ops.js`

After deploy: open `/cash`, sign in, add bank accounts (Settings → accounts, with the opening
balance as of the go-live date), recurring commitments, open POs, receivables and bills, then
start the daily 10 AM update.

## 5. Migrations

Schema changes go in new files under `supabase/migrations/` (timestamp prefix) and are applied
to the finance project via the SQL editor or `supabase db push`. Rules:
- additive first (new columns nullable / defaulted), backfill, then tighten;
- never drop or rewrite `cf_transactions`, `cf_audit_log` or `cf_daily_updates` data;
- run `npm test` — the tests apply every migration to a fresh Postgres.

## 6. Tests

```bash
npm test
```

38 tests in three files:
- `cash-engine.test.mjs` — every financial calculation (forecast arithmetic, PO schedules,
  confidence weighting, scenarios, GST reserve, recurring, FIFO, ageing, validation, bank
  matching, inventory, WC, CCC, profit→cash bridge, P&L, accuracy, alerts).
- `cash-api.test.mjs` — the API on a real Postgres (PGlite) with the real migration: spec bank
  mismatch example, duplicate days, reopen/correct with audit, edit-requires-reason, hard-delete
  refusal, negatives/future dates, roles, PO partial payments, late COD, duplicate imports,
  bank auto-match/post, Shopify aggregation, and a full demo load through the daily pipeline.
- `cash-pgdriver.test.mjs` — the production driver (postgres.js) over a TCP socket.

## 7. Operating notes

- **Live vs Demo book.** Every table has `book`. The header switch changes which book you see.
  Demo data can be loaded/reset only into `demo` (admin).
- **Daily cron (10:00 IST):** freezes this week's forecast on Mondays (for accuracy tracking),
  snapshots working capital (trends, CCC history), stores alerts, posts to Slack if configured.
  Finance can also trigger the same snapshot on demand with the `snapshot_now` API action.
- **Future API integrations** (Shopify, Razorpay, Delhivery, banks): write rows into the same
  tables with `source = 'api'` and a `dedupe_key` — exactly what the importers do. The CSV
  importers in `IMPORTERS` are the template. Manual entry always stays available.
