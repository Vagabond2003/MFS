# Kosh — MFS web app

A Mobile Financial Services web app with three isolated customer roles — **Personal**, **Agent**, **Merchant** — plus an **Admin** back office.

**Live:** https://kosh-bd.vercel.app (Vercel, Singapore region). Sign in with the [starting accounts](#starting-accounts-from-supabaseseedsql) below.

**What's in it**

* Wallets, Send Money, Cash In/Out at agents, Mobile Recharge, Bill Payment, Merchant Pay (QR and Merchant ID), Add Money, refunds and settlements. Everything runs on a server-side ledger with fees, limits, PIN and OTP.
* Merchant & agent intelligence (hackathon Track 05): liquidity forecasts for agents, sales forecasts and peer benchmarks for merchants, churn risk, agent patterns and district coverage for admins. Figures are computed in code; AI only writes the words ([details](#merchant--agent-intelligence)).
* OTP codes by SMS (sms.net.bd) and email (Brevo), plus account and transaction emails ([SMS](#sms), [Email](#email)).
* Profile pictures at sign-up and in the profile, shown across the app ([details](#profile-pictures)).
* English and বাংলা throughout, with a per-user saved language ([details](#languages-english--বাংলা)).

> **How it runs.** The UI talks to a typed API contract (`src/services/contracts.ts`). In the default `supabase` mode the API handlers run on this Next.js server (`/api/rpc`) and store everything in a Supabase PostgreSQL database. They enforce sessions, RBAC, verification gates, fees, limits, PIN/OTP, atomic posting and the audit log. An `http` mode is also available for an external REST backend (see [API contract](#connecting-a-real-backend)).

---

## Quick start

Requirements: Node.js 20.9+ (tested on Node 25), npm, a Supabase project.

1. In the Supabase **SQL Editor**, run `supabase/schema.sql`, then `supabase/seed.sql` (once each — re-running `schema.sql` deletes all data).
   A database created before a change in `supabase/migrations/` needs those files run once instead, in name order — they are safe on live data and safe to re-run:
   - `20261006_change_counter.sql` — lets the server cache the database in memory (without it every request reloads the whole database)
   - `20261006_profile_pictures.sql` — profile pictures (`users.avatar_id` and the `avatars` table)
   - `20261007_document_files.sql` — keeps uploaded verification documents (NID, photo, licenses) so admins can view them under **Verifications**

   Restart `npm run dev` after running a migration: the server reads the database's columns once at startup.
2. `npm install`
3. `cp .env.example .env.local`, then fill in:
   - `DATABASE_URL` — Supabase → **Connect** → **Direct** → Method **Transaction pooler** (port 6543), with your database password.
   - `AUTH_JWT_SECRET` — any random string of 32+ characters.
   - *Optional:* `SMS_NET_BD_API_KEY` to text OTP codes (see [SMS](#sms)).
   - *Optional:* Brevo SMTP (`BREVO_SMTP_*`) and a verified sender in `EMAIL_FROM` to email OTP codes and account emails (see [Email](#email)).
   - *Optional:* `GEMINI_API_KEY` and/or `GROQ_API_KEY` for AI-written insight text (see [AI configuration](#ai-configuration)). Without them every insight still works with template text.
4. *Optional, demo data:* run `supabase/synthetic-data.sql` in the SQL Editor after `seed.sql` — 4 more accounts per role and 90 days of history for every account, as exported on 2026-10-03. For history that ends today instead, run `node --env-file=.env.local scripts/seed-synthetic.mjs` (see [Synthetic data](#synthetic-data)).
5. `npm run dev` and open http://localhost:3000.

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`. Checks without a test framework: `node scripts/check-i18n.mjs`, `node scripts/check-intelligence.mjs`, `node scripts/check-ai.mjs`.

### Starting accounts (from `supabase/seed.sql`)

Transaction PIN for all: **`24680`**. OTP codes are shown on screen (`OTP_SHOW_CODES`, on by default). These are demo accounts, so they never receive real SMS or email: their numbers are made up and their emails use `example.com`. Accounts you register with a real number and email get the codes there too.

| Role | Sign in with | Password |
|---|---|---|
| Personal | `01700000001` (Ashraful Islam) | `demo@1234` |
| Agent | `01814557644` (Sabbir_Tele, `AG-10001`) | `demo@1234` |
| Merchant | `01773519331` (Nafiztong, `MR-40001`) | `demo@1234` |
| Admin | `admin@example.com` | `Demo@1234` — 2FA on (OTP at sign-in) |

Wallets start at ৳0; the agent starts with ৳50,000 of cash recorded at the outlet. New accounts are created through `/register` and saved to the database.

`supabase/synthetic-data.sql` adds 4 more accounts per role (same password `demo@1234`, PIN `24680`). Its header lists every phone number.

| Role | Sign in with |
|---|---|
| Personal | `01453384498` Arif Sheikh · `01953805977` Rahim Haque · `01355258360` Karim Begum · `01357298253` Rakib Uddin |
| Agent | `01462061206` Tamim Bhuiyan (Dhaka, fast-growing) · `01364232142` Sharmin Sarkar (Chattogram, near-limit cash-outs) · `01764743977` Mitu Talukder (Gazipur, cash shortfall) · `01765278926` Arif Uddin (Narayanganj, off-hours bursts) |
| Merchant | `01880438058` Arif Roy (Dhaka, declining) · `01485360573` Hasan Rahman (Chattogram) · `01588238447` Saiful Islam (Gazipur) · `01780178082` Keya Rahman (Narayanganj, declining) |

### A quick tour

1. **Role isolation.** Sign in as Ashraful, then open `/dashboard/merchant` → **403**. The proxy blocks it before the page renders.
2. **Add Money.** As Ashraful → *Add Money* → bKash / Nagad / Rocket / Upay → approve with the one-time code and PIN.
3. **Agent Cash Out / Cash In.** As Ashraful, *Cash Out* at `01814557644`; as Sabbir_Tele, *Cash In* to `01700000001`.
4. **Merchant payment.** As Ashraful → *Merchant Pay* → `MR-40001`.
5. **Verification gate.** Register a new agent or merchant at `/register` → it stays locked until the admin approves it under **Verifications**.
6. **Registration.** `/register` → pick a role → complete the wizard. Add a profile picture on the first step if you like. The code is shown on screen and also goes to the number (and email) you entered. Uploads are type-, size- and magic-byte-checked.
7. **Profile picture.** Profile → *Change photo*. The picture appears in the header, in transaction lists and details, on the payment review screen, and in the admin user list.
8. **বাংলা.** Use the language toggle in any header. Signed-in users keep the choice on every device.
9. **Insights.** See the [5-minute demo script](#demo-script-5-minutes).

---

## Architecture

```
ONE AUTHENTICATION SYSTEM → ROLE DETECTION → ROLE-SPECIFIC AUTHORIZATION → ROLE-SPECIFIC DASHBOARD

Browser ── request ──► src/proxy.ts (server, before render)
                         • reads session cookie, verifies it (JWT in http mode)
                         • no session → /login?next=…
                         • wrong role for route → /unauthorized (403)
                         • /dashboard → role home
                     ──► (app)/layout → AppFrame (client, defense in depth)
                         • resolves the session through the API (role comes from the
                           users table, never from the cookie) and re-checks the route
                         • renders the role's own shell: Personal / Agent / Merchant / Admin
                     ──► page → feature view → api.* (services/contracts.ts)
                                                  ├─ services/rpc → POST /api/rpc → src/server/rpc.ts
                                                  │     → services/mock handlers (run on the server)
                                                  │     → src/server/db-store.ts (Supabase PostgreSQL)
                                                  │     → after the call: queued email (Brevo) and SMS (sms.net.bd)
                                                  └─ services/http  (external REST backend)
```

* **Route RBAC has one source of truth:** `src/lib/auth/access.ts`, used by both the proxy and the client guard.
* **Operation RBAC is server-side:** `services/mock/policy.ts` → `OPERATION_POLICY` decides who may run each money operation, and whether verification is required. The UI only hides what the server would refuse anyway.
* **The client never computes money.** Every money operation is *quote → authorise → execute*. The server prices it (fees, commission, balance after) in the quote, then re-validates everything on execute. Amounts are integer **poisha** end to end.

### Project structure

```
src/
├─ proxy.ts                     Route guard (Next.js 16 "proxy", formerly middleware)
├─ app/                         Routes only — thin server components with metadata
│  ├─ page.tsx, help/           Landing & support
│  ├─ (auth)/login, forgot-password
│  ├─ register/{personal,agent,merchant}
│  ├─ unauthorized/             403
│  ├─ api/rpc                   The API endpoint
│  ├─ api/avatars/[id]          Profile pictures (signed-in users)
│  ├─ api/documents/[id]        Verification documents (admins, audit-logged)
│  └─ (app)/                    Authenticated area (AppFrame)
│     ├─ dashboard/personal/*   send, cash-out, recharge, pay-bill, merchant-pay, add-money
│     ├─ dashboard/agent/*      cash-in, cash-out, recharge, customer-payment, liquidity, commission, settlement, verification
│     ├─ dashboard/merchant/*   receive, qr, sales, insights, refunds, settlement, business
│     ├─ admin/*                intelligence, users, verifications, transactions, disputes, audit-logs
│     └─ transactions, notifications, profile   (shared, rendered in the caller's shell)
├─ features/                    Screens, grouped by role/domain (insights/ = intelligence screens)
├─ components/
│  ├─ ui/                       Design system (Button, Card, Field, Modal/Sheet, Table, Badge, CodeInput, FileDrop, Avatar, AvatarPicker…)
│  ├─ charts/                   Recharts wrappers (validated palette, legend + tooltip + table view)
│  ├─ shells/                   Four different app shells + mobile bottom navs
│  ├─ flows/transaction-flow    Shared details → review/PIN/OTP → receipt wizard
│  ├─ transactions/             History table, filters, receipt
│  └─ guards/app-frame          Client auth/RBAC guard
├─ services/
│  ├─ contracts.ts              The API contract the UI depends on
│  ├─ http/                     REST implementation
│  ├─ rpc/                      Browser client for /api/rpc
│  ├─ mock/                     API handlers (run on the server): schema, store (atomic writes), ledger,
│  │                            policy (fees/limits/RBAC), analytics, views, handlers
│  │  └─ intelligence/          Forecasts, liquidity, churn, benchmarks, anomalies, coverage (pure functions)
│  └─ providers/                SMS/OTP, KYC, storage, payment gateway, billers, QR codec — dev implementations
├─ server/                      Server-only: rpc (request context, email/SMS outbox), db-store (PostgreSQL),
│  │                            email (Brevo), sms (sms.net.bd), avatars, documents
│  └─ ai/                       AI wording: model chain, output guard, templates, daily cache
├─ lib/                         auth (access map, session token), validation (zod, shared), utils, i18n
├─ hooks/                       use-auth, use-api (fetch + tag invalidation), use-i18n, use-hydrated
├─ config/                      navigation
└─ types/domain.ts              View types returned by the API

supabase/                       schema.sql (fresh database), seed.sql (starting accounts), migrations/
scripts/                        seed-synthetic.mjs, check-i18n.mjs, check-intelligence.mjs, check-ai.mjs
```

---

## Roles and routes

| Route | Personal | Agent | Merchant | Admin |
|---|:-:|:-:|:-:|:-:|
| `/dashboard/personal/**` | ✅ | ❌ | ❌ | ❌ |
| `/dashboard/agent/**` | ❌ | ✅ | ❌ | ❌ |
| `/dashboard/merchant/**` | ❌ | ❌ | ✅ | ❌ |
| `/admin/**` | ❌ | ❌ | ❌ | ✅ |
| `/transactions` | ✅ | ✅ | ✅ | ❌ (uses `/admin/transactions`) |
| `/notifications`, `/profile` | ✅ | ✅ | ✅ | ✅ |
| `/login`, `/register/**`, `/forgot-password` | guests only — signed-in users go to their dashboard | | | |

Each role has its own navigation and information architecture:

* **Personal:** light sidebar grouped by money tasks; mobile bottom bar with a central **Pay** sheet.
* **Agent:** a dark operations console with a persistent e-money / cash float strip and a "counter" of large actions.
* **Merchant:** no sidebar. A business top bar (name, Merchant ID, verification) with section tabs and an always-visible **Receive payment** button.
* **Admin:** a compact back-office console. Every action is audit-logged.

## Business rules (server-side)

| Operation | Who | Fee / commission | Limits |
|---|---|---|---|
| Send Money | Personal | Free ≤ ৳1,000, else ৳5 | ৳10–25,000 |
| Cash Out | Personal at verified agent | 1.85% (agent earns 0.40%) | ৳50–25,000, agent must have cash |
| Mobile Recharge | Personal | Free | ৳20–1,000 |
| Bill Payment | Personal | ৳5 | ৳10–50,000 |
| Merchant Payment | Personal → **verified** merchant | Customer pays a 1.5% fee on top; the merchant receives the full amount | ৳1–50,000 |
| Add Money | Personal | Free (dev gateway declines amounts ending in .13) | ৳100–50,000 |
| Cash In / Cash Out / Recharge / Customer Payment | **Verified** agent | Agent earns 0.20% / 0.40% / 2.5% / 0.5% (৳2–20) | per policy |
| Refund | **Verified** merchant | — | ≤ remaining amount, within 30 days |
| Settlement | **Verified** agent/merchant | Free | ৳500+ |

* **Personal limits:** verified ৳25,000 per transaction / ৳50,000 per day; KYC pending ৳5,000 / ৳10,000.
* **Step-up OTP:** required in addition to the PIN at ৳10,000 or more. Agent-assisted Cash Out always needs the customer's OTP.
* **Lockouts:** 3 wrong PINs lock the PIN for 15 minutes; 5 wrong passwords lock sign-in for 15 minutes; OTPs expire after 3 minutes and allow 5 attempts.

## Security model

| Requirement | Where |
|---|---|
| Server-side authentication & role verification | `src/proxy.ts` (JWT verified with `AUTH_JWT_SECRET` in http mode); the API resolves the session per call |
| Role from DB, not client | mock `resolveCaller()` reads the role from the users table; a tampered cookie lands on 403 |
| Password/PIN hashing | PBKDF2-SHA256 with per-secret salt (mock); production backend: Argon2id/bcrypt |
| Session management | session table, *remember me* (30 days vs 12 hours), device list, revoke one, log out everywhere, login history |
| Protected API routes | every handler calls `requireCaller(db, roles)` |
| Input validation | shared zod schemas (`lib/validation.ts`) validated on the client **and** again in the API |
| Rate limiting | fixed-window limiter for login, OTP sends (per number, per email and per network at sign-up), password reset, uploads and AI calls; PIN/password lockouts |
| OTP delivery | codes go only to the owner of the destination phone (the customer for agent cash out); never texted or emailed to demo accounts; sent after the request commits; logs never contain codes, numbers or addresses |
| CSRF | http client sends `X-CSRF-Token` (double-submit cookie) on every mutating request; cookie is `SameSite=Lax` |
| Upload validation | extension, MIME, ≤5 MB and **magic bytes** checked; SHA-256 recorded; files kept in `document_files` and shown only to admins (`GET /api/documents/:id`, every view audit-logged) |
| Profile pictures | JPG/PNG/WebP ≤ 2 MB, magic bytes checked; stored in `avatars`, served by `GET /api/avatars/:id` to signed-in users only (random ids, `nosniff`, sandboxed CSP) |
| Audit logging | append-only `audit_logs` for sign-ins, money movement, admin actions |
| Transaction authorisation | PIN on every operation, OTP step-up, idempotency key against double submits |
| Server-side balances & atomicity | ledger `post()` inside a serialised `write()` transaction; invariants (no negative or fractional balances) are checked before commit, and any failure rolls back |
| Sensitive data in responses | other people's phone numbers and NIDs are masked in view mappers; hashes never leave the server |
| Security headers | `next.config.ts` (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS in production) |
| Credential forms | `method="post"`, and submit stays disabled until hydration, so fields never land in a URL |

**Production TODO:** add a strict Content-Security-Policy once the API origin is known. Serve documents through short-lived signed URLs.

## Connecting a real backend

Set `NEXT_PUBLIC_API_MODE=http`, `NEXT_PUBLIC_API_BASE_URL` and `AUTH_JWT_SECRET`. The backend must:

* Set the session cookie `kosh_session`: httpOnly, Secure, `SameSite=Lax`, holding an HS256 JWT `{ sid, role, exp }`.
* Set a readable `csrf_token` cookie and check it against `X-CSRF-Token`.
* Honour `Idempotency-Key` on `POST /operations/execute`.
* Return errors as `{ code, message, fieldErrors? }`, where `code` is one of `services/errors.ts → ApiErrorCode`.
* Amounts are integer poisha.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/login/otp` · `POST /auth/login/otp/resend` · `GET /auth/me` · `POST /auth/logout` · `POST /auth/password-reset` · `POST /auth/password-reset/confirm` |
| Registration | `POST /register/otp` · `POST /register/{personal,agent,merchant}` · `POST /kyc/selfie-checks` · `POST /uploads` (multipart) |
| Wallet & money | `GET /wallet` · `GET /wallet/funding-sources` · `POST /operations/quote` · `POST /operations/otp` · `POST /operations/execute` |
| History | `GET /transactions?search&type&status&from&to&page&pageSize` · `GET /transactions/:trxId` · `POST /transactions/:trxId/disputes` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` |
| Profile & security | `GET/PATCH /profile` · `POST/DELETE /profile/avatar` (picture from a `POST /uploads` with purpose `AVATAR`) · `POST /security/password` · `POST /security/pin/otp` · `POST /security/pin` · `POST /security/2fa/otp` · `POST /security/2fa` · `GET /security/sessions` · `DELETE /security/sessions/:id` · `POST /security/logout-all` · `GET /security/login-history` |
| Dashboards | `GET /personal/dashboard` · `GET /personal/recipients` · `GET /agent/dashboard` · `GET /agent/commissions` · `GET /agent/settlements` · `GET /merchant/dashboard` · `GET /merchant/settlements` |
| Merchant QR | `GET /merchant/qr` · `POST /merchant/payment-requests` · `GET /merchant/payment-requests[/:id]` · `POST /merchant/payment-requests/:id/cancel` |
| Insights | `GET /agent/insights/{liquidity,performance}` · `GET /merchant/insights/{demand,benchmark,recommendations}` · `GET /admin/insights/{churn,agents,coverage}` |
| Lookups | `GET /billers` · `GET /billers/:id/bills?account=` · `POST /merchants/resolve` |
| Admin | `GET /admin/stats` · `GET /admin/users[/:id]` · `POST /admin/users/:id/status` · `GET /admin/verifications` · `POST /admin/verifications/:userId/decision` · `POST /admin/documents/:id/review` · `GET /admin/transactions` · `GET /admin/disputes` · `PATCH /admin/disputes/:id` · `GET /admin/audit-logs` |

Request and response shapes are the TypeScript types in `src/services/contracts.ts` and `src/types/domain.ts`.

### Data model the backend should provide

`supabase/schema.sql` is the relational schema; `services/mock/schema.ts` mirrors it. Tables: `users` (role enum `PERSONAL | AGENT | MERCHANT | ADMIN`), `personal_profiles`, `agent_profiles`, `merchant_profiles`, `merchant_businesses`, `account_status_history`, `verification_documents`, `wallets` (with an optimistic-lock `version`), `transactions` (sender, receiver, fees, commission and cash effect; settlements are transactions too), `commissions`, `notifications`, `otp_codes` (hashed codes bound to a context), `sessions`, `audit_logs` (append-only), `disputes`, `payment_requests`, `rate_limits`, `idempotency_keys`, `ai_insights` (cached AI wording), `avatars` and `document_files` (picture and document bytes, kept out of the in-memory snapshot) and `app_state` (the change counter behind the in-memory cache).

## Languages (English / বাংলা)

* **Toggle** in every header (landing, sign-in, registration and all four app shells), plus a **Language** card under Profile → Profile. Signed-in users get the choice saved to their account (`users.language`), so it follows them to every device; visitors keep it in the `kosh_lang` cookie.
* **Registration:** each sign-up form starts with a *Preferred language* choice (defaults to the language being browsed); the new account is created with it.
* **How text is translated:** components call `t("English text")` from `useI18n()` (Server Components use `getT()` from `lib/i18n/server`). The English text is the key; Bengali lives in `src/lib/i18n/dict/`. A missing entry falls back to English.
* **Server text** (API errors, validation messages, notifications, transaction descriptions) stays English in the database and API; the API route translates errors for the caller, and stored text is translated when shown. Messages with values (amounts, names, IDs) match the patterns in `dict/bn-patterns.ts`.
* **Coverage check:** `node scripts/check-i18n.mjs` lists any user-facing English string without a Bengali entry. Run it after adding UI text.
* Amounts, phone numbers and IDs keep Latin digits; dates use Bengali month and day names.

## Merchant & agent intelligence

Forecasts, benchmarks and risk signals for agents, merchants and the operations team (hackathon Track 05).

**Numbers come from code, words come from the LLM.** Every forecast, score, benchmark and flag is computed by deterministic TypeScript in `src/services/mock/intelligence/`. A language model only turns those figures into a sentence or two. Every screen still works, with template text, when no model is configured or none answers.

| Who | Where | What |
|---|---|---|
| Agent | Dashboard card · **Liquidity planner** (`/dashboard/agent/liquidity`) | 7-day cash and e-money float projection, shortfall warning, suggested float top-up / extra cash / settlement, day-by-day table, 28-day performance and anonymous standing among agents |
| Merchant | **Insights** (`/dashboard/merchant/insights`) | 7-day sales forecast (dashed continuation of the actual line, likely-range band), busiest hours and day, payment mix, comparison with similar merchants, 3 recommendations |
| Admin | **Intelligence** (`/admin/intelligence`) | Merchant churn risk with reasons, agent patterns to review (near-limit cash-outs, repeated customers, off-hours activity, volume spikes), rising performers, service gaps, district coverage ranking |

### How the figures are made

* **Forecasts** (`forecast.ts`): weekday seasonality, a damped trend and a salary-day (1st–5th of the month) uplift, learned from up to 8 weeks of history; an ~80% band from the residuals. Days and hours are bucketed in Asia/Dhaka.
* **Liquidity** (`liquidity.ts`): the agent's expected cash-out, cash-in and other cash collected each day, applied to today's real wallet. A day is at risk when a busy day (upper band) would need more than the projected opening cash or float. Suggestions are rounded up to ৳1,000.
* **Churn** (`churn.ts`): a 0–100 score with fixed weights: days since last payment 35, payment-count drop 25, value drop 20, failure rate 10, refund rate 10. Every score lists its factors.
* **Benchmarks** (`benchmark.ts`): last 30 days against merchants with the same category and district (falls back to category, then all merchants). Only medians and percentiles are returned; no peer is ever identified.
* **Agent patterns** (`anomalies.ts`): each measure is compared with peers and with the agent's own previous 8 weeks. Flags are patterns to review, not verdicts.
* **Coverage** (`coverage.ts`): distinct customers served per agent and per merchant by district over 30 days, ranked against the network median, with the extra agents needed to reach it.

### How the words are made (`src/server/ai/`)

* `explain(kind, facts, lang)` tries `GEMINI_MODEL` → `GEMINI_FALLBACK_MODEL` → `GROQ_MODEL` within one 18-second budget. Each attempt has its own timeout, and time is held back for the next model. Rate-limited or slow models get a short cool-down. If nothing usable comes back, a deterministic English/Bengali template answers.
* **Privacy:** models only receive aggregated, pre-formatted figures plus category and district. Never names, phone numbers, NIDs, addresses, agent codes or transaction IDs. `scripts/check-ai.mjs` checks this against the whole dataset.
* **Guard:** a reply is used only if it is JSON of the expected shape (zod), in the requested language, and every number in it appears in the facts (Bengali digits count the same). Otherwise the next model is tried.
* **No path to money:** the model has no tools and its output is display text. Suggested actions and amounts come from code, and links only open the normal screens, where the user still confirms with a PIN.
* **Cache and limits:** wording is cached per user, insight, language and input hash for the Dhaka day (`ai_insights`). Model calls are limited to 30 per user per hour through `rate_limits`, and run outside any database transaction.
* **Labelling:** the UI marks model text as **AI-generated** with when it was written. Template text is labelled *Automatic summary*. Text follows the user's saved language.

### AI configuration

Server-only variables in `.env.local` (never `NEXT_PUBLIC_`). All are optional.

| Variable | Default in `.env.example` | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Google AI Studio key. Used for both Gemini models. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | First choice. JSON mode, 8 s timeout. |
| `GEMINI_FALLBACK_MODEL` | `gemma-4-31b-it` | Second choice. No JSON mode; often slow, so 8 s timeout. |
| `GROQ_API_KEY` | — | Groq key. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Third choice (OpenAI-compatible API). |

To try the chain from the command line: `node --env-file=.env.local scripts/check-ai.mjs --live` (add `--lang=bn` for Bengali). It prints the facts sent and the text that came back, never keys.

### Synthetic data

```bash
node --env-file=.env.local scripts/seed-synthetic.mjs           # seed
node --env-file=.env.local scripts/seed-synthetic.mjs --reset   # remove it again
node --env-file=.env.local scripts/seed-synthetic.mjs --dry-run # generate and validate only
```

* 4 customers, 4 agents and 4 merchants across 4 districts, with 90 days of history ending today. That is about 1,500 transactions. With the `seed.sql` accounts that makes **5 accounts per role**. It is kept small on purpose: the app loads the whole database, so a large dataset makes every page slow.
* Every id starts with `syn_` and every synthetic user is `is_demo`. `--reset` deletes those rows, plus any app transaction made later with a synthetic user (for example a cash-out at a synthetic agent), and reverses their effect on the remaining balances.
* The demo agent and merchant (Sabbir_Tele, Nafiztong) get a district (Dhaka) and history on top of their real balances. `--reset` reverses the history's effect.
* Fees, commissions and limits come from `policy.ts`, and postings follow the ledger's rules, so every wallet stays whole-poisha and non-negative.
* The generator is deterministic (fixed seed, days anchored to the run date).
* **Planted patterns:**
  - weekly seasonality and salary-day cash-out spikes
  - 2 declining merchants (Dhaka, Narayanganj)
  - an agent with near-limit cash-outs by repeat customers (Chattogram)
  - an agent with off-hours bursts (Narayanganj)
  - a fast-growing agent (Dhaka)
  - an overloaded, underserved district (Gazipur)
* The seed prints one account per pattern. Every synthetic account uses password `demo@1234` and PIN `24680`.

### Demo script (5 minutes)

After running the migration and the seed, with the AI keys set:

1. **Admin → Intelligence** (`admin@example.com`). The churn table opens with the declining merchants and their reasons (e.g. "No payment for 8 days", "Payments down 100%"). The summary above it carries the **AI-generated** label and the time it was written.
2. **Same page, further down.**
   - *Patterns to review* shows the Chattogram agent's near-limit cash-outs and the Narayanganj agent's off-hours activity, each compared with peers.
   - *Rising performers* and *Service gaps* follow.
   - *District coverage* ranks **Gazipur** most underserved, with the extra agents it needs.
3. **Agent → Liquidity planner.** Sign in as the Gazipur agent printed by the seed (*Agent with a cash shortfall*).
   - The dashboard card warns that cash may run short in the coming days and suggests how much cash to bring.
   - *Open planner* shows the 14-day history and 7-day projection with the at-risk day in red, the day-by-day table, and the salary-day uplift.
   - Sabbir_Tele (`01814557644`) shows the same page for an agent with healthy cash.
4. **Merchant → Insights** as Nafiztong (`01773519331`).
   - The sales forecast continues the actual line as a dashed line inside its likely-range band.
   - Below it: busiest hours, the payment mix, and the comparison with the other merchants (medians only, no names).
   - At the top: three recommendations, each chosen by code and worded by the model.
5. **বাংলা and resilience.** Switch the language toggle to বাংলা: the screens and the AI text come back in Bengali. Then remove the AI keys from `.env.local` and restart. Every number stays the same, and the text switches to the *Automatic summary* templates.

## Profile pictures

* **Where:** an optional *Profile picture* on the first step of every sign-up form, and *Change photo* / *Remove* on Profile.
* **Rules:** JPG, PNG or WebP, at most 2 MB. Checked in the browser for quick feedback, then again on the server (type, size and magic bytes).
* **Storage:** pictures go through the normal upload (`POST /uploads`, purpose `AVATAR`) into the `avatars` table. `users.avatar_id` points at the current one; replaced pictures are deleted, and sign-up uploads nobody claimed expire after a day.
* **Serving:** `GET /api/avatars/:id`, for signed-in users with an active session only. Ids are random and change with every new picture, so responses are cached privately.
* **Shown in:** the app header and account menu, profile, transaction lists (both parties in the admin view), transaction details, the payment review step, recent recipients, and the admin user list and details. Without a picture, initials are shown.
* Needs `supabase/migrations/20261006_profile_pictures.sql`. Until it runs, uploading explains that and everything else works as before.

## SMS

OTP codes go out by text message through **sms.net.bd** (`src/server/sms.ts`) when `SMS_NET_BD_API_KEY` is set. Otherwise the development SMS provider logs them and shows them on screen.

* The code is texted to the phone it's for: the account's own number, the customer's number for an agent-assisted cash out, or the number typed at sign-up. Sign-up requests are limited to 10 per network and to the usual per-number OTP limit, every 15 minutes.
* **Demo and synthetic accounts are never texted.** Their numbers are made up and may belong to real people.
* Like email, messages are queued and sent after the request succeeds. Failures are logged with the gateway's error code only.
* New sms.net.bd accounts can only text their own registered number until the first recharge (error 421).

| Variable | Notes |
|---|---|
| `SMS_NET_BD_API_KEY` | sms.net.bd → API |
| `SMS_SENDER_ID` | Optional approved sender ID |

## Email

OTP codes and account emails go out through **Brevo SMTP** (`src/server/email.ts`, `nodemailer`). Without the `BREVO_SMTP_*` variables and `EMAIL_FROM`, email is off and codes are shown on screen by the development SMS provider, as before.

* **OTP codes** are emailed to the owner of the phone number the code is for, when that account has an email. For an agent-assisted cash out that is the customer, not the agent. At sign-up the code goes to the email typed on the form; that is rate-limited to 3 per address and 10 per network every 15 minutes. The code screen shows both the phone and the masked email.
* **Notifications** of these types are emailed as well as shown in the app: account verification, security alerts (password/PIN changed, lockouts, suspension), money sent, money received, failed payments and settlements. They use the user's language and link back to the right screen.
* **Delivery:** handlers only queue emails. The RPC layer sends them after the call succeeds, so SMTP never runs inside a database transaction and a rolled-back request sends nothing. Failures are logged without addresses or codes.
* Reserved domains (`example.com`, `*.test`, `*.invalid`, …) never receive mail, so the demo and synthetic accounts don't either.
* `OTP_SHOW_CODES=false` stops showing codes on screen. Use it once real delivery is in place.

| Variable | Notes |
|---|---|
| `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT` | `smtp-relay.brevo.com`, `587` |
| `BREVO_SMTP_USER`, `BREVO_SMTP_PASSWORD` | Brevo → SMTP & API → SMTP |
| `EMAIL_FROM` | e.g. `"Kosh <no-reply@your-domain.com>"`. Must be a verified sender in Brevo. |
| `APP_URL` | Optional public URL for links in emails (defaults to the request's origin) |
| `OTP_SHOW_CODES` | `true` (default) shows codes on screen; `false` in production |

## Deployment (Vercel)

Production runs on Vercel as the project **`kosh-bd`** → https://kosh-bd.vercel.app.

```bash
vercel link --project kosh-bd    # once per checkout
vercel deploy --prod             # build and deploy the current folder
```

* `vercel.json` sets the Next.js framework preset and pins functions to **`sin1`** (Singapore), next to the Supabase database in `ap-southeast-1`. Every API call loads from the database, so the region matters.
* Environment variables are set on the project for Production: the same names as `.env.local` (database, `AUTH_JWT_SECRET`, AI, Brevo, SMS). Edit them with `vercel env` or in the dashboard, then redeploy. `NEXT_PUBLIC_*` values are baked in at build time.
* Queued emails and texts are sent inside Next's `after()`, so the serverless function stays alive until they're delivered.
* The project isn't connected to GitHub: pushing doesn't redeploy. Run `vercel deploy --prod` (or connect it with `vercel git connect`).
* **Network note:** some Bangladeshi ISPs block a few Vercel addresses. The first project (`kosh-mfs.vercel.app`, address `64.29.17.3`) can't be reached from some local networks, which is why production moved to `kosh-bd` (address `64.29.17.195`). If a URL hangs on one network, try another network or a VPN.

## Design notes

* **One brand, four accents.** Shells set CSS variables (`--accent-*`): emerald (Personal), amber on a dark console (Agent), indigo (Merchant), sky (Admin). Shared components read `accent-*` tokens, so they pick up the role colour automatically.
* **Charts** use a categorical palette validated for colour-blind separation. Every chart has a legend (for 2+ series), a hover tooltip and a **Table** toggle. Gridlines are hairlines, bars ≤24px with rounded data-ends, and there is always a single y-axis.
* **States everywhere:** skeleton loaders, empty states, error states with retry, toasts, confirmation dialogs for irreversible actions.
* **Responsive:** sidebar or top nav on desktop, bottom tab bar with a sheet for secondary actions on mobile.

## Limitations

* Camera QR scanning belongs in the native app. On the web, the customer pastes the QR content (copyable from the merchant screen).
* Documents uploaded before `20261007_document_files.sql` was run have metadata only; the admin viewer says the file wasn't kept.
* On Vercel, request bodies are limited to about 4.5 MB, so verification documents between 4.5 and 5 MB fail to upload there. Profile pictures (2 MB) are fine.
* The server keeps the whole database in memory and reloads it only when the change counter (`app_state.version`, `20261006_change_counter.sql`) moves. On serverless each instance has its own copy, so the first request on a fresh instance loads everything. Keep demo data small (`supabase/synthetic-data.sql` or `seed-synthetic.mjs`).
* The development KYC provider keeps selfie checks in memory. On serverless, a check started on one instance may be missing on another; the account is then created as pending verification instead of instantly verified.
* sms.net.bd trial accounts can only text their own registered number until the first recharge, and each SMS costs credit.
