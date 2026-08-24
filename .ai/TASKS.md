# Current milestone tasks

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
