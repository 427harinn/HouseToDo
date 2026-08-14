# Milestone: Task model redesign preparation

> 現在のmilestoneだけを記載します。完了履歴・probe履歴はここに蓄積しません。

## Stable baseline

- 認証、household、task、shopping、image/R2、PWAを実装済み
- Push購読、Web Push sender、test Push、notification settings、schedulerを実装済み
- staging Cronは `*/5 * * * *`
- repository migrationは0011まで
- productionは未操作

## Next objective

新しいtask domain modelを正式設計する。deadline、notification offset、recurrence redesign、history/templatesの詳細は次フェーズで決定し、現行仕様へ先取りしない。

## Guardrails

今回の準備ではアプリコード、DB schema、migration、API、UI、Cron、Cloudflare resourceを変更しない。production、deploy、push、secret変更も行わない。
