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
- [ ] Notification deep links and production rollout

## Future work

1. Task notification deep-link
2. Calendar deep-link synchronization
3. Shopping UX
   - [x] recent shopping item reuse with household isolation, sorting, limit, and normalized-name deduplication
   - [x] Shopping new-form template prefill while preserving existing template CRUD/add semantics
   - [x] separate camera and photo-library selection with shared image processing/upload flow
   - [x] Shopping UX Phase 1 staging deployment and authenticated verification
   - history / optional calendar integration
   - [x] optional planned purchase date with create/edit/clear and purchase-state persistence
   - [x] household-scoped Shopping projection in Calendar with separate marker/detail UI
   - [x] Shopping planned purchase date and Calendar integration staging deployment/verification
   - Shopping planned-date notifications
5. UI refinement
6. WebMCP
7. Scheduler query optimization
8. Production rollout

task modelの詳細、migration互換性、通知仕様は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) として仕様化を完了した。これはapproved but not implementedであり、現在仕様への反映は実装phaseの完了後に行う。

### Task model redesign status

- [x] current implementation audit and detailed design
- [x] recurrence/period/deadline/notification semantics
- [x] record identity and calendar projection policy
- [x] backward-compatibility and staged migration proposal
- [x] Phase 1 domain/schema + migration implementation
- [x] Phase 2 API/service/repository implementation
- [x] Phase 3 task create/edit/detail UI
- [x] Phase 4 scheduler/reminder migration
- [ ] Phase 5 notification deep-link
- [x] Phase 6 recent task reuse and template UX
- [x] Phase 7 calendar

## Test infrastructure quality

- [x] Full Playwright suiteの既知failureを現行UIのsemantic locator/expectationへ更新
- [x] local E2Eとcredential依存staging E2Eを専用config/commandへ分離
- [x] staging credential不足時の明示skip、既存artifact、single-worker方針を維持
- [x] Task、Notification、Shopping、Calendar、Recent/Templateのtargeted regressionを確認
