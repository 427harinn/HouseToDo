# Current milestone tasks

> current milestoneの未完了taskだけを管理します。完了済みtaskの保管場所にはしません。

- [x] finalize task domain specification（docs/TASK_MODEL_DESIGN.md）
- [x] design migration and backward-compatibility strategy
- [x] define notification offset presets and delivery semantics
- [x] define recurrence redesign for flexible weekly/monthly tasks
- [x] define history/template-based task creation
- [x] plan task model phase 1 implementation and validation

Phase 1のdomain/schema/migration実装は完了。次のimplementation gateはPhase 2（API/service/repository recurrence support）とする。

## Constraints

- 現行task modelは正式設計が終わるまで変更しない
- production untouched、deploy/push禁止
- migration/API/UI/Cron/Cloudflare resource変更は実装フェーズで別途承認する
