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
