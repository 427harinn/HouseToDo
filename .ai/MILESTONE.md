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
