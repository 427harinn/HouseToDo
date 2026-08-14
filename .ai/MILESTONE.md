# Milestone: Task model redesign preparation

> 現在のmilestoneだけを記載します。完了履歴・probe履歴はここに蓄積しません。

## Stable baseline

- 認証、household、task、shopping、image/R2、PWAを実装済み
- Push購読、Web Push sender、test Push、notification settings、schedulerを実装済み
- staging Cronは `*/5 * * * *`
- repository migrationは0011まで
- productionは未操作

## Next objective

新しいtask domain modelの正式設計を完了した。詳細は [docs/TASK_MODEL_DESIGN.md](../docs/TASK_MODEL_DESIGN.md) にあり、statusはapproved but not implemented。次は実装承認後のPhase 1（domain/schema + migration）であり、現行仕様へはまだ反映しない。

## Guardrails

今回の準備ではアプリコード、DB schema、migration、API、UI、Cron、Cloudflare resourceを変更しない。production、deploy、push、secret変更も行わない。
