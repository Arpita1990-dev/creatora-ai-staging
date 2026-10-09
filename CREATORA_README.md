# Creatora AI

Creatora AI is a product-focused SaaS layer built on the MIT-licensed Open Generative AI repository. It presents AI generation as business outcomes—product ads, product photography, short video and campaigns—while retaining the upstream advanced studios at `/studio`.

## Included

- Responsive marketing site and pricing
- Sign-in, sign-up and organization onboarding UI
- SaaS dashboard with credits, templates, projects and recent activity
- Product ad, image, video and campaign creation flows
- Projects, assets, templates, workflows, brand kit, team and settings views
- Existing image/video/audio/agent/workflow studios
- Server-side environment template and health endpoint

## Run locally

Requirements: Node.js 20+ and Git.

```bash
git submodule update --init --recursive
npm install
cp .env.example .env.local
npm run build:packages
npm run dev
```

Open `http://localhost:3000`. The product dashboard is at `/dashboard`; the upstream advanced generation interface is at `/studio`.

For live cloud generation, add a MuAPI key to `.env.local`. Kie.ai settings can remain configured for compatibility, but new video, audio, voiceover, and music jobs use MuAPI. Keep provider and billing secrets server-side; do not prefix them with `NEXT_PUBLIC_`.

## Transactional email

Current delivery: signup / resend verification / password recovery ->
`lib/email.js` -> server-only `lib/providers/resendEmail.js` -> official Resend SDK.
Verification uses opaque links, not numeric OTPs. Existing hashed token storage,
24-hour verification expiry, one-hour reset expiry, and verification logic remain
unchanged. Welcome and organization notification emails are not implemented.

Configure `RESEND_API_KEY`, `EMAIL_FROM_NAME`, and `EMAIL_FROM_EMAIL` in the
server environment. `APP_URL` is the canonical server-side application origin:
keep `http://localhost:3000` for local development, set the stable staging URL
for Vercel Preview, and set the configured application URL for Production.
Verification and reset links use this value. No email key may use a
`NEXT_PUBLIC_` prefix. Unrelated local environment settings are preserved.
Restart the application after updating configuration.

Verify `creatora-ai.online` (or the chosen sending subdomain) in the Resend
dashboard, apply only the exact DNS records it provides, and select an authorized
sender address on that verified domain. This migration does not configure DNS
and does not assume particular DNS records. Resend is the only transactional
email provider; missing configuration fails safely without a provider fallback.

Signup and resend controls remain disabled in flight and now also guard immediate
double-clicks. Identical email-producing API requests coalesce and replay successful
responses for 60 seconds within one server process. Every request still counts
toward the existing per-IP limit. Failed signup delivery can be retried immediately.
Resend idempotency keys are hashes of the email operation, recipient and existing
token; retries of the same token use the same key without exposing the token.
The request cache is bounded and process-local: separate replicas or restarts can
still create distinct tokens for concurrent requests. Guaranteed cross-replica
request deduplication would require an approved shared store, outside this migration.

The provider validates configuration and addresses, aborts requests after 15 seconds,
and logs only provider, operation, status and a safe error category. Resend 6.32.0
is pinned because its development error logger is overridden per client to prevent
raw provider-response logging. Re-audit this behavior before upgrading the SDK.
There is no automatic delivery retry. Signup delivery failure leaves the account
pending and reports `emailSent: false`; password recovery retains its generic
response, and resend failures return safe application errors.

Run the focused delivery and auth regression tests with:

```bash
node --conditions=react-server --test tests/email.test.js tests/authEmail.test.js
```

The auth regression harness uses `node:module.registerHooks` on Node 22.15+.
It isolates database and provider calls; it is not a live database or inbox test.
Before production acceptance, test signup inbox delivery, resend after the replay
window, valid/invalid/expired/reused verification links, password-reset delivery
and valid/invalid/expired/reused reset links. Check both HTML and plain-text mail,
sender identity, domain authentication, and provider-failure recovery.

## Workspace subscription billing

`lib/planCatalog.js` is authoritative for plan prices and entitlements;
`lib/pricingPlans.js` derives display features from it. Free has two projects,
limited images and no video, Avatar Video or social publishing. Creator includes
ten projects and one account per platform; Pro includes unlimited projects and
five accounts per platform. Business retains its organization-only monthly
price and ten-account/team limits. Avatar Video is available on all paid plans.
Existing Plan features JSON stores Avatar access; no database migration is needed.

Razorpay Subscriptions use the existing billing routes:

- `/api/billing/subscription`: authenticated workspace plans, checkout and cancellation.
- `/api/billing/verify`: verify the subscription payment signature, without granting access.
- `/api/webhooks/razorpay`: validate the raw-body signature and reconcile current provider state.

Configure these existing server-only variables in test mode first:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_CREATOR_MONTHLY_PLAN_ID`
- `RAZORPAY_PRO_MONTHLY_PLAN_ID`
- `RAZORPAY_BUSINESS_MONTHLY_PLAN_ID`

Create monthly INR plans in the matching Razorpay mode for INR 599, INR 1499,
and INR 4999. Checkout validates the configured provider plan amount, currency,
period and interval; browser-supplied prices are ignored. Expose only the safe
Checkout key ID and subscription details, never the key secret. Configure a
public HTTPS webhook URL at `/api/webhooks/razorpay` with the matching secret,
and enable authenticated, activated, charged, pending, halted, paused, resumed,
cancelled, completed and updated subscription events. Local webhook testing
requires a secure tunnel or a deployed test environment; no DNS change is needed.

Owner, Admin and Billing roles may manage subscriptions. Personal plans cannot
be applied to organization workspaces, and Business cannot be purchased for a
personal workspace. One unique Subscription row is retained per workspace.
Atomic checkout reservations prevent concurrent provider creations; pending
checkouts for the same plan are reused. Authenticated but unpaid subscriptions
remain pending. Signed webhooks fetch current Razorpay state before updating
the database so replayed older events cannot reinstate a cancelled plan.
The UI polls briefly for delayed activation and reads the effective plan from
the backend on refresh. Activation never grants MuAPI credits or changes BYOK
keys/balances; displayed credits remain provider USD multiplied by 100.

If provider creation times out ambiguously or a process crashes after reserving
checkout, the reservation is retained to prevent duplicate charges. An operator
must inspect the provider's subscriptions and reconcile the workspace before
clearing that reservation; do not blindly create another subscription.
Existing active paid subscriptions must be cancelled before purchasing a
different plan; cancellation takes effect at the end of the billing period.

Generation endpoints and the shared job boundary enforce video/Avatar access
before provider calls. Existing project/image limits remain server-authoritative.
Destination persistence checks all platform account caps in a serializable
transaction; OAuth callbacks and publishing implementations are unchanged.
Legacy connections discovered above a new lower quota are not permitted to
create additional destinations; choose/disconnect accounts within the allowance.

```bash
node --conditions=react-server --test tests/billing.test.js tests/billingRoutes.test.js tests/socialDestinations.test.js
npm run lint
npm run build
```

Tests use fake provider responses and isolated database doubles, not real charges.
Before production rollout, configure test-mode credentials/plans/webhooks and
perform hosted successful, failed and cancelled test checkouts, including delayed
webhook delivery and refresh. Only then configure matching live-mode settings.

## Important MVP boundary

Authentication and billing still need production service credentials before launch. Generation uses Redis + BullMQ and app-owned media storage; production deployments can replace the local SQLite/storage volumes with Postgres and S3-compatible storage.

## License

This derivative retains the upstream `LICENSE`. Review the terms of model providers, APIs, submodules and third-party assets separately before commercial release.

# Asynchronous campaign generation

Campaign media requests are queued and return immediately. MuAPI handles new
media generation, and FFmpeg creates the permanent final MP4 and thumbnail.

1. Copy the provider and queue settings from `.env.example` into `.env.local`.
2. Set `MUAPI_API_KEY`, `REDIS_URL`, and a publicly reachable
   `APP_URL` (required when a provider must fetch a locally uploaded reference).
3. Start the web application with `npm run dev` and the background consumer
   with `npm run worker`.

Generate distinct template previews from each template thumbnail and save the
MuAPI URLs in Prisma with `npm run db:generate-template-previews`. The command
is resumable and skips completed templates; inspect progress with
`npm run db:generate-template-previews -- --status`.

`docker compose up --build` starts the web application, Redis, and the worker
with shared database and generated-media volumes. Provider keys remain
server-side. Browser status endpoints only return neutral progress messages and
never reveal which provider handled a job.
