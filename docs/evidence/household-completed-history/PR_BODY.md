## 概要

PR #40の家庭全体完了履歴に、Calendarとその他の履歴行から完了時点のメモを展開確認できる機能を追加しました。`task_records` にdescription snapshotを保存するための `0019_task_record_description_snapshots.sql` も追加しています。

- `completed` のみを `completedAt DESC, id DESC` で取得
- household membership でスコープし、他家庭の record は返さない
- `completedAt` と `id` の cursor pagination（初回40件、`もっと見る`）
- `taskTitleSnapshot` を優先し、inactive/deleted task 相当でも表示
- `taskDescriptionSnapshot` を完了・操作時点に保存し、API上は `description` として返却
- snapshotがnullの既存recordは現存taskのdescriptionへ安全にfallbackし、taskもなければ「メモなし」
- Calendar/その他の履歴行を1件だけ展開でき、Calendarは完了日時も表示
- household timezone で日付グループ・時刻を表示
- Calendar と同じ 22px 円形 primary Check を静的再利用
- パス履歴、検索、絞り込み、買い物履歴、編集/戻す操作は追加していません

## Evidence（390×844）

### その他に履歴を追加

![その他画面](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/01-other-390x844.png)

### 複数日・複数記録・完了者・時刻

![履歴画面](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/02-history-grouped-390x844.png)

### 大量履歴のもっと見る

![もっと見る](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/03-history-more-390x844.png)

### 空状態

![空状態](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/04-history-empty-390x844.png)

### Calendar完了履歴（閉じた状態）

![Calendar履歴の閉じた状態](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/06-calendar-history-closed-390x844.png)

### Calendar完了履歴（メモ展開）

![Calendar履歴の展開](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/05-calendar-history-expanded-390x844.png)

### その他履歴（閉じた状態）

![その他履歴の閉じた状態](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/06-other-history-closed-390x844.png)

### その他履歴（メモ展開）

![その他履歴の展開](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/05-other-history-expanded-390x844.png)

## 検証

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npx playwright test e2e/calendar-m3.spec.ts e2e/household-completed-history.spec.ts`
- staging migration apply: `0019_task_record_description_snapshots.sql` のみ
