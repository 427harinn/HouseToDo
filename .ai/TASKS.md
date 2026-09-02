# Current milestone tasks

## Post-Migration Closeout / Release Readiness

- [x] Fetch `origin`, confirm clean tree, and create `chore/post-migration-release-readiness` from `origin/main` at `e1048c8de66126c4c93952261d70313b1180ec43`
- [x] Record production base SHA, branch, migration count 17, Worker route count 65, and current main state
- [x] Close out M8B as done and merged to `main` in PR #10; record merge commit `e1048c8de66126c4c93952261d70313b1180ec43`
- [x] Mark Production UI Migration `COMPLETE` and record only release/deploy validation, real iPhone validation, and optional future compatibility cleanup as follow-up
- [x] Run local lint, typecheck, Vitest, build, local migration, changed-file format check, canonical Chromium, and explicit two-user smoke
- [x] Run read-only Cloudflare Worker, D1 migration metadata, R2, required-secret-name, and Cron/config audit
- [x] Generate machine-readable readiness diagnostics and exactly four PNG release-readiness boards
- [x] Add the real iPhone manual validation checklist
- [x] Commit, push, and open PR `Post-Migration Closeout / Release Readiness Audit`; do not merge or deploy

## Production UI Migration M8B — Compatibility / Schema Finalization (completed in PR #10)

- [x] Confirm clean working tree, verify PR #9 merged, verify `origin/main` at `3c608ac07f90ca0f0d10d0e515c50b14b62ba83a`, and create `feat/backend-finalization-m8b`
- [x] Read M8A diagnostics and freeze the six-candidate scope
- [x] Audit code readers/writers, runtime/scheduled callers, canonical callers, tests, persisted local D1 rows, migrations, and external-consumer evidence
- [x] Classify all six candidates with the required final verdict enum; no unsupported `UNKNOWN` or vague defer remains
- [x] Add candidate compatibility contracts and legacy NULL/recurrence fixture coverage
- [x] Confirm no route, response field, table, column, enum value, or migration can be removed safely in M8B; schema change is NONE
- [x] Generate final candidate decisions, final schema snapshot, API/schema diff, legacy compatibility, and final gate diagnostics
- [x] Run lint, typecheck, Vitest, build, local migration, changed-source format check, canonical Chromium, two-user, scheduler/notification, and image/R2-safe checks
- [x] Generate exactly four PNG boards and four WebM motion files for `docs/evidence/m8b/review-upload/`
- [x] Commit implementation and Evidence separately, push, and open PR #10; do not deploy or run remote migration

## M8B final status

- [x] Production UI Migration is complete after M8B implementation: all six candidates are `REMOVE_SAFE` implemented or `KEEP_*` with a recorded reason
- [x] Human review and merge of the M8B PR #10
- [ ] Deploy, remote migration, and real iPhone manual validation

## Production UI Migration M8A — Backend Reachability Audit / Non-destructive Cleanup (current milestone)

- [x] Confirm clean working tree, fetch attempt, M7 PR #8 merge, and create `feat/backend-cleanup-m8a` from `origin/main` at `8e4653286d964f1ef88be6da92ad7b11e9c21ed5`
- [x] Record migration count and full Vitest / canonical Chromium baselines
- [x] Audit all Worker routes and trace route → handler → service → repository plus frontend, scheduled, internal, E2E, and test-only callers
- [x] Audit Dashboard and Calendar compatibility fields; preserve `DEFER_COMPAT` fields
- [x] Remove only dead frontend wrappers and unreferenced internal methods; keep deferred Worker compatibility routes and template/reuse backend
- [x] Confirm no Worker endpoint met the REMOVE_DEAD_API threshold; removed-route contract tests are not applicable because zero routes were removed
- [x] Verify all M8A local gates and canonical Chromium / two-user smoke with host-local Wrangler Worker+D1; Docker was unavailable
- [x] Generate four diagnostic boards, four local regression WebM files, and exactly eight reviewer-upload files
- [x] Commit, push, and create Draft PR #9 without merge, deploy, remote migration, secret/Cron changes, or M8B work

## M8B compatibility follow-up record (closed in PR #10)

- [x] Review schema, compatibility response, and persisted-value candidates from M8A diagnostics
- [x] Confirm no M8B destructive migration or compatibility cleanup was required; schema change is NONE

## Production UI Migration M7 — Integration / Legacy UI Cleanup (merged to main in PR #8)

- [x] Confirm clean working tree, fetch Production/Mockup main, confirm M6 PR #7 merge, and create `feat/production-integration-legacy-m7` from Production `d89a9d7`
- [x] Record Production base SHA `d89a9d7ad52f5580b65a2a44b0e350295ef542c7` and Mockup SHA `db8941dc3056f07862014242a349ae366da59e9c`
- [x] Update M6/M7/M8 milestone state and record the pre-change legacy route inventory/matrix
- [x] Replace legacy user-facing routes with canonical history-replacing redirects and assert no legacy UI flash
- [x] Remove only unreachable legacy frontend screens/references; keep backend compatibility for M8
- [x] Audit canonical internal navigation and update stale E2E/fixture expectations to the final contract
- [x] Verify two-user Task, Shopping, Other/permission, household sync, and session isolation against local Worker + D1
- [x] Verify production-like build, manifest/icons, service worker, direct routes, notification URL safety, Chromium 390x844, and WebKit smoke/limitation
- [x] Generate M7 route, sync, PWA boards and four canonical WebM files; finalize exactly eight reviewer-upload files
- [x] Run all gates, commit, push, and create Draft PR without merge, deploy, remote migration, or M8 cleanup; PR #8 is merged to `main`

## Production UI Migration M6 — Auth / Household Entry (merged to main in PR #7)

- [x] Confirm latest Production `origin/main` / PR #6 M5 merge and create `feat/production-auth-entry-m6`
- [x] Record Production base SHA `ed749b70707068b1b7dfb96e055d4e06371af094` and Mockup SHA `db8941dc3056f07862014242a349ae366da59e9c`
- [x] Audit Mockup Entry canonical files and nine states plus Production auth/household contracts
- [x] Replace Login/Register/Household Create/Household Join with the shared flat Entry foundation
- [x] Implement auth + household route state machine with no Guest/Onboarding render or flash
- [x] Implement optional invite validation, safe register/join flow, and race fallback
- [x] Preserve session, PBKDF2, cookie, permission, invite expiry/single-use, and D1 semantics
- [x] Add M6 unit/API/Playwright coverage and Home/Calendar/Shopping/Other smoke checks
- [x] Generate nine Production + nine Mockup captures, four boards, four WebM, four GIF previews, and exact eight-file review package
- [x] Address PR #7 visual parity review: strong Entry primary, secondary labels, placeholder removal, field-error clear, focus-neutral capture, aligned fixtures, vertical boards, and refreshed motion Evidence
- [x] Run final gates, commit, push, and create Draft PR #7; PR #7 is now merged at `d89a9d7`; no deploy or remote migration was performed

## Production UI Migration M5 — Other / Settings (merged to main)

- [x] Record Production/M4-merged main and Mockup latest-main SHAs; complete Mockup parity audit/render
- [x] Formalize `/other` route and Bottom Navigation Other mapping while preserving legacy `/settings/members`
- [x] Implement canonical Other landing, Members/invite, Notifications, Storage, Household Settings, and Account screens
- [x] Preserve member/owner permissions, Push/browser capability flow, notification schedule values, stored-byte/cleanup semantics, avatar/R2 limits, logout, and timezone refresh
- [x] Add additive household timezone and authenticated profile display-name contracts without a migration
- [x] Add M5 App, Worker/API, accessibility, integration, and Playwright coverage
- [x] Generate 16 state captures, four canonical WebM files, four GIF previews, four boards, and exactly eight review-upload files
- [x] Run lint, typecheck, full Vitest, build, M5 Playwright/regression smoke; commit, push, and create Draft PR without merge/deploy (Docker authenticated E2E unavailable; Calendar/Shopping baseline comparison recorded)

## Production UI Migration M4 — Shopping (merged to main)

- [x] Complete Mockup latest-main parity audit and record Production/Mockup SHAs
- [x] Replace Shopping list with canonical header, flat rows, expand/collapse, purchased section, empty/long/quantity/planned states
- [x] Add purchase/restore transitions, purchaser metadata, seven-day visibility filter, and planned-date preservation
- [x] Implement real pointer swipe edit with vertical-scroll/tap/long-press discrimination; keep delete in Edit only
- [x] Implement household-scoped persisted long-press reorder with oldest-first fallback and isolation validation
- [x] Replace Shopping Add/Edit UI with shared canonical form foundation, unified reuse picker, OS image picker, and delete confirmation
- [x] Preserve Shopping API/auth/permission/D1/R2/Calendar/Home semantics and Calendar deep-link behavior
- [x] Add M4 unit/API/Playwright regression coverage for Shopping, Home, Calendar, and integrations
- [x] Generate fresh 390x844 parity screenshots, four canonical WebM motion files, GIF previews, four review boards, and exactly eight review-upload files
- [x] Run lint, typecheck, full Vitest, build, targeted browser capture, commit, push, and create Draft PR without merge/deploy
- [x] Address PR #5 Evidence state routing and reorder review findings; re-capture all 20 states and rebuild the eight-file review package

## Production UI Migration M3 — Calendar

- [x] Replace legacy Calendar header/card/count UI with Mockup latest-main compact month view and 42-cell grid
- [x] Add date-specific/fixed/flexible-deadline month summaries, Date Sheet sections, Shopping marker, and selected-date deep links
- [x] Add Calendar completion/pass motion, completed collapse, snapshot-aware completer avatars, historical restore, and period action-date persistence
- [x] Keep Home today-only restore unchanged and preserve task-edit Calendar return context
- [x] Add additive migration `0017_calendar_action_date.sql` and update Calendar/Shopping API contract
- [x] Complete 390px Mockup parity audit, screenshots, WebM motion evidence, quality gates, and Draft PR without merge

## Production UI Migration M2 — Home + Task

- [x] Replace production Home with the Mockup-derived single active list and household-local header
- [x] Add canonical deadline urgency sorting, scope check colors, overdue override, and member avatar fallback
- [x] Add complete-on-tap, 350ms completion motion, 200ms pass motion, swipe actions, vertical gesture discrimination, and click suppression
- [x] Add collapsed completed/passed today records, snapshots, actual completer/assignee avatars, inactive restore-only actions, and 180ms restore motion
- [x] Add additive task-record snapshots, local migration `0016`, Home dashboard contract, shopping pending count, and reactivate/restore API
- [x] Replace production task add/edit UI with the six-option canonical form, local date/time, notification, assignee, memo, reuse, previous completion, and delete confirmation
- [x] Preserve legacy weekly target compatibility and NULL snapshot fallback
- [x] Add M2 frontend and Worker regression coverage; run lint, typecheck, tests, build, and local migration
- [x] Prepare 390px visual/motion evidence and Draft PR without merge

## Production UI Migration M1

- [x] 最新Production/Mockup mainを確認し、専用branchから開始
- [x] Shared design tokensとlegacy compatibility aliasesを導入
- [x] Global UI foundationとreduced-motion対応を導入
- [x] Shared motion constantsを導入
- [x] App Shellをscroll viewport / safe-area / bottom navigation構造へ更新
- [x] Bottom NavigationをHome / Calendar / Add / Shopping / Otherへ更新
- [x] Add Bottom Sheetと既存Task/Shopping form導線を実装
- [x] Unit / E2E / visual evidence / motion evidenceを確認
- [x] Draft PRを作成（自動mergeしない）

- [x] Fix weekly/monthly flexible multiple-completion history and completedCount
- [x] Re-verify the flexible completion fix on staging with UI, history, period identity, and suppression checks

- [x] Redesign Task create/edit UI for all six canonical recurrence types
- [x] Add deadline and notification preset UI with client validation and state cleanup
- [x] Preserve legacy weekly target-count editing without semantic conversion
- [x] Display canonical recurrence, deadline, reminder, flexible progress, and overdue state
- [x] Switch canonical scheduler to deadline-minus-offset calculation
- [x] Use stable occurrence/period keys for notification dedup
- [x] Preserve legacy scheduler, delivery window, claim lease, retry, and release behavior
- [x] Verify unit, integration, responsive Playwright, screenshots, and traces

## Remaining future phases

1. WebMCP
2. Scheduler query optimization
3. UI refinement / remaining UX cleanup, if applicable
4. Production rollout

Notification phase closeout:

- [x] Morning Summary and Evening Summary with Home-authoritative eligibility and remaining task titles
- [x] Task-specific reminder timing from existing fields and Home selected-task deep-link
- [x] Duplicate protection, invalid subscription handling, multi-device support, and real iPhone PWA verification
- [x] Close current notification scope; production rollout remains future work
- Calendar notification deep-link synchronization and Shopping planned-date notifications are deferred/out of scope

- [x] Recent task definition reuse with household isolation, sorting, limit, inactive filtering, and legacy compatibility behavior
- [x] Task template CRUD, canonical six recurrence types, household authorization, and logical deactivation
- [x] Shared task form prefill with startDate/once targetDate/task identity/history exclusion
- [x] Recent/template Playwright UI coverage, responsive screenshots, and trace artifacts
- [x] Verify recent/template authenticated E2E on staging and clean up temporary fixtures
- [x] Add nullable Shopping planned purchase date with additive migration and validation
- [x] Preserve planned date across purchase/unpurchase; support update and explicit clear
- [x] Exclude planned date from Recent and Template prefill/storage
- [x] Add bounded household-scoped Shopping projection to the existing Calendar API
- [x] Add distinct Calendar Shopping markers, selected-date section, purchased state, and detail navigation
- [x] Verify create/update/clear/invalid/persistence/range/isolation/date-move API behavior
- [x] Verify Shopping/Calendar/Recent/Template/responsive/accessibility UI with screenshots and trace
- [x] Deploy migration 0014 and Shopping planned-date Calendar integration to staging; verify authenticated flows and clean temporary fixtures
- [x] Show unplanned Shopping in every Calendar selected-date detail without adding grid markers/counts
- [x] Show purchase date and time consistently in Shopping list, detail, and Calendar cards using household timezone
- [x] Verify unplanned/date-mixed ordering, marker/aria counts, purchase datetime, responsive UI, screenshots, and traces locally
- [x] Shopping recent item reuse from existing household items with sorting, limit, deduplication, and isolation
- [x] Shopping new-form template prefill while preserving existing template CRUD/add behavior
- [x] Shopping camera/library image options with shared processing and unchanged R2 constraints
- [x] Simplify Shopping image picker to one OS-mediated file input and verify on staging
- [x] Deploy and verify Shopping UX Phase 1 on staging; clean up temporary fixtures

## Calendar phase

- [x] Add household-timezone monthly Calendar route and bottom navigation entry
- [x] Add bounded canonical Calendar range API with fixed markers and selected flexible detail
- [x] Reuse Phase 3 projection/status/overdue logic without occurrence pre-generation
- [x] Add Calendar API coverage, responsive Playwright coverage, screenshots, and traces
- [x] Deploy and verify Calendar on staging; deactivate temporary fixtures

## Follow-up

- [x] Update `scripts/validate-staging-config.mjs` to expect the staging Cron `*/5 * * * *`

## Playwright suite quality

- [x] Fix current Notification heading ambiguity with an exact accessible-name locator
- [x] Replace obsolete Task action button count with semantic action assertions
- [x] Separate local E2E from credential-dependent staging E2E with explicit skip behavior
- [x] Preserve browser error checks, artifacts, single-worker isolation, and no-retry policy
- [x] Verify full suite twice and run Task, Notification, Shopping, Calendar, and reuse/template regressions
