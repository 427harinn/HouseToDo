# Milestone: staging authentication completion

Date: 2026-08-04

## Completed

- Staging Worker: `house-to-do-staging`
- URL and `ALLOWED_ORIGINS`: `https://house-to-do-staging.427harinn.workers.dev`
- Staging D1: `house-to-do-staging`
- Staging R2: `house-to-do-attachments-staging`
- Migrations `0001` through `0007` applied and verified
- Cron: one entry, `0 18 * * *` UTC
- Observability enabled only for staging
- PBKDF2 reduced from 120,000 to `100_000` iterations for Workers compatibility
- Existing stored hash format and stored-iterations verification retained
- Browser registration, login, logout, cookie attributes, and Origin checks verified

## Validation

- Registration returned 201 and created users/sessions rows.
- Quality gates passed: lint, typecheck, 15 files / 60 tests, build, local migration, and `git diff --check`.

## Limits

- Page-reload session persistence was not strictly verified.
- Full remote E2E and detailed successful Workers Logs stage review remain unconfirmed.
- Production was not operated on; no migration was added; no API Token was stored.

## 2026-08-05 Image usage foundation

- Added local migration `0008_image_usage_reservations.sql` for household usage, upload reservations, and nullable orphan byte sizes.
- Added environment-derived image limit defaults and `GET /api/households/current/image-usage`.
- Added explicit usage repair and reservation repository foundations.
- Existing image upload/R2 behavior remains unchanged and limits are not enforced.
- Remote migration, deploy, production, Cron, UI, staging E2E, commit, and push remain out of scope.
## 2026-08-05 Image upload reservation connection

Upload reservations are now connected to `PUT /api/shopping/items/:itemId/image`. The service reserves household usage before R2, enforces create/replace projections and UTC-day reservation-aware daily limits, and rejects unknown stored bytes. Successful metadata upsert and usage finalize are atomic with reservation removal; create/replace active counters and daily success count are updated. Failure paths release reservations, and orphan queue registration updates known pending cleanup bytes. TTL recovery remains next milestone work.
Cleanup success-side pending-capacity decrement/recalculation is not yet connected and is a required next milestone item. UI, remote migration, deploy, production operations, and Cron changes remain out of scope.

## 2026-08-05 Reservation TTL and orphan usage cleanup

Added 50-record expired reservation cleanup before orphan cleanup in the existing UTC scheduled handler. Active expired reservations safely delete or queue R2 objects, release reserved usage by household recomputation, and continue independently on errors. Orphan queue state changes recalculate known pending cleanup bytes; abandoned rows remain stored capacity and NULL byte sizes remain unknown. No schedule, migration, UI, staging E2E, deploy, remote, production, or push changes were made.

Pending cleanup bytes are recalculated on every queue deletion or retry/abandoned transition. The remaining repair extension is category A: a broader household-wide active-image repair tool is future operational work; this milestone does not leave a known pending-byte, reserved-counter, or missing-usage-row cleanup path unresolved.

## 2026-08-05 Image deletion active usage consistency

Image metadata deletion and active count/bytes updates are now atomic and idempotent for image DELETE. Shopping item deletion and purchased-item bulk deletion also update active usage before the subsequent R2 cleanup. R2 failures move capacity to the orphan queue/pending cleanup without restoring active usage; queue registration failure is surfaced as an internal error. Household deletion remains dependent on existing FK cascades, with no new migration. The staging stop condition caused by stale active counters is resolved; next step is staging migration/deploy pre-review.

## 2026-08-09 Staging image usage verification

- Staging migration `0008` is applied; active Worker Version ID is `90b2f016-5270-4fe7-9ee0-28e7f5e60823`.
- Dedicated staging data verified owner/member usage equality, cross-house isolation, create, replace, image DELETE, double DELETE, image-bearing item deletion, zero final reservations, unchanged pending cleanup, and final active usage restoration.
- Remote purchased-item bulk deletion remains intentionally unexecuted because nine pre-existing purchased items make the persistent household unsafe to clear. Local tests cover multi-image decrements, partial R2 failures/orphans, and idempotency.
- Workers Logs were a constrained confirmation: an initial target typo missed mutations, stored telemetry was token-forbidden, and a corrected 15-minute tail plus 45-second raw sample found no HTTP 500, D1/R2 error, or secret/full ID/key leakage candidate.
- Production was untouched; no deploy, remote migration, Cron change, production operation, or push occurred.

## 2026-08-09 Frontend image usage UI

- Added the `GET /api/households/current/image-usage` frontend client and matching response type.
- Added the image storage section to settings/member management for both owner and member views.
- Displays count, active bytes, stored bytes, daily uploads, reserved uploads, pending cleanup, and `storedBytesKnown === false` guidance; unknown stored capacity is shown as `確認中` rather than a confirmed value.
- Uses a 1024-based byte formatter and text-based 80%/limit warnings.
- Loading/error/retry are local to the section; focus and `visibilitychange` refresh usage without polling.
- Added responsive local Playwright fixtures/screenshots for desktop, 430px, 390px, and 320px.
- Staging backend verification was already complete. No backend, remote, production, deploy, Cron, migration, or push operation was performed.

## 2026-08-09 Image upload UX improvement

- Added usage assistance to the shopping image upload UI, including remaining count, daily remaining uploads, 80% warning, and unknown stored capacity guidance.
- Added user-facing mapping for image backend limit and in-progress error codes.
- Create count limits are shown before selection; replace remains allowed when count is full because backend decides final eligibility.
- Upload and delete success both refresh the existing image usage client; upload state prevents duplicate submission and supports retry after errors.
- Existing client validation remains: JPEG/PNG/WebP, WebP conversion, longest side <= 1280px, final WebP <= 1MB.
- Local Playwright checks passed 4/4 with normal, near-limit, limit-error, unknown-storage, replace, and 320/390/430px plus desktop coverage; screenshots and traces were generated with no pageerror, unexpected console error, or unexpected request failure.
- Backend, migration, R2, Cron, remote D1, staging, production, deploy, and push were not changed or operated.

## 2026-08-10 Notification milestone 1: PWA / Service Worker foundation

- Added `public/manifest.webmanifest` with the `HouseToDo` app identity, standalone display, scope, start URL, and existing theme colors.
- Added `public/sw.js` with safe push payload handling and same-origin notification click routing. Offline cache is intentionally not used.
- Registered the Service Worker only in production builds, which includes staging HTTPS deployments.
- Added browser capability detection for Service Worker, PushManager, Notification permission, and standalone display mode.
- Notification permission is only read; no automatic `Notification.requestPermission()` call exists.
- Added safe notification URL resolution and unit coverage for relative, same-origin, external, malformed, and dangerous URLs.
- The future notification model is task-level specified-time notification plus user-level evening summary; an evening summary is sent only when at least one task remains incomplete today.
- D1 schema, PushSubscription, VAPID, push sender, notification UI, task notification UI, deploy, remote migration, production operations, and push remain out of scope.
