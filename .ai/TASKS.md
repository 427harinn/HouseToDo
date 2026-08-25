# Current milestone tasks

## Production UI Migration M5 — Other / Settings (current milestone)

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

- Notification deep-link
- [x] Recent task definition reuse with household isolation, sorting, limit, inactive filtering, and legacy compatibility behavior
- [x] Task template CRUD, canonical six recurrence types, household authorization, and logical deactivation
- [x] Shared task form prefill with startDate/once targetDate/task identity/history exclusion
- [x] Recent/template Playwright UI coverage, responsive screenshots, and trace artifacts
- [x] Verify recent/template authenticated E2E on staging and clean up temporary fixtures
- Production rollout
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
- Shopping planned-date notifications
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
