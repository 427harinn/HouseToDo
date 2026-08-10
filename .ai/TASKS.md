# Tasks

## Completed

- [x] Build and verify staging Worker, D1, and R2 configuration.
- [x] Apply and verify migrations `0001` through `0007`.
- [x] Register the staging Cron trigger `0 18 * * *`.
- [x] Enable Workers Observability for staging only.
- [x] Identify the PBKDF2 120,000-iteration Workers runtime failure.
- [x] Change `PBKDF2_ITERATIONS` to `100_000` without changing the stored hash format.
- [x] Verify registration, users/sessions creation, cookie attributes, login, logout, and Origin checks in staging.
- [x] Pass lint, typecheck, 15 files / 60 tests, build, local migration, and `git diff --check`.
- [x] Apply staging migration `0008` and verify image usage consistency read-only.
- [x] Verify staging image create, replace, image DELETE, double DELETE, item deletion, and cross-house isolation.
- [x] Add safe staging E2E coverage for image usage without clearing persistent purchased data.

## Follow-up

- [ ] Strictly verify login persistence after a browser page reload.
- [x] Run the approved staging image usage remote verification.
- [ ] Review mutation-time stored Workers Logs when token permissions allow it; corrected post-verification tail review is complete.
- [x] Connect image upload reservations and usage counters to the existing upload flow.
- [ ] Add reservation TTL recovery and finalize reconciliation audits.
  - [x] Recalculate pending cleanup bytes when cleanup queue rows are successfully removed.
  - [x] Recover expired upload reservations and recompute orphan cleanup usage.
  - [x] Keep image deletion and shopping-item cascade paths aligned with active image usage.
- [x] Add image limit rejection UI and usage display.
- [x] Improve image upload UX with create/replace handling, client validation messages, backend error mapping, upload/delete refresh, unknown-storage guidance, and responsive local Playwright coverage.
- [x] Add frontend image usage display, byte formatting, warnings, cleanup guidance, refresh, and responsive local E2E coverage.
- [x] Add notification milestone 1 PWA manifest and Service Worker foundation.
- [x] Add capability detection without requesting notification permission automatically.
- [x] Add safe notification URL validation and Service Worker push/click handling tests.
- [x] Add notification permission UI, VAPID public-key API, device-scoped PushSubscription registration, and local Playwright fixture coverage.
- [x] Add safe Web Push failure stage/category/upstream-status observability after the initial staging test Push failed generically.
- [x] Add staging-only fixed Apple Push GET network probe without sending notifications.
- [ ] Add manifest icons and `apple-touch-icon` before the milestone 3 real-iPhone Push test.
- [ ] Run remote purchased-item bulk deletion only in a disposable household with no pre-existing data.

## Constraints

- Production remains untouched.
- No additional migration or remote D1/R2 recreation.
- No API Token contents stored.
- Push remains pending explicit approval.
- Push sender, task notification settings, evening summary settings, delivery history/actions, remote migration, deploy, and production operations remain pending.
- The Apple Push transport probe is diagnostic only; do not send another Push until its result is reviewed.
