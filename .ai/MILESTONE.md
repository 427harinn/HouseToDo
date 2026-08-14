# Milestone: Task model redesign preparation

> 現在のmilestoneだけを記載します。完了履歴・probe履歴はここに蓄積しません。

## Stable baseline

- 認証、household、task、shopping、image/R2、PWAを実装済み
- Push購読、Web Push sender、test Push、notification settings、schedulerを実装済み
- staging Cronは `*/5 * * * *`
- repository migrationは0011まで
- productionは未操作

## Next objective

新しいtask domain modelの正式設計、Phase 1（domain/schema + migration）、Phase 2（API/service/repository recurrence support）を完了した。詳細は [docs/TASK_MODEL_DESIGN.md](../docs/TASK_MODEL_DESIGN.md) にあり、保存・読み取り・validation基盤は実装済み。schedulerのdeadline切替、全面UI、calendar、history/template UXは未実装。

## Guardrails

今回の準備ではアプリコード、DB schema、migration、API、UI、Cron、Cloudflare resourceを変更しない。production、deploy、push、secret変更も行わない。
