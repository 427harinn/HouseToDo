## Summary

- Calendarの月セルに、実際の完了操作日を基準にした完了家事を追加表示
- 月セルは未完了を優先し、完了家事はmuted表示、表示上限と`+N`を維持
- 日付詳細の完了履歴を常時表示し、checked checkbox・完了者・既存の編集/戻す操作を維持
- inactive/deleted taskは`taskTitleSnapshot`を使って履歴表示
- DB migrationは追加していません

## Evidence

390x844 viewportで撮影した状態遷移です。

### 月Calendar: 完了前

![月Calendar 完了前](docs/evidence/calendar-completed-history/01-calendar-month-before-390x844.png)

### 日付詳細: 完了前

![日付詳細 完了前](docs/evidence/calendar-completed-history/02-calendar-detail-before-390x844.png)

### 日付詳細: 完了後

![日付詳細 完了後](docs/evidence/calendar-completed-history/03-calendar-detail-completed-390x844.png)

### 月Calendar: 完了履歴

![月Calendar 完了履歴](docs/evidence/calendar-completed-history/04-calendar-month-completed-390x844.png)

### 日付詳細: 戻す後

![日付詳細 戻す後](docs/evidence/calendar-completed-history/05-calendar-detail-restored-390x844.png)

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test -- --reporter=dot --silent` — 52 files / 348 tests passed
- `npm run build`
- `e2e/calendar-m3.spec.ts` — 13 passed
- `e2e/calendar-date-quick-add.spec.ts` — 2 passed

Docker daemonが起動していないため、Docker経由のWorker E2Eは未実施です。host側のself-contained Playwrightは成功しています。

## Staging

staging deploy結果は検証完了後に追記します。production/defaultへのdeployとmigration applyは行いません。
