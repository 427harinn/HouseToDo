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
- Calendar UI
- History/template task creation UX
- Staging and production rollout

## Follow-up

- [ ] Update `scripts/validate-staging-config.mjs` to expect the staging Cron `*/5 * * * *`
