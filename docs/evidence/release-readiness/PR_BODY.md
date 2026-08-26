## Summary

This PR formally closes out the merged M1–M8B Production UI Migration and records a read-only release-readiness audit. It contains documentation, machine-readable diagnostics, a manual real-iPhone checklist, and four review boards. No UI, API, schema, or migration implementation change is included.

## Main SHA

- Production base / `origin/main`: `e1048c8de66126c4c93952261d70313b1180ec43`
- Branch: `chore/post-migration-release-readiness`
- Local migration count: 17
- Current Worker route count: 65
- Main state at audit start: clean and at the required M8B merge SHA

## Production UI Migration

`COMPLETE`

M8B is done and merged to `main` in PR #10. Merge commit: `e1048c8de66126c4c93952261d70313b1180ec43`.

## Documentation closeout

- Updated `docs/PRODUCTION_UI_MIGRATION.md`, `.ai/MILESTONE.md`, and `.ai/TASKS.md` to reflect the post-merge state.
- Updated `docs/RELEASE_MANUAL_CHECKLIST.md` for human real-iPhone/PWA validation.
- The current work is named Post-Migration Closeout / Release Readiness, not M9.
- Pending follow-up remains release/deploy validation, real iPhone manual validation, and optional future compatibility cleanup.

## Local final gate

- lint: PASS
- typecheck: PASS
- Vitest: PASS — 38 files / 238 tests
- build: PASS
- local D1 migration command: PASS — 17 migrations present; no migrations to apply after local setup
- changed-source format check: PASS
- canonical Chromium: PASS — 38 passed / 1 skipped
- two-user smoke: PASS — 4 passed

The two-user contract covered owner task creation, member visibility/completion, completed-by actor visibility, shopping add/reuse visibility, purchase, and purchaser visibility through the existing M7 integration suite.

## Cloudflare read-only audit

- Wrangler auth: PASS using the existing authenticated session; no credential was stored.
- Staging environment: configured as `house-to-do-staging`; URL `https://house-to-do-staging.427harinn.workers.dev`; D1 `house-to-do-staging`; R2 `house-to-do-attachments-staging`; Cron `*/5 * * * *`.
- Staging latest visible version: version 44, ID `26a6fbf9-476e-4d36-9dfa-8ef07c07275c`; deployment metadata was visible, but no source SHA association was available.
- Production environment block: not configured in `wrangler.jsonc`; configured default Worker/D1 are not provisioned under the audited names.

## D1 migration status

- Local: 17 migration files.
- Staging remote applied: 14/17, verified with a metadata-only query (`rows_written: 0`, `changed_db: false`).
- Missing: `0015_account_avatars_and_morning_notifications.sql`, `0016_task_record_snapshots.sql`, `0017_calendar_action_date.sql`.
- `0015`: additive avatar metadata and notification defaults; profile/notification behavior needs staging validation.
- `0016`: additive nullable task/assignee snapshots and an index; history rendering should be checked before apply.
- `0017`: additive nullable Calendar action date and an index; Calendar completion/restore behavior should be checked before apply.
- Remote migration: `NOT RUN`.
- Schema/data operation: `NOT RUN`.

## Secrets / Cron / R2

- Required runtime secret names: 3/3 present. Secret values were not read or stored.
- Staging Cron exists as configured. No Cron change was made.
- Staging R2 binding/bucket exists. No object list, upload, or delete operation was performed.

## Real iPhone checklist

`docs/RELEASE_MANUAL_CHECKLIST.md` covers PWA install/standalone behavior, auth, Home, Calendar, Shopping, Other, and Push. All checks remain `NOT RUN` by Codex. Push validation requires a configured authenticated staging or production environment with the required secrets and active schedule.

## Release readiness result

`REMOTE_MIGRATION_REVIEW_REQUIRED`

The local application gate is green, but the remote environment is not ready to be treated as a production release target: staging D1 is 14/17 with migrations 0015–0017 pending, and the configured default production Worker/D1 are not provisioned.

## Recommended next action

1. Human-review the staging/default environment gap and the three pending migrations.
2. If approved, make a separate decision using the existing staging migration/deploy runbook.
3. Run authenticated staging smoke and the real-iPhone checklist.
4. Conduct a separate production deploy review.

No next action above was executed by this PR.

## Visual Evidence

Evidence SHA: `fa14f75`

- [01-main-final-gate.png](https://github.com/427harinn/HouseToDo/blob/fa14f75/docs/evidence/release-readiness/screenshots/01-main-final-gate.png?raw=1)
- [02-remote-readiness.png](https://github.com/427harinn/HouseToDo/blob/fa14f75/docs/evidence/release-readiness/screenshots/02-remote-readiness.png?raw=1)
- [03-d1-migration-status.png](https://github.com/427harinn/HouseToDo/blob/fa14f75/docs/evidence/release-readiness/screenshots/03-d1-migration-status.png?raw=1)
- [04-release-next-action.png](https://github.com/427harinn/HouseToDo/blob/fa14f75/docs/evidence/release-readiness/screenshots/04-release-next-action.png?raw=1)

The review-upload directory contains exactly these four PNG files.

## Safety

- staging deploy: `NOT RUN`
- production deploy: `NOT RUN`
- remote migration: `NOT RUN`
- production data writes: `NONE`
- secrets values: `NOT READ / NOT STORED`
- Cron changes: `NONE`
- automatic merge: `NOT RUN`
