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

## Follow-up

- [ ] Strictly verify login persistence after a browser page reload.
- [ ] Run full remote E2E when separately approved.
- [ ] Review successful Workers Logs stages when Dashboard access is available.
- [x] Connect image upload reservations and usage counters to the existing upload flow.
- [ ] Add reservation TTL recovery and finalize/cleanup reconciliation audits.
- [ ] Recalculate pending cleanup bytes when cleanup queue rows are successfully removed.
- [ ] Add image limit rejection, UI usage display, and staging remote E2E coverage.

## Constraints

- Production remains untouched.
- No additional migration or remote D1/R2 recreation.
- No API Token contents stored.
- Commit and push remain pending explicit approval.
