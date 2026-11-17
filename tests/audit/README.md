# Read-only deployment audit

Run from the repository root:

```powershell
node node_modules/@playwright/test/cli.js test --config tests/audit.config.ts
```

The default target is https://roast-and-toast-ebon.vercel.app. Set `AUDIT_URL` to override it. These tests block API write methods in the browser. Ordinary GET requests can initialize the site's anonymous browsing cookie. Do not run the existing publishing suite against a public deployment: `npm run test:e2e` starts its own isolated database and frontend when `TEST_BASE_URL` is unset.

The public suite covers desktop and Pixel 7 browser emulation, navigation/history, keyboard skip link, category/feed controls, search edge cases, six intercepted API error responses, session retry, and empty form validation. It expects the current deployment's empty feed. For a populated environment, replace empty-state assertions with deterministic staging fixtures; this suite does not verify search relevance with production data.

The first audit's evidence and reports are in `.data/audit-2026-11-16` and `docs/QA-AUDIT-2026-11-16.md`. Initial test-development failures were retained separately and are not automatically product defects. Browser screenshots and traces are local artifacts and can contain browser session details; review them before sharing.

The inventory runner saves route text, response headers, accessibility results, screenshots, all 26 requested viewports, and width sweeps. Run `node tests/audit/inventory.cjs` from the root. It uses installed Playwright browsers and `@axe-core/playwright`. Its final extra browser checks only cover homepage loading; see the separate cross-browser evidence for deeper checks.

To diagnose resize animation timing in the existing local suite:

```powershell
node node_modules/@playwright/test/cli.js test --config tests/audit-local.config.ts --grep 'a visitor can explore'
```

This disables motion; it does not silently change the original test's failure result. Keep role locators scoped to `main` where Next.js also supplies a route-announcer alert.
