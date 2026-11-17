# Before making this a public production service

The technical QA fixes do not supply the operator facts required to finish the Privacy and Terms pages. The owner confirmed on 16 November 2026 that these decisions have not yet been made. Keep the existing development notices and `noindex` until they are settled; do not invent details or claim the policies were reviewed.

## Decisions the owner needs to make

| Information | What to supply |
|---|---|
| Operator | The person or business responsible for running the service |
| Public contact | A monitored email address for privacy and service questions |
| Location | The operator's country and jurisdiction, for appropriate policy review |
| Retention | How long to keep inactive identities, deleted content, reports, audit records, uploads, logs and backups |
| Hosting/processors | Confirm the actual hosting, database, file and email services |
| Eligibility and disputes | Decide with appropriate review before finalizing Terms |

These are open decisions, not default promises. Visitor sessions expire after one year; that does not automatically delete database records or backups. API deletion hides content and anonymizes the identity. Any promised retention schedule must have implemented cleanup and backup handling.

## Deployment verification

- Use `NODE_ENV=production` for the API and set `APP_ORIGIN` to the public HTTPS frontend. Cookies are also secured whenever the configured app origin uses HTTPS, even if NODE_ENV was misconfigured.
- Validated legacy `rt-visitor` cookies are upgraded when the production `__Host-rt-visitor` cookie is absent. Confirm returning users retain their drafts/posts. An invalid primary cookie does not fall back to a different identity.
- Verify fresh and returning cookies have Secure, HttpOnly, SameSite=Lax and Path=/. Deleting the identity clears both cookie names. Do not remove existing session records during migration.
- Set frontend `SITE_URL` to the canonical public frontend origin if it differs from `https://roast-and-toast-ebon.vercel.app`. It controls metadata, not API routing. `API_INTERNAL_URL` points to the API reachable from the frontend server.
- After deployment, rerun public smoke/accessibility checks and mobile Lighthouse against the deployed revision. Local measurements do not measure hosting latency or the production API.
- Keep indexing disabled until operator/policy decisions and deployment verification are complete.

Browser/API tests use an isolated database. No test requires deleting or seeding production data.
