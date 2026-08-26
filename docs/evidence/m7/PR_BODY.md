## Summary

M7 Integration / Legacy UI cleanup.

## Production base SHA

`d89a9d7ad52f5580b65a2a44b0e350295ef542c7` (M6 merge, PR #7)

## Mockup reference SHA

`db8941dc3056f07862014242a349ae366da59e9c`

## Legacy Route Matrix

| Legacy route | Canonical destination | Result |
| --- | --- | --- |
| `/settings/members` | `/other/members` | PASS: replace redirect, no legacy render |
| `/tasks` | `/home` | PASS |
| `/tasks/:taskId` | `/tasks/:taskId/edit` | PASS |
| `/tasks/:taskId/respond` | `/home` | PASS; no action is executed |
| `/tasks/templates` | `/tasks/new` | PASS |
| `/tasks/templates/:templateId/edit` | `/tasks/new` | PASS |
| `/shopping/items/:itemId` | `/shopping?item=:itemId` | PASS |
| `/shopping/templates` | `/shopping/new` | PASS |
| `/shopping/templates/new` | `/shopping/new` | PASS |
| `/shopping/templates/:templateId/edit` | `/shopping/new` | PASS |
| `/guest`, `/onboarding` | M6 auth/household state machine | PASS |

`e2e/m7-legacy-route.spec.ts` passed 2/2. Redirects use `history.replaceState`; canonical route state is initialized before the first screen render.

## Frontend cleanup

Retired user-facing Task list/detail/respond/template screens, Shopping detail/template screens, old Settings members/profile/notification UI, and unreachable legacy-only E2E coverage. Canonical Task Add/Edit, Shopping Add/Edit, Calendar Shopping deep-link, Other, Auth, and Household Entry flows remain.

## Backend boundary

No Worker route, service, repository, D1 table/column, migration, compatibility response field, or legacy API wrapper was removed. Task/Shopping template APIs remain because canonical reuse flows still call them. M8 cleanup inventory is recorded in `docs/PRODUCTION_UI_MIGRATION.md`.

## Two-user verification

Executed against the local Wrangler Worker + local D1 + Vite proxy with separate Playwright browser contexts and real session cookies. Docker Compose was attempted but the Docker daemon was unavailable, so the repository-native local fallback was used.

- Task: A created/assigned; B saw it; B completed; A saw B as completer; A restored; B saw active; A edit synchronized through the Production API and Home projection.
- Shopping: A added a planned item; B saw it; canonical long-press reorder persisted the same order; B purchased; A saw B as purchaser and the actual timestamp; A restored; B saw pending with planned date preserved.
- Other/permission/session: canonical M5/M6 suites passed; separate auth cookies were used for the core integration. Existing authorization/session API tests remain green.

## PWA verification

- Manifest: PASS, HTTP 200; name, short_name, id, start_url, scope, standalone display, theme/background colors verified.
- Icons: PASS, `house-todo-192.png` is 192x192 and `house-todo-512.png` is 512x512; both HTTP 200.
- Service worker: PASS in production-like Wrangler asset hosting; registration present, scope `/`, controller present before and after reload.
- Direct route reload: PASS for `/home`, `/calendar`, `/shopping`, `/other`, `/tasks/new`, `/shopping/new`, and Shopping deep-link fallback.
- WebKit: unavailable because the local Playwright WebKit executable is not installed.
- Real iPhone: NOT RUN; manual follow-up is in `docs/PWA_MANUAL_CHECKLIST.md`.

## Visual Evidence

![Legacy route cleanup](docs/evidence/m7/review-upload/01-legacy-route-cleanup.png)

![Two-user Task sync](docs/evidence/m7/review-upload/02-two-user-task-sync.png)

![Two-user Shopping sync](docs/evidence/m7/review-upload/03-two-user-shopping-sync.png)

![PWA final smoke](docs/evidence/m7/review-upload/04-pwa-final-smoke.png)

## Motion Evidence

![Canonical navigation](docs/evidence/m7/motion/previews/canonical-navigation.gif)

![Two-user Task sync](docs/evidence/m7/motion/previews/two-user-task-sync.gif)

![Two-user Shopping sync](docs/evidence/m7/motion/previews/two-user-shopping-sync.gif)

![PWA reload/deep-link](docs/evidence/m7/motion/previews/pwa-reload-deeplink.gif)

Canonical WebM files:

- [canonical-navigation.webm](docs/evidence/m7/review-upload/canonical-navigation.webm)
- [two-user-task-sync.webm](docs/evidence/m7/review-upload/two-user-task-sync.webm)
- [two-user-shopping-sync.webm](docs/evidence/m7/review-upload/two-user-shopping-sync.webm)
- [pwa-reload-deeplink.webm](docs/evidence/m7/review-upload/pwa-reload-deeplink.webm)

## Test debt resolution

- M2 Home fixture: replaced the hard-coded stale date with the current Asia/Tokyo local date.
- Calendar smoke: updated old cell selectors, old headings, and old direct Task route expectation to the canonical calendar grid/date sheet/edit flow.
- Shopping smoke: updated stale reuse, purchased-section, deep-link, locale timestamp, reorder, and reload assertions to the canonical contract. Shopping reorder now compares persisted A/B order rather than assuming the unrelated first row.

## Tests

- `npm run lint` PASS
- `npm run typecheck` PASS
- `npm run build` PASS
- `npm test -- --reporter=dot` PASS: 37 files, 236 tests
- `npm run db:migrate:local` PASS: no local migrations pending; remote untouched
- Canonical Chromium local Playwright suites M2/M3/M4/M5/M6: PASS
- M7 legacy route suite: PASS, 2/2
- M7 real two-user integration: PASS, 2/2
- M7 PWA production-like checks: PASS in local production asset hosting
- `npm run format:check`: repository baseline remains non-green across 156 files; no broad formatting rewrite was applied.

## Deviations / Manual follow-up

Docker daemon and Playwright WebKit were unavailable locally. Real iPhone PWA checks are not claimed; use `docs/PWA_MANUAL_CHECKLIST.md`. No offline-first behavior was added or claimed.

## Reviewer upload package

`docs/evidence/m7/review-upload/` contains exactly 8 files: 4 PNG boards and 4 canonical WebM videos. Raw recordings, previews, traces, and diagnostics are kept outside the upload directory.

## Deploy status

- staging deploy: not performed
- production deploy: not performed
- remote migration: not performed
- secrets/Cron: untouched
- PR merge: not performed
- M8: not started
