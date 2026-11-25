# Deployment

See [release readiness](RELEASE-READINESS.md) for the open operator/policy decisions, secure-cookie migration checks and canonical `SITE_URL` configuration.

The runtime database is Supabase PostgreSQL. No MongoDB service or fallback is used.

## Database setup

In the existing Supabase project, open **Connect → Session pooler** and copy the PostgreSQL URI into the server's `SUPABASE_DB_URL`. Use port 5432 session pooling for this long-running Express backend. The pool uses at most five connections per API process. `SUPABASE_DB_CA=supabase/certs/prod-ca-2021.crt` points to the included public Supabase root certificate. The configured project was verified with it. Replace the certificate using the project's Database Settings download when Supabase rotates its CA. Hosted TLS certificate verification stays enabled.

Keep the URI in `.env` locally or the deployment's secret manager. Never put it in frontend variables, source control, logs, screenshots, or chat. The browser does not need a Supabase service-role or public key. The API performs all database access.

Back up the target project before a schema change, then run `npm run db:migrate`. The committed SQL creates one JSONB table per entity, foreign keys, unique constraints, checks, indexes, moderator authentication tables, and row-level security. Public/anonymous/authenticated Supabase API roles have no direct grants or policies. Run migrations with an operator database role; keep database access limited to the backend. The migration is additive/idempotent and does not copy legacy MongoDB data. Existing legacy `.data/mongo` files are preserved; migration of those records requires a separately reviewed export/import.

## Production environment

Set `NODE_ENV=production`, `APP_ORIGIN=https://your-host`, `SUPABASE_DB_URL`, `BETTER_AUTH_SECRET` (unique, 32+ characters), and `REDIS_URL`. Set `API_INTERNAL_URL` before the frontend build when Express is on another host. Optional `SMTP_URL` and `EMAIL_FROM` serve moderator accounts only. Ordinary users never supply an email or password. `ADMIN_EMAILS` allows verified moderator accounts to receive a server-managed role. Remove persisted roles explicitly when revoking access.

`APP_ORIGIN` is the frontend's browser origin, for example `https://roast-and-toast-ebon.vercel.app`. Whitespace and a trailing slash are normalized consistently for CSRF checks, authentication, cookies, and links. Credentials, page paths, query strings, and fragments are rejected. Keep this value on the Render API aligned with the public Vercel/custom domain; do not use the Render API URL here.

Startup verifies Redis readiness and command execution before serving requests, even when SMTP is disabled. Unreachable Redis fails startup rather than leaving every API request broken. The API binds to `127.0.0.1` by default; set `API_HOST=0.0.0.0` only when a separate private API container/host must accept traffic, and restrict ingress to the frontend/proxy.

Use private S3-compatible storage or a durable `.data/uploads` volume for media. Configure backups, log redaction, error monitoring, moderation staffing, legal/operator details, and retention rules. Enable `TRUST_PROXY=1` only behind one trusted proxy that replaces forwarded headers.

Run checks and `npm run build`, then `npm start`. Both API and frontend must remain on the same browser origin. Configure the host proxy accordingly. The application container needs network access to Supabase and Redis; only the frontend/proxy should be publicly exposed.

The public API is `/api/v1`; readiness is `/api/v1/health`, and its generated contract is `/api/v1/openapi.json`. Forward requests without changing methods, bodies, cookies, or the browser origin. Set `API_INTERNAL_URL` before building because Next.js rewrites are compiled into the frontend build.

Allow at least 25 seconds for a graceful container shutdown (for Docker, `--stop-timeout 25`). The launcher waits for both processes; the API drains in-flight HTTP requests before closing Redis and PostgreSQL, with a bounded shutdown deadline. Development sample records are never created automatically in production; an empty community is a valid initial state.

## Acceptance and recovery

### Visitor analytics

Run `npm run db:migrate` before deploying this feature. The migration adds private PostgreSQL analytics tables with row-level security and no browser/API-role access. The migration runner applies all committed SQL migrations in filename order; they are idempotent.

The header displays the public online count; the sidebar displays total visitors. The total remains in the header on mobile and when navigation is collapsed. Verified moderators can open **Moderation → Online** at `/admin` to see browsers active within two minutes, the all-time visitor total, unique browsers seen today (UTC), unique browsers in the last 30 days, the ten leading locations, and up to 50 recent browsers with IP addresses and their last page. Separate browser profiles/devices count separately. These are browser activity counts, not verified people or a count of page views. A browser can appear in more than one location if its network changes.

Apply the visitor-total migration with `npm run db:migrate` before deploying the updated Render API, then deploy Vercel. It seeds one anonymous aggregate from existing retained visitors and preserves that total when 30-day activity rows expire or a browser deletes its data. The aggregate contains no IPs or browser identifiers. New browsers increase it once; repeated heartbeats/tabs do not. Cleared or expired analytics cookies can count again. Already expired history is unavailable for the initial total. No new environment variables are needed.

The API looks up public IPs using `https://api.ipapi.com/api/{ip}?access_key=...`, following the [ipapi.com documentation](https://docs.apilayer.com/ipapi/docs/getting-started). Set `IPAPI_KEY` on the API host (Render) to your **ipapi.com** access key and `IPAPI_ENABLED=1`. No ipapi key is needed on Vercel; keep the existing `API_INTERNAL_URL` pointing to the Render API origin without an `/api` suffix. Keys from `ipapi.co` belong to a different service and cannot be used here. Only the IP, city, region, country, and country code response fields are requested.

[Provider plans and quotas](https://ipapi.com/pricing) apply. Missing keys skip external lookups; authentication, quota, plan, or network errors produce an unavailable location while visitor counts and IP recording continue. The integration uses HTTPS and does not fall back to HTTP. Successful lookups are cached in PostgreSQL for seven days; failed lookups are cached for 15 minutes. After replacing an invalid key, allow up to 15 minutes for an existing failed lookup to retry. `IPAPI_ENABLED=0` disables external lookups. No geolocation credentials are exposed to the browser.

Client addresses come from Express `req.ip`. With `TRUST_PROXY` unset, forwarded headers are ignored; requests through the local Next.js proxy may show a loopback address and no location. Enable `TRUST_PROXY=1` only with an ingress that replaces the forwarded client-IP header and a private API reachable only through that trusted path. Next.js rewrites alone preserve incoming forwarded headers and are insufficient to establish their trust. Verify the IP shown in staging matches the browser's public IP before relying on location rankings. Do not accept IP addresses supplied in the heartbeat body.

Activity records are excluded from reports after 30 days and physically removed during the next hourly cleanup triggered by a heartbeat. The analytics cookie expires after 30 days without a visit. Query strings and fragments are excluded from tracked paths. Browser-data deletion also removes activity associated with that browser's analytics cookie. The privacy page discloses IP storage and the ipapi.com lookup.

If the header shows **Online unavailable**, check the response rather than replacing the ipapi key: `GET /api/v1/analytics/online` needs no provider call. A `404` means the API deployment or Vercel rewrite is missing the route; redeploy the current backend and verify `API_INTERNAL_URL` points to its origin. A heartbeat `403` with `This request came from an untrusted site.` means the API's configured `APP_ORIGIN` differs from the browser's origin. Update it and restart/redeploy Render. Older builds compare a trailing slash literally, so remove any final slash when correcting an existing deployment. A missing analytics table produces a server error and requires `npm run db:migrate` against the configured Supabase project.

### Demo data cleanup

Demo seeding is off by default. For a disposable development database, explicitly set `SEED_DEMO=1` before starting the API. Production always skips seeding. Isolated automated tests enable their own fixtures. Keep the `demo-seeded` setting after cleanup so even an explicitly enabled development restart cannot silently recreate removed sample content.

Supabase correctly refuses to delete an idea that still has linked roasts or revisions. Keep those foreign keys. The normal application delete route soft-deletes posts; physical removal of sample data is an operator task:

```powershell
npm run db:demo:plan
# Review .data/demo-cleanup-plan.json and its linked-row counts.
npm run db:demo:clean
```

The preview selects only ideas explicitly marked `demo: true`. It identifies dependent discussion/revision/activity records, including any real visitors' feedback attached to those sample ideas. Cleanup preserves non-demo ideas, all profiles, settings, audit/moderation records, and historical financial records; linked financial records block cleanup. Applying a plan deletes the selected graph in dependency order within a transaction. If the database or affected content changed since preview, create and review a new plan. No schema constraint is disabled or weakened.

### Staging acceptance

Validate anonymous posting, cookie persistence, drafts, cross-browser ownership denial, concurrent revision rejection, uploads, reporting, export/deletion, and private moderator sign-in in staging. Restore a Supabase backup into a separate project and verify its records and media before relying on recovery. Back up queued mail if Redis holds pending jobs. Expired visitor sessions are rejected by the API; periodically delete rows whose `data->>'expiresAt'` is before the current UTC time using an operator-managed scheduled job. Set a retention policy before doing so.

The browser cookie is the member's editing credential. Clearing it loses access; there is no member account recovery. Do not expose cookie tokens in diagnostics.

Buy Me a Coffee support is an external link, requiring no platform payment credentials or webhook integration. Payments, recipient eligibility, receipts, disputes, and refunds occur with that provider/creator. No verified donation total is displayed, and retired simulated checkout routes return HTTP 410.

Official connection guidance: [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
