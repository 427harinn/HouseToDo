# HouseToDo — Notification Summary N1

朝/夜の残タスク通知の実装仕様と運用メモ。N1ではtask-specific通知やHomeのtask deep-linkは変更しない。

## Morning / evening semantics

- Morningは設定されたlocal time（既定09:00）のSummary。
- Eveningは設定されたlocal time（既定21:00）のSummary。
- 送信対象は、そのlocal dateを引数に`TaskService.listHomeForHousehold()`が返す`tasks`。
- `tasks`はHomeのactionable listと同じで、active taskのみ、日付/period projectionに一致し、statusが`pending`または`in_progress`のもの。
- `completed`と`skipped`はHomeと同じ判定で除外する。0件の場合は送信しない。
- 既存のrecipient semanticsを維持し、Summary設定を有効にしたhousehold memberごとに、そのuserのactive subscriptionへ送信する。taskのassigneeだけへ絞る変更はN1では行わない。

利用しているauthoritative serviceは`worker/services/task-service.ts`の`listHomeForHousehold`。Summary側にrecurrence/completionの別projectionは持たない。

## Task eligibility

Homeの共有projectionを通じて次を含む。

- `once`
- `daily`
- `weekly_fixed`
- `monthly_fixed`
- `weekly_flexible`
- `monthly_flexible`
- legacy `daily` / `scheduled` / `weekly`
- active/inactive、start date、period scope、completed/skipped semantics

HomeとSummaryの回帰テストでは、同じhousehold・local dateに対するHome task IDsとSummary bodyを同じprojection結果から比較する。

## Notification copy and body formatter

Title:

- Morning: `朝の家事が{N}件残っています`
- Evening: `今日の家事が{N}件残っています`

BodyはHomeの表示順を維持し、task titleの連続whitespaceを1つのspaceへ正規化する。

- 1件: `ゴミ出し`
- 2〜3件: `ゴミ出し・食器洗い・インコの餌交換`
- 4件以上: 最初の3件 + `・ほかN件`

0件の場合は通知しない。本文はWeb Pushのbodyとして渡し、collapsed/expanded/long-press時の表示方法はOS/browserに委ねる。long-press専用ハンドラやnotification actionsは追加しない。

## Payload

Summary payloadのdataは次の形を使用する。

```json
{
  "kind": "summary",
  "period": "morning",
  "localDate": "2026-08-13",
  "url": "/home"
}
```

Eveningでは`period`が`evening`になる。task titleはprivate dataの重複を避けるためbodyにのみ含め、dataには含めない。Service Workerは既存のsame-origin URL guardと`showNotification(title, { body, icon, data })`を使用し、`kind`とSummaryの`period/localDate`またはtaskの`taskId`を安全に保持する。Summaryとtask-specific payloadは`data.kind`で区別する。

Task-specific payloadは次の形で、bodyは通知対象taskのtitleだけを含む。

```json
{
  "kind": "task",
  "taskId": "task-id",
  "url": "/tasks/task-id"
}
```

## Timezone and Cron

Summary設定のIANA timezoneで09:00/21:00のslotを判定する。日付のtask eligibilityはHomeと同じhousehold projectionへlocal dateを渡す。DSTは既存のIANA/Intlとzoned date処理を利用する。

`resolveScheduledNotification()`のdelivery windowは20分のhalf-open window。これは安全なpickup/retry検出窓であり、通知の目標遅延ではない。Summaryは多少の遅延を許容できるが、task-specific reminderはdeadline/offsetの時刻精度を必要とするため、同じSchedulerをより細かいCronで動かす。

| Environment | Old | New |
| --- | --- | --- |
| staging | `*/15 * * * *` | `*/5 * * * *` UTC |
| production/top-level | `0 18 * * *` | unchanged |

5分Cronと20分windowの組み合わせにより、Summaryは各local slotを少なくとも一度評価し、task-specific reminderもpollingによる遅延を概ね0〜5分に抑える。同じuser/household/period/local dateまたはtask occurrenceのdelivery keyは既存の`notification_deliveries` unique keyで重複を防ぐ。

## Duplicate and failure handling

- Delivery claimは`(user_id, household_id, notification_type, target_key)`のunique keyと10分leaseを使用する。
- Summary成功後はdeliveryを`sent`にする。同じslotの後続Cronは送信しない。
- 0件または全subscription失敗時はpending deliveryをreleaseし、window内の後続Cronで再試行可能にする。
- 複数subscriptionの一部成功は`sent > 0`としてdeliveryを完了扱いにし、成功端末を再送しない。
- Web Pushの404/410は該当endpointだけをdisabled化する。物理削除はしない。
- 一つのendpoint/user/householdの失敗は他端末の送信を中断しない。household単位の予期しない例外も次householdへ継続する。

per-subscription delivery stateやschema変更はN1では追加しない。そのため、push成功後のDB `markSent`失敗を完全にexactly-onceへすることはできず、既存lease/retryの運用上の限界として残る。

## Staging configuration

- Worker: `house-to-do-staging`
- D1: `house-to-do-staging`
- D1 ID: `17e73ab2-78e1-4e18-87d4-21a4ccef3216`
- Cron: `*/15 * * * *` UTC
- Expected secret names: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`
- No VAPID secret values are stored in this document.

Staging deploy後に`/api/health` HTTP 200、DB/R2 healthy、pending migrations 0を機械確認する。synthetic data/subscriptionがない場合、実push成功は主張しない。

Production Cron/configはN1で変更しない。
