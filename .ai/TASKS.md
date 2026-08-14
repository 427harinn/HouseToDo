# Current milestone tasks

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
- Shopping planned purchase date
- [x] Shopping recent item reuse from existing household items with sorting, limit, deduplication, and isolation
- [x] Shopping new-form template prefill while preserving existing template CRUD/add behavior
- [x] Shopping camera/library image options with shared processing and unchanged R2 constraints

## Calendar phase

- [x] Add household-timezone monthly Calendar route and bottom navigation entry
- [x] Add bounded canonical Calendar range API with fixed markers and selected flexible detail
- [x] Reuse Phase 3 projection/status/overdue logic without occurrence pre-generation
- [x] Add Calendar API coverage, responsive Playwright coverage, screenshots, and traces
- [x] Deploy and verify Calendar on staging; deactivate temporary fixtures

## Follow-up

- [x] Update `scripts/validate-staging-config.mjs` to expect the staging Cron `*/5 * * * *`
