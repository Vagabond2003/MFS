# Kosh — MFS web app (frontend)

A Mobile Financial Services web app with three isolated customer roles — **Personal**, **Agent**, **Merchant** — plus an **Admin** back office.

> **Scope of this repository: frontend only.**
> There is no database or backend server here. The UI talks to a typed API contract (`src/services/contracts.ts`) with two implementations:
>
> | Mode | What it is | Use it for |
> |---|---|---|
> | `mock` (default) | An in-browser development server with seeded, fictional data, persisted to `localStorage`. It enforces the same rules a backend must (sessions, RBAC, verification gates, fees, limits, PIN/OTP, atomic posting, audit log). | Running and demoing the app locally |
> | `http` | A REST client for a real backend (see [API contract](#connecting-a-real-backend)). | Production |
>
> **The mock is not a security boundary.** Anything running in a browser can be modified by its user. It exists so every flow can be exercised end-to-end today. Real security comes from the backend implementing the contract below.

---

## Quick start

Requirements: Node.js 20.9+ (tested on Node 25), npm.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000. No database setup is needed in mock mode: the demo dataset (about six months of activity) is generated in your browser on first load. Use **Reset data** in the yellow demo banner to start over.

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`.

### Demo accounts (development only — fictional people and businesses)

Password for all: **`Demo@1234`** · Transaction PIN: **`24680`**. The login page lists these and fills the form on click. OTP codes are shown on screen by the **development SMS provider**.

| Role | Sign in with | State |
|---|---|---|
| Personal | `01710000001` (Nadia Islam) | Verified — main demo customer |
| Personal | `01710000002` (Tanvir Ahmed) | Verified |
| Personal | `01710000003` (Farhana Kabir) | KYC pending — ৳5,000/txn limit |
| Agent | `01810000001` (Hossain Telecom Point) | Verified |
| Agent | `01810000002` (Akter Mobile Corner) | Under review — counter operations locked |
| Merchant | `01910000001` (Spice Garden Restaurant, `MR-40021`) | Verified |
| Merchant | `01910000002` (FreshMart Grocery, `MR-40022`) | Pending — cannot receive payments |
| Admin | `admin@example.com` | 2FA on (OTP at sign-in) |

### A five-minute tour

1. **Role isolation.** Sign in as Nadia, then type `/dashboard/merchant` in the address bar → **403**. The proxy blocks it before the page renders.
2. **Step-up auth.** Send ৳10,000+ to `01710000002` → PIN **and** OTP are required. Enter a wrong PIN 3 times → PIN locked for 15 minutes.
3. **Verification gate.** Sign in as `01810000002` (agent under review) → counter operations are locked. Sign in as admin → **Verifications** → approve *Akter Mobile Corner* → sign back in as the agent → Cash In works.
4. **Unverified merchant.** As Nadia, *Merchant Pay* → `MR-40022` → refused server-side.
5. **Dynamic QR.** As Spice Garden → *Receive payment* → generate a QR → *Simulate customer payment* (development QR provider) → confirmation appears live.
6. **Agent-assisted Cash Out.** As agent `01810000001` → *Cash Out* for `01710000001` → the customer's OTP appears on screen.
7. **Registration.** `/register` → pick a role → complete the wizard (OTP shown on screen; uploads are type-, size- and magic-byte-checked).

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
                                                  ├─ services/mock  (dev server in the browser)
                                                  └─ services/http  (REST backend)
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
│  └─ (app)/                    Authenticated area (AppFrame)
│     ├─ dashboard/personal/*   send, cash-out, recharge, pay-bill, merchant-pay, add-money
│     ├─ dashboard/agent/*      cash-in, cash-out, recharge, customer-payment, commission, settlement, verification
│     ├─ dashboard/merchant/*   receive, qr, sales, refunds, settlement, business
│     ├─ admin/*                users, verifications, transactions, disputes, audit-logs
│     └─ transactions, notifications, profile   (shared, rendered in the caller's shell)
├─ features/                    Screens, grouped by role/domain
├─ components/
│  ├─ ui/                       Design system (Button, Card, Field, Modal/Sheet, Table, Badge, CodeInput, FileDrop…)
│  ├─ charts/                   Recharts wrappers (validated palette, legend + tooltip + table view)
│  ├─ shells/                   Four different app shells + mobile bottom navs
│  ├─ flows/transaction-flow    Shared details → review/PIN/OTP → receipt wizard
│  ├─ transactions/             History table, filters, receipt
│  └─ guards/app-frame          Client auth/RBAC guard
├─ services/
│  ├─ contracts.ts              The API contract the UI depends on
│  ├─ http/                     REST implementation
│  ├─ mock/                     Development server: schema, store (atomic writes), ledger,
│  │                            policy (fees/limits/RBAC), seed, analytics, handlers
│  └─ providers/                SMS/OTP, KYC, storage, payment gateway, billers, QR codec — dev implementations
├─ lib/                         auth (access map, session token), validation (zod, shared), utils
├─ hooks/                       use-auth, use-api (fetch + tag invalidation), use-hydrated
├─ config/                      navigation, demo accounts
└─ types/domain.ts              View types returned by the API
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
| Merchant Payment | Personal → **verified** merchant | Free for customer; merchant pays 1.5% | ৳1–50,000 |
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
| Rate limiting | fixed-window limiter for login, OTP sends, password reset and uploads; PIN/password lockouts |
| CSRF | http client sends `X-CSRF-Token` (double-submit cookie) on every mutating request; cookie is `SameSite=Lax` |
| Upload validation | extension, MIME, ≤5 MB and **magic bytes** checked; SHA-256 recorded; stored privately |
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
| Profile & security | `GET/PATCH /profile` · `POST /security/password` · `POST /security/pin/otp` · `POST /security/pin` · `POST /security/2fa/otp` · `POST /security/2fa` · `GET /security/sessions` · `DELETE /security/sessions/:id` · `POST /security/logout-all` · `GET /security/login-history` |
| Dashboards | `GET /personal/dashboard` · `GET /personal/recipients` · `GET /agent/dashboard` · `GET /agent/commissions` · `GET /agent/settlements` · `GET /merchant/dashboard` · `GET /merchant/settlements` |
| Merchant QR | `GET /merchant/qr` · `POST /merchant/payment-requests` · `GET /merchant/payment-requests[/:id]` · `POST /merchant/payment-requests/:id/cancel` |
| Lookups | `GET /billers` · `GET /billers/:id/bills?account=` · `POST /merchants/resolve` |
| Admin | `GET /admin/stats` · `GET /admin/users[/:id]` · `POST /admin/users/:id/status` · `GET /admin/verifications` · `POST /admin/verifications/:userId/decision` · `POST /admin/documents/:id/review` · `GET /admin/transactions` · `GET /admin/disputes` · `PATCH /admin/disputes/:id` · `GET /admin/audit-logs` |

Request and response shapes are the TypeScript types in `src/services/contracts.ts` and `src/types/domain.ts`.

### Data model the backend should provide

`services/mock/schema.ts` mirrors the relational schema. Tables: `users` (role enum `PERSONAL | AGENT | MERCHANT | ADMIN`), `personal_profiles`, `agent_profiles`, `merchant_profiles`, `merchant_businesses`, `account_status_history`, `verification_documents`, `wallets` (with an optimistic-lock `version`), `transactions` + `transaction_parties`, `commissions`, `settlements` (settlement transactions), `notifications`, `otp_codes` (hashed codes bound to a context), `sessions`, `audit_logs` (append-only), `disputes`, `payment_requests`, `rate_limits` and `idempotency_keys`.

## Design notes

* **One brand, four accents.** Shells set CSS variables (`--accent-*`): emerald (Personal), amber on a dark console (Agent), indigo (Merchant), sky (Admin). Shared components read `accent-*` tokens, so they pick up the role colour automatically.
* **Charts** use a categorical palette validated for colour-blind separation. Every chart has a legend (for 2+ series), a hover tooltip and a **Table** toggle. Gridlines are hairlines, bars ≤24px with rounded data-ends, and there is always a single y-axis.
* **States everywhere:** skeleton loaders, empty states, error states with retry, toasts, confirmation dialogs for irreversible actions.
* **Responsive:** sidebar or top nav on desktop, bottom tab bar with a sheet for secondary actions on mobile.

## Limitations

* Mock mode keeps data in one browser profile. One browser holds one session at a time (use a second browser profile to act as two users at once).
* Camera QR scanning belongs in the native app. On the web, the customer pastes the QR content (copyable from the merchant screen).
* Document previews show a placeholder: the development storage provider keeps metadata and a hash only.
