## 概要

「その他」から家庭全体の完了履歴を確認できる `/other/history` と、`task_records` を使った `/api/history/tasks` を追加しました。

- `completed` のみを `completedAt DESC, id DESC` で取得
- household membership でスコープし、他家庭の record は返さない
- `completedAt` と `id` の cursor pagination（初回40件、`もっと見る`）
- `taskTitleSnapshot` を優先し、inactive/deleted task 相当でも表示
- household timezone で日付グループ・時刻を表示
- Calendar と同じ 22px 円形 primary Check を静的再利用
- パス履歴、検索、絞り込み、migration は追加していません

## Evidence（390×844）

### その他に履歴を追加

![その他画面](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/01-other-390x844.png)

### 複数日・複数記録・完了者・時刻

![履歴画面](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/02-history-grouped-390x844.png)

### 大量履歴のもっと見る

![もっと見る](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/03-history-more-390x844.png)

### 空状態

![空状態](https://raw.githubusercontent.com/427harinn/HouseToDo/feat/household-completed-history/docs/evidence/household-completed-history/04-history-empty-390x844.png)

## 検証

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npx playwright test e2e/household-completed-history.spec.ts`
- migration apply: 未実施
