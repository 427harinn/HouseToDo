# Roadmap

> この文書は、未実装のfuture workだけを管理します。完了済みPhaseの履歴や詳細仕様は置きません。

## Phase 3 status

- [x] Canonical occurrence/period projection and scope actions
- [x] Today/dashboard/history additive scope metadata
- [x] Legacy compatibility, including weekly target count greater than one
- [x] Canonical Task create/edit/detail/today UI and reminder scheduler
- [x] Calendar UI and canonical range projection API
- [x] Calendar staging verification and staging deployment
- [x] Recent task reuse and task template UX
- [x] Task reuse/template authenticated staging verification
- [x] Notification phase: Morning/Evening Summary and task notification deep-link implementation

## Future work

1. WebMCP
2. Scheduler query optimization
3. UI refinement
   - [x] recent shopping item reuse with household isolation, sorting, limit, and normalized-name deduplication
   - [x] Shopping new-form template prefill while preserving existing template CRUD/add semantics
   - [x] separate camera and photo-library selection with shared image processing/upload flow
   - [x] Shopping UX Phase 1 staging deployment and authenticated verification
   - history / optional calendar integration
   - [x] optional planned purchase date with create/edit/clear and purchase-state persistence
   - [x] household-scoped Shopping projection in Calendar with separate marker/detail UI
   - [x] Shopping planned purchase date and Calendar integration staging deployment/verification
   - [x] Calendar selected-date visibility for unplanned Shopping and purchase datetime display
4. Production rollout

## Notification phase closeout

Feature implementation and staging/mobile verification are complete for the current notification scope. This includes Morning Summary, Evening Summary, task-specific reminders using the existing task timing fields, remaining task titles, Home-authoritative eligibility with completed/skipped exclusion, duplicate protection, invalid-subscription handling, multi-device delivery, and task notification deep-links to `/home?task={taskId}` with Home selection, expansion, auto-scroll, and existing Complete behavior. Real iPhone PWA verification is complete.

Calendar notification deep-link synchronization and Shopping planned-date notifications are deferred/out of scope for the current product scope. Notification action buttons are not required, and no new notification DB field is planned.

Production rollout remains future work; notification feature implementation and staging/mobile verification are complete, but production is not.

task modelの詳細、migration互換性、通知仕様は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) に記録している。完了済みの実装状態と、将来のproduction rolloutを区別して管理する。

### Task model redesign status

- [x] current implementation audit and detailed design
- [x] recurrence/period/deadline/notification semantics
- [x] record identity and calendar projection policy
- [x] backward-compatibility and staged migration proposal
- [x] Phase 1 domain/schema + migration implementation
- [x] Phase 2 API/service/repository implementation
- [x] Phase 3 task create/edit/detail UI
- [x] Phase 4 scheduler/reminder migration
- [x] Phase 5 notification deep-link
- [x] Phase 6 recent task reuse and template UX
- [x] Phase 7 calendar

## Test infrastructure quality

- [x] Full Playwright suiteの既知failureを現行UIのsemantic locator/expectationへ更新
- [x] local E2Eとcredential依存staging E2Eを専用config/commandへ分離
- [x] staging credential不足時の明示skip、既存artifact、single-worker方針を維持
- [x] Task、Notification、Shopping、Calendar、Recent/Templateのtargeted regressionを確認
