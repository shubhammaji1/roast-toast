# Roast & Toast

**Pitch it. Roast it. Build it.** An editorial community for unfinished ideas and useful feedback.

## Run

Requires Node.js 22.17+, npm, and an existing Supabase project.

1. Install dependencies with `npm install`.
2. Use the configured `.env` in this workspace. For a fresh checkout, copy `.env.example` to `.env` and generate a unique `BETTER_AUTH_SECRET` of at least 32 characters.
3. In your Supabase dashboard, choose **Connect → Session pooler**, then put the complete PostgreSQL URI in `SUPABASE_DB_URL`. Percent-encode special characters in the password. Keep this value server-only; do not use a `NEXT_PUBLIC_` variable or commit it.
4. Run `npm run db:migrate` to apply the schema in [supabase/migrations](supabase/migrations/202611060001_community.sql).
5. Run `npm run dev` and open http://localhost:3000. The Express API listens on port 4000.

On Windows, `npm.cmd` works when PowerShell restricts `npm.ps1`. Scripts invoke binaries through Node so the ampersand in this workspace path is supported. Temporary files and npm caches stay on the workspace drive.

Demo records are opt-in: set `SEED_DEMO=1` only for a disposable development database. Normal startup leaves your data unchanged. To remove existing sample ideas safely, run `npm run db:demo:plan`, review its linked-row counts, then apply the reviewed plan with `npm run db:demo:clean`. See [demo cleanup](docs/DEPLOYMENT.md#demo-data-cleanup). Production never seeds sample posts.

## Posting and creator support

There is **no member login or signup**. A random, HTTP-only browser cookie keeps ownership of posts, drafts, saves, and interactions. Only a hash of this secret is stored in Supabase. Clearing cookies or moving to another browser loses editing access; there is no email recovery account. You can edit your name/profile, export your data, or delete your browser identity from **Your space**.

The publishing form accepts an optional **Buy Me a Coffee URL**, including `https://buymeacoffee.com/BeyondTheSyntax` or `buymeacoffee.com/BeyondTheSyntax`. The latter is normalized to HTTPS. Invalid URLs show inline errors without losing the draft. The form also links to the official signup page in a new tab, allowing the creator to return and paste their page URL. Local drafts survive the trip. Coffee buttons open that creator's external page. Payments, receipts, and refunds are handled there. This app does not process charges, collect payment details, or claim verified donations.

The canonical API is `/api/v1`: create posts with `POST /api/v1/ideas`, then read or revise the actual ID returned by that request. `GET /api/v1/openapi.json` serves its generated contract. Featured content uses real published records, so production does not depend on development sample IDs.

## Included features

- Publish, save drafts, revise, archive, and delete ideas; public/unlisted visibility; optimistic version checks and revision history.
- Structured roasts and replies, helpful reactions, creator acknowledgments, suggestions, milestone updates, collaborations, and notifications.
- Search, categories, latest/trending/building feeds, cursor pagination, saved ideas, and follows.
- Private draft images, validated image uploads, profile privacy, mutual blocks, reports, suspensions/appeals, and audited moderation.
- Responsive navigation, local fonts, accessible dialogs, keyboard tabs, loading/error states, and reduced motion.

## Architecture and security

`apps/web` uses Next.js, React, TypeScript, TanStack Query, and a custom visual system. `apps/api` uses Express, Zod, and PostgreSQL on Supabase. `packages/domain` contains shared input contracts. MongoDB and Mongoose are removed.

The API connects through `pg`, with parameterized SQL and a small repository layer. Each entity has its own JSONB table, with unique indexes, foreign keys on generated relationship columns, state checks, and feed indexes. SQL transactions cover coupled writes; version predicates reject stale edits. Supabase tables have row-level security enabled with no public API policies. Browser clients access the same-origin Express API, which enforces ownership, privacy, CSRF checks, and moderation. Database credentials never reach the browser. TLS certificate validation remains enabled for hosted connections.

Moderator accounts are separate and use Better Auth's PostgreSQL adapter. Only `/admin` exposes moderator sign-in. `ADMIN_EMAILS` names eligible **verified** moderator emails; roles are server-managed. Configure SMTP when using private moderator accounts in production. Production also requires HTTPS, a unique secret, and Redis for shared abuse limits. Optional private S3 storage is supported for uploads; otherwise provision a durable uploads volume.

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
