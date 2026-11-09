<!-- Supabase PostgreSQL is the persistence layer for all routes. -->

# REST API contracts

All paths below are relative to the browser's origin under **`/api/v1`**. `GET /api/v1` lists the API resources; `GET /api/v1/openapi.json` serves the machine-readable contract. Members use an automatic HTTP-only ownership cookie, without signup. Better Auth cookies are reserved for moderator accounts. Send JSON for mutations except multipart image uploads. Zod validates input. Errors use `{ "error": "Human-readable message" }` and optional `fields.fieldErrors`. GET `/visitor-session` starts a browser identity; include its cookie on private requests. Mutations also create an identity when needed. Status codes include 400 validation, 401 missing browser identity, 403 permission, 404 private/unavailable, 409 conflicting write, 410 retired payment route, 413 oversized content, 429 limits, and 503 unavailable service.

Browser cross-origin and cross-site mutation requests are rejected. Browser ownership is resolved before private routes; GET `/api/v1/visitor-session` creates an account-free cookie identity. Moderator routes require an authenticated admin. Responses are `no-store`. The API never sends passwords, auth account tokens, session cookies, or verification tokens through community endpoints. Development test inbox access is limited to the signed-in recipient and is absent in production.

Legacy `/api/*` requests remain compatibility aliases. Old names `/me`, `/config`, `/admin/config`, `/profile`, `/account/export`, and `/account` map to `/visitor-session`, `/community-settings`, `/admin/community-settings`, `/profiles/me`, `/my-data`, and `/my-data`. Use the canonical versioned routes for new clients.

## Browser identity and private moderator accounts

The `/auth/*` routes below serve private moderator accounts. Public posting and interactions do not use them.

| Method and path                      | Contract                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/sign-up/email`           | Better Auth: name, email, password (12+ chars)                                                                                   |
| `POST /auth/sign-in/email`           | Better Auth: email, password                                                                                                     |
| `POST /auth/sign-out`                | End the session                                                                                                                  |
| `POST /auth/send-verification-email` | Email and callback URL; library owns token generation/verification                                                               |
| `POST /auth/request-password-reset`  | Email and redirect URL; does not reveal account existence                                                                        |
| `POST /auth/reset-password`          | Reset token and new password                                                                                                     |
| `GET /visitor-session`               | Current user/profile plus development and integration availability                                                               |
| `GET /profiles/:username`            | Public profile and public ideas; privacy settings respected                                                                      |
| `PATCH /profiles/me`                 | Name, lowercase username, bio, skills, HTTP(S) website, private boolean                                                          |
| `GET /my-data`                       | Current browser identity's profile and authored/interaction records, JSON attachment                                             |
| `DELETE /my-data`                    | Visitors use `{confirmation:"DELETE MY DATA"}`; moderator accounts use `DELETE MY ACCOUNT` with a recently authenticated session |
| `GET /dev/outbox`                    | Development only, authenticated recipient's test emails                                                                          |

## Ideas and discovery

`GET /community-settings` exposes only public community settings. `PATCH /admin/community-settings` requires a moderator and validates publishing/coffee flags, the categories open to new pitches, and legacy coffee presets (retained for compatibility). Changes are audited. The coffee flag controls external creator links.

| Method and path             | Contract                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /ideas`                | `tab`, `q` (100 chars), `category`, `limit` (1–20, default 8), `cursor`; returns `{ideas,nextCursor}`  |
| `POST /ideas`               | Idea contract below; creates a browser identity when needed; returns the new idea with its actual `id` |
| `GET /ideas/:id`            | Idea, roasts/replies, improvements, milestones/experiments, an empty legacy supporters list, revision summaries; creator-only feedback signal summary |
| `PATCH /ideas/:id`          | Complete idea contract plus current integer `version`; author only; conflicts return 409               |
| `DELETE /ideas/:id`         | Author only; soft-deletes and removes read access                                                      |
| `POST /ideas/:id/reactions` | `{kind:"interest"                                                                                      | "bookmark" | "follow",active:boolean}`; explicit state makes repeated requests idempotent |
| `POST /media`               | Authenticated multipart field `image`; max 2 MB; JPEG/PNG/WebP only; returns media ID                  |
| `GET /media/:id`            | Owner or image attached to accessible published idea; draft/unattached files remain private            |

Feed tabs: `for-you`, `latest`, `trending`, `needs-feedback`, `building`, `saved`, `mine`, `following`. Personal tabs require a session. General discovery excludes drafts, archived, unlisted, deleted and mutually blocked authors. Saved/followed lists may include unlisted posts a member already knows. Newest feeds use `(createdAt,id)` cursors; trending uses `(interest count,id)`. Activity changes can change trending ordering between requests.

Idea input: title (8–140), pitch (30–1000), problem/solution (up to 3000), audience (500), category, stage, invited tone, visibility (`public`/`unlisted`), status (`draft`/`published`/`archived`), prototype (empty or HTTP(S)), up to five tags (24 chars each), optional owned `coverImage` ID. Shared schemas are in `packages/domain/src/index.ts`.

Create with `POST /api/v1/ideas` and use the `id` returned in the HTTP 201 JSON response for `GET /api/v1/ideas/{id}` and subsequent edits. For example, a valid creator link is `https://buymeacoffee.com/BeyondTheSyntax`. The sample ID `000000000000000000000101` belongs to development seed data; production does not create demo posts and returns HTTP 404 if that record does not exist. The frontend discovers real published ideas instead of assuming demo records exist.

`PATCH /ideas/:id` accepts a complete idea contract with the current `version`, rather than a partial document. Omit `coverImage` to remove an existing cover. Its old image becomes private unless another accessible published idea references it. Drafts remain saveable while new publishing is paused, but promoting a draft must satisfy current publishing/category rules.

## Feedback and building

| Method and path                  | Contract                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /ideas/:id/roasts`         | Tone, critique (12–2000), suggestion (12–1500), optional punchline (240); cannot exceed creator's invited tone |
| `POST /roasts/:id/helpful`       | `{active:boolean}`; idempotent helpful signal                                                                  |
| `POST /roasts/:id/replies`       | `{body:string}` (2–1500); parent idea's read permissions rechecked                                             |
| `POST /roasts/:id/acknowledge`   | Creator-only acknowledgment toggle                                                                             |
| `POST /ideas/:id/improvements`   | Category and body (12–2000)                                                                                    |
| `PATCH /improvements/:id`        | Creator-only state: Exploring/Accepted/Declined/Implemented                                                    |
| `POST /ideas/:id/milestones`     | Creator-only title (5–140), body (12–2000), stage; self-reported, updates idea stage                           |
| `POST /ideas/:id/experiments`    | Creator-only hypothesis (8–240), experiment (12–1500), success criteria (5–300); starts Planned                |
| `PATCH /experiments/:id`         | Creator-only status (Planned/In progress/Complete/Inconclusive) and optional outcome (up to 1000)               |
| `POST /ideas/:id/collaborations` | Body (20–2000), one request per idea/applicant                                                                 |
| `GET /collaborations`            | Signed-in applicant or receiving creator's requests                                                            |
| `PATCH /collaborations/:id`      | Receiving creator only, pending request → accepted/declined                                                    |
| `GET /notifications`             | Current member, newest 100                                                                                     |
| `POST /notifications/read`       | Marks only current member's notifications read                                                                 |

The creator-only feedback summary counts visible roasts, helpful votes, suggestions, implemented suggestions, and the three most common suggestion categories. It is descriptive, not an AI-generated verdict. Current detail bounds: 100 roasts, improvements and milestones, 50 replies per roast, 50 supporters/revisions. Dedicated pagination for very large discussions is a documented next production step; no unlimited response is promised.

## Trust and moderation

| Method and path            | Contract                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /reports`            | Target ID, target type idea/roast/user, reason (10–1000)                                    |
| `POST /blocks`             | `{blockedId,active}`; mutual visibility and interaction filtering                           |
| `GET /blocks`              | Current member's blocks                                                                     |
| `POST /appeals`            | Body (20–2000); permitted for suspended members                                             |
| `GET /admin`               | Server-authorized moderator only: reports, appeals, bounded member summaries, orders, audit |
| `PATCH /admin/reports/:id` | Resolve/dismiss, reason, optional hide; writes audit/moderation records                     |
| `PATCH /admin/users/:id`   | Suspend/restore and reason; cannot suspend admins through this endpoint                     |
| `PATCH /admin/appeals/:id` | Accept/decline; accepted appeal restores the account                                        |

## Creator support

| Method and path             | Contract                        |
| --------------------------- | ------------------------------- |
| `POST /ideas/:id/coffee`    | Retired, 410                    |
| `POST /coffee/:id/simulate` | Retired, 410                    |
| `POST /coffee/:id/refund`   | Retired, 410                    |
| `GET /coffee`               | Retired, 410                    |
| `POST /payments/webhook`    | Retired, 410; no event accepted |

Ideas accept an optional `buyMeACoffeeUrl` and `creatorName`. Links must use HTTPS and the exact Buy Me a Coffee hostname with a single creator path; lookalike domains and reserved paths are rejected. Pasting `buymeacoffee.com/BeyondTheSyntax` or its `www` form safely adds HTTPS. Creator path capitalization is preserved; surrounding spaces, query parameters, and fragments are removed from the canonical stored URL. The URL opens externally in a new tab. Payment processing, receipts, and refunds happen there. No platform payment keys or verified donation total are used.
