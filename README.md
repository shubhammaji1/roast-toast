# Roast & Toast

**Pitch it. Roast it. Build it.** An editorial community for unfinished ideas and useful feedback.

## Run

Requires Node.js 22.17+, npm, and an existing Supabase project.

1. Install dependencies with `npm install`.
2. Use the configured `.env` in this workspace. For a fresh checkout, copy `.env.example` to `.env` and generate a unique `BETTER_AUTH_SECRET` of at least 32 characters.
3. In your Supabase dashboard, choose **Connect → Session pooler**, then put the complete PostgreSQL URI in `SUPABASE_DB_URL`. Percent-encode special characters in the password. Keep this value server-only; do not use a `NEXT_PUBLIC_` variable or commit it.
4. Run `npm run db:migrate` to apply the schema in [supabase/migrations](supabase/migrations/202611060001_community.sql).
5. Run `npm run dev` and open http://localhost:3000. The Express API listens on port 4000.

For local development, set `APP_ORIGIN=http://localhost:3000` and `API_INTERNAL_URL=http://127.0.0.1:4000` in `.env`. Deployment URLs belong in the hosting environment; using them locally sends browser requests to the deployed API, which rejects the localhost origin. Restart `npm run dev` after changing these settings.

On Windows, `npm.cmd` works when PowerShell restricts `npm.ps1`. Scripts invoke binaries through Node so the ampersand in this workspace path is supported. Temporary files and npm caches stay on the workspace drive.

Demo records are opt-in: set `SEED_DEMO=1` only for a disposable development database. Normal startup leaves your data unchanged. To remove existing sample ideas safely, run `npm run db:demo:plan`, review its linked-row counts, then apply the reviewed plan with `npm run db:demo:clean`. See [demo cleanup](docs/DEPLOYMENT.md#demo-data-cleanup). Production never seeds sample posts.

## Posting and creator support

When Clerk is configured, sign in before submitting an idea or uploading its cover image. Each Clerk account has its own **My ideas** dashboard; published public ideas appear together on **The table** for everyone. Browsing and community participation remain open to guests. Existing guest workspaces can still be attached to a verified Clerk account from **Save my workspace** at `/account`; existing idea, draft, media, feedback and sprint IDs stay unchanged. The old guest session is revoked, and the verified account opens the same workspace on another device. Existing account activity is never overwritten; use a new account if linking reports a conflict. Unsaved drafts in local browser storage remain on that device. Unlinked guest work still depends on keeping its cookies.

Clerk handles member verification and password recovery through its hosted authentication service. Sprint reminders are separate and opt-in under My account: the API checks once per minute and queues an email during an active sprint’s last 24 hours. Completed, archived, deleted, suspended, unverified and opted-out workspaces are excluded. Keep the API running for reminders; if it is offline for the entire last 24 hours, no late reminder is sent. Without SMTP, local reminder messages are saved in the development outbox; they are not delivered to an inbox.

The publishing form accepts an optional **Buy Me a Coffee URL**, including `https://buymeacoffee.com/BeyondTheSyntax` or `buymeacoffee.com/BeyondTheSyntax`. The latter is normalized to HTTPS. Invalid URLs show inline errors without losing the draft. The form also links to the official signup page in a new tab, allowing the creator to return and paste their page URL. Local drafts survive the trip. Coffee buttons open that creator's external page. Payments, receipts, and refunds are handled there. This app does not process charges, collect payment details, or claim verified donations.

The canonical API is `/api/v1`: create posts with `POST /api/v1/ideas`, then read or revise the actual ID returned by that request. `GET /api/v1/openapi.json` serves its generated contract. Featured content uses real published records, so production does not depend on development sample IDs.

## Included features

- Publish, save drafts, revise, archive, and delete ideas; public/unlisted visibility; optimistic version checks and revision history.
- Plan low-cost validation experiments with success criteria, track outcomes, and review a private creator-only synthesis of feedback signals.
- Start a seven-day sprint from your own idea page: define a target customer, risky assumption, small test, and measurable success criteria. The server sets a seven-day deadline; track progress in Build journey and record evidence plus a Build, Change, Stop, or Test again decision to finish. Sprints share the idea's visibility and do not book reviewers. Verified account holders can opt in to deadline reminders.
- Structured roasts and replies, helpful reactions, creator acknowledgments, suggestions, milestone updates, collaborations, and notifications.
- Search, categories, latest/trending/building feeds, cursor pagination, saved ideas, and follows.
- Private draft images, validated image uploads, public profiles, mutual blocks, reports, suspensions/appeals, and audited moderation.
- Responsive navigation, local fonts, accessible dialogs, keyboard tabs, loading/error states, and reduced motion.
- Live online count in the header and an all-time visitor count in the sidebar (shown in the header on mobile or when navigation is collapsed), plus a moderator-only **Online** tab under `/admin` with total visitors, unique visitors today (UTC), 30-day visitor totals, ranked approximate locations, and recent IP addresses. Visible pages send a heartbeat every 30 seconds; a browser is online for two minutes after its last heartbeat. Tabs share a browser cookie, so multiple tabs count once. The anonymous all-time total survives activity cleanup; a cleared/expired cookie or a different browser can count as a new visitor.

Visitor analytics requires the latest database migration (`npm run db:migrate`). The API resolves public IP locations with [ipapi.com](https://docs.apilayer.com/ipapi/docs/getting-started), caches lookups, and keeps activity for 30 days. Set server-only `IPAPI_KEY` to your **ipapi.com** access key on the API host (Render). This integration uses `api.ipapi.com`, and keys from `ipapi.co` are not interchangeable. Without a key, or with `IPAPI_ENABLED=0`, counts and IP recording continue without external location lookups. Local/private addresses have no location. See [visitor analytics setup](docs/DEPLOYMENT.md#visitor-analytics) for proxy configuration.

## Architecture and security

**My Sprints** (`/my-sprints`) is available from the sidebar and the calendar shortcut in the top bar, including on phones. It lists the current browser identity's active and completed sprints, with deadline-based daily guidance and links to the matching Build journey entry. Timeline progress measures elapsed time, not completed tasks. Deleted ideas are excluded; completed and inconclusive sprints appear in Completed sprints.

`apps/web` uses Next.js, React, TypeScript, TanStack Query, and a custom visual system. `apps/api` uses Express, Zod, and PostgreSQL on Supabase. `packages/domain` contains shared input contracts. MongoDB and Mongoose are removed.

The API connects through `pg`, with parameterized SQL and a small repository layer. Each entity has its own JSONB table, with unique indexes, foreign keys on generated relationship columns, state checks, and feed indexes. SQL transactions cover coupled writes; version predicates reject stale edits. Supabase tables have row-level security enabled with no public API policies. Browser clients access the same-origin Express API, which enforces ownership, privacy, CSRF checks, and moderation. Database credentials never reach the browser. TLS certificate validation remains enabled for hosted connections.

Member authentication uses Clerk. Set matching `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and server-only `CLERK_SECRET_KEY` from the same Clerk application in `.env`, then restart the dev server (or rebuild/redeploy). Enable email sign-up, verification and password recovery in Clerk. `/account` hosts its sign-up and sign-in components. The API verifies session tokens for `APP_ORIGIN` and checks the current Clerk user and session before granting access. Never expose the secret key in browser configuration.

`/admin` retains the existing Better Auth moderator sign-in. `ADMIN_EMAILS` names eligible verified moderator emails; roles remain server-managed. SMTP is independent of Clerk: configure `SMTP_URL` and `EMAIL_FROM` for sprint reminders and moderator emails. Production also requires HTTPS, a unique Better Auth secret, and Redis for shared limits and email retries. Run `npm run db:migrate` for the workspace-link uniqueness index. Optional private S3 storage is supported for uploads; otherwise provision a durable uploads volume.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

API tests apply the committed SQL migration to isolated embedded PostgreSQL (PGlite). Browser tests automatically start an isolated PostgreSQL test API and an exact frontend source copy under `.data/e2e-web` on ports 4001/3001; they do not touch your Supabase project or `.env` connection. Playwright runs visibly locally and headlessly under CI. Install Chromium if needed using `node node_modules/@playwright/test/cli.js install chromium`. Screenshots go to `.data/qa`, failure traces to `test-results`.

Docker Compose optionally supplies local Redis and Mailpit. The database remains your configured Supabase project. See [deployment setup](docs/DEPLOYMENT.md) and [verification status](docs/VERIFICATION.md).

No hosted deployment or real payment is implied. The Supabase connection must be configured and tested against your project before launch. AI features remain unconnected. Legal pages identify the operator details and review still needed.
