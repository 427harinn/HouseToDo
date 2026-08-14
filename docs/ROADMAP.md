# Roadmap

> この文書は、未実装のfuture workだけを管理します。完了済みPhaseの履歴や詳細仕様は置きません。

## Future work

1. Task model redesign
   - deadline
   - notification offset presets
   - recurrence redesign（柔軟なweekly / monthly）
   - history / templateからのtask creation
2. Task notification deep-link
3. Calendar UI
4. Shopping UX
   - history / templates
   - camera / photo-library選択
   - optional calendar integration
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
- [ ] Phase 1 domain/schema + migration implementation
- [ ] Phase 2 API/service/repository implementation
- [ ] Phase 3 task create/edit/detail UI
- [ ] Phase 4 scheduler/reminder migration
- [ ] Phase 5 notification deep-link
- [ ] Phase 6 history/template UX
- [ ] Phase 7 calendar
