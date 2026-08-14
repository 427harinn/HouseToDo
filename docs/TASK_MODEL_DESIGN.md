# HouseToDo 新タスクモデル設計

> Status: **Approved; Phase 1–4 task model implementation complete**
> Domain/schema, API/service/repository, occurrence/period actions, Task UI, canonical reminder scheduler, and monthly Calendar UI/API are implemented. Deep-link and history/template UX remain staged.

### Phase 4 implementation boundary

Task create/edit exposes all six canonical recurrence types with conditional start/deadline/reminder fields and preset offsets. Canonical reminders reuse `projectTaskOnDate`, resolve the household-local deadline to an instant, subtract the preset offset, and deduplicate with the stable occurrence/period key. Completed or skipped scopes are excluded. Tasks with `model_recurrence_type = NULL` continue through the legacy `notification_time` path, including weekly target counts greater than one; canonical tasks never enter both paths.

### Phase 2 implementation boundary

Task write/read APIs accept and return the six canonical recurrence types through `modelRecurrenceType`. Legacy requests remain supported. New `once`, `monthly_fixed`, and `monthly_flexible` tasks use the `model_only` legacy compatibility marker so the current today/week UI and legacy scheduler cannot misclassify them. Offsets greater than zero are never mirrored to legacy `notification_time`; only offset zero with a deadline is mirrored.
> この文書は、次のmigration/API/UI/scheduler実装へ進むためのdesign source of truthである。ここでいうapprovedは仕様承認を意味し、現在のコード・DB・API・UIの挙動を変更したことを意味しない。

### Phase 1 compatibility storage note

Phase 1では、現行scheduler/UIが直接読むlegacy `recurrence_type` を一括置換しない。`model_recurrence_type` を追加してcanonical mappingを保持し、`daily -> daily`、`scheduled -> weekly_fixed`、`weekly`（target count 1）`-> weekly_flexible`をbackfillする。`weekly_target_count > 1` は `model_recurrence_type = NULL` のmanual-review状態として残す。`start_date`は既存行を安全なhousehold-local dateへ変換できないためNULL許容で追加し、新規作成時はserviceがhousehold timezoneのlocal dateを保存する。旧列の削除・旧recurrence値の置換はPhase 2以降の別migrationとする。

## 1. 調査した現行実装

調査対象は `migrations/`、`worker/routes/tasks.ts`、`worker/services/`、`worker/repositories/`、`worker/lib/date-time.ts`、task validation/domain types、notification scheduler/delivery、`src/App.tsx`およびtask APIである。文書だけから現行挙動を推測していない。

### 1.1 現行のtasks

現行 `tasks` の主要列は次のとおり。

| field | 現行の意味 |
| --- | --- |
| `id`, `household_id`, `title`, `description` | task identity、家庭境界、表示内容 |
| `recurrence_type` | `daily` / `scheduled` / `weekly` |
| `assignment_type`, `assigned_user_id` | `anyone` / `specific` と任意の担当者 |
| `scheduled_time` | daily/scheduledの予定時刻。weeklyではnull |
| `notification_slot` | `morning` / `night` / `none`。UI/保存値には存在するが、schedulerの時刻解決には使われない |
| `notification_time` | task単位の絶対通知時刻。対象日のdeadlineとの関係は現行では定義されていない |
| `weekly_target_count` | weeklyの週内完了目標（1〜7、既定1） |
| `active`, `sort_order`, `created_by`, timestamps | 有効性、表示順、監査用metadata |

`task_weekdays(task_id, weekday)` は `scheduled` taskの曜日集合を保持する。`task_records` は実施状態を保存し、`target_date` または `target_week_start` をscopeとして使う。`pending` はDB statusではなく、該当scopeのrecordがない場合のderived stateである。

### 1.2 現行recurrenceと表示

- `daily`: 今日を含む任意の日に表示する。
- `scheduled`: `task_weekdays` のweekdayと一致する日に表示する。
- `weekly`: `households.week_starts_on`から算出した週をscopeとし、`weekly_target_count`回の完了数を集計する。todayには含めず、week/dashboardの「今週のタスク」に表示する。
- todayは `daily` と対象weekdayの `scheduled` のみを返す。weekは `weekly` のみを返す。dashboardはtodayとweekを別集合として返す。

### 1.3 現行state transition

固定日系は `target_date` 一意のrecordをupsertする。`start` は `in_progress`、`complete` は `completed`、`skip` は `skipped`、`reset` はその日付scopeのrecordを削除してderived `pending` に戻す。完了済みrecordは別ユーザーが上書きできず、他ユーザーのin-progressも保護する。

weeklyは同じ `target_week_start` に複数のcompleted recordを保持できる。in-progress/skipは現行service上ひとつのopen stateとして扱い、completed countが目標以上なら追加completeを受け付けない。resetはそのtask/weekの全recordを削除する。weekly skipは同週にcompletedがあれば拒否され、skip後はstart以外の操作が実質no-opになる。

なお、`specific` assigneeは作成・更新時に家庭memberであることを検証するが、現行のstate actionでは実行者をassigned userに限定していない。この差は新仕様で勝手に変更せず、実装時の互換性確認事項とする。

### 1.4 現行通知

`notification_time` を予定通知時刻として、household timezoneで現在時刻とのdelivery window（20分）を判定する。schedulerはdailyとscheduledの対象日を求め、同日のdaily recordがcompleted/skippedでないtaskを対象にする。weeklyは対象外である。

deliveryは `notification_deliveries` の `(user, household, type, target_key)` unique制約、claim lease、retry/releaseを使う。現行task target keyは `taskId:scheduledDate:scheduledTime`、payloadは `/tasks/{taskId}` へのsame-origin detail linkである。evening summaryはrecipientのuser notification settingsのtimezone/timeを使うが、対象taskの未完了判定はhousehold dateに依存する。

## 2. Approved next task model

新しい内部名とUI表記は次の6種とする。

| internal name | UI | occurrence/period |
| --- | --- | --- |
| `once` | 今回だけ | 1つのtarget date |
| `daily` | 毎日 | 各target date |
| `weekly_fixed` | 曜日を決める | 指定weekdayごとのtarget date |
| `monthly_fixed` | 毎月○日 | 各月のresolved target date |
| `weekly_flexible` | 週1回・日付不定 | deadline weekdayで閉じる週period |
| `monthly_flexible` | 月1回・日付不定 | month-endまたは指定dayで閉じる月period |

旧値のmappingは `daily -> daily`、`scheduled -> weekly_fixed`、`weekly -> weekly_flexible` を基本案とする。ただし旧weeklyの `weekly_target_count > 1` は意味が変わるため、自動変換で黙って失わず、migration report/compatibility flagで要確認にする。

### 2.1 共通ルール

- 全repeat typeは `start_date` を持つ。明示されなければ作成時のhousehold local dateを保存する。
- template/historyから作る場合は旧taskのstart_dateをcopyせず、新規作成時の入力または作成日のlocal dateを使う。
- start_dateより前にはoccurrence/periodをprojectionしない。
- date、weekday、deadlineはhousehold timezone基準とする。
- deadline_timeはoptional。nullの場合、time-based overdueは発生せず、task reminderも作らない。
- statusは `pending` / `in_progress` / `completed` / `skipped` をrecordから導出し、`overdue` は現在時刻・deadline・達成状態から導出する。`overdue`をDB statusに追加しない。

### 2.2 固定日recurrence

`once` は `target_date` 必須。対象日を過ぎても未完了なら、そのoccurrenceは表示・history上は未完了のまま保持し、deadline_timeがある場合だけderived `overdue`とする。自動skipや自動削除はしない。

`daily` は `start_date`以降の毎日、`weekly_fixed` は `start_date`以降で `weekdays` が一致する日、`monthly_fixed` は `start_date`以降の各月の `day_of_month` 日に発生する。fixed taskのrecord identityは `task_id + target_date` とする。

monthlyのdayが当該月に存在しない場合は末日にclampする（31日指定は2月28/29日、4月30日）。月ごとにresolved target dateを計算し、保存値は31などのrule valueを保持する。

### 2.3 weekly_flexible

最低1回完了すればperiod達成である。deadline weekdayのdefaultはSunday（`0`）、ユーザーが変更できる。periodは `前回deadlineの翌日〜今回deadline` とし、SundayならMonday-Sunday、FridayならSaturday-Fridayとなる。start_dateが周期途中なら、初回だけ `start_date〜最初のdeadline` とする。

periodのdeadline dateとoptional deadline_timeからdeadlineを作る。period内のcompleted countが1以上ならcompleted、in-progressがあり未達成ならin_progress、skip済みならskipped、未達成で期限前ならpending、期限後かつ未達成ならoverdueとする。達成後も同periodに何回でもcompleteでき、全recordをhistoryに残す。

record identityは `task_id + period_start + period_end` をperiod keyとする。record row自体は複数作れるため、period keyとrecord idを分離する。

### 2.4 monthly_flexible

対象月のdeadlineまでに最低1回完了すれば達成。deadline ruleは `month_end` または `day_of_month` とする。defaultはsemanticな `month_end`。UIは8月31日、9月30日、2月28/29日のように実際のresolved dateを表示してよいが、保存値はmonth_endを維持する。

`day_of_month`の存在しない月はmonthly_fixedと同じ末日clampとする。periodは月初（ただしstart_dateのある初月はstart_date）からresolved deadline dateまで。record identityは `task_id + period_start + period_end` とし、period内の複数completedを履歴として保存する。

## 3. Deadlineとnotification reminder

新modelでは「deadline」と「通知」を分離する。

- fixed task: `target_date + deadline_time`
- flexible task: `period deadline date + deadline_time`
- `deadline_time = null`: time-based overdueなし、reminderなし

notification offset presetは `none`, `deadline time`, `5 minutes before`, `10 minutes before`, `30 minutes before`, `1 hour before`, `2 hours before`。保存値は `notification_offset_minutes`（`null`, `0`, `5`, `10`, `30`, `60`, `120`）とし、自由入力は導入しない。`notification_at = deadline_at - offset` で求める。

flexible taskは同periodでcompleted count >= 1ならreminder対象から除外する。追加completeは引き続き許可する。deadlineとnotification_atは同じhousehold timezoneから得たshared instantとして扱い、recipientごとにdeadlineをずらさない。

旧 `notification_time` は現行挙動を最も保つため、原則 `deadline_time = notification_time`、`notification_offset_minutes = 0` として移行する。旧値は「通知した時刻」であり本来のdeadlineとは限らないため、移行結果はlegacy provenanceを記録し、UI/APIで再編集可能にする。旧 `notification_slot` は互換読み取り用に残し、新schedulerの計算源にはしない。新taskではslotを送受信しないか、deprecated aliasとして扱う。

## 4. Skip / reset / status

固定日taskのskipはそのtarget dateのoccurrenceをskippedにする。resetはそのtarget dateのrecordを削除する。onceの過去未完了をresetしてもoccurrence自体は消えず、再びpending（deadline後ならoverdue）になる。

flexible taskのskipは個別実施ではなくperiod全体のskip。period内の未完了をskippedとして一件保存するか、period-level stateを別に持つかは実装時に選ぶが、APIの意味は「このperiodをskip」と固定する。既存weeklyのskip/open-record behaviorを維持するため、MVPではperiod-level skip recordを一件持つ案を採用する。completedが既にあるperiodはskip不可。

flexible resetは対象periodのeffective stateと履歴をどう扱うかが破壊的差分になり得る。互換性を優先し、MVPでは現行weekly同様、そのperiodに属するrecordsをすべて削除してpendingへ戻す。これは追加completion historyも消すため、導入前に明示するbreaking behaviorである。将来は履歴を残すevent logへ移行可能とする。

## 5. Record identityとcalendar projection

stable target keyを次のように定義する。

| recurrence | stable target key |
| --- | --- |
| once / daily / weekly_fixed / monthly_fixed | `occurrence:{taskId}:{targetDate}` |
| weekly_flexible | `period:{taskId}:week:{periodStart}:{periodEnd}` |
| monthly_flexible | `period:{taskId}:month:{periodStart}:{periodEnd}` |

notification delivery dedup、API response、calendar selection、history groupingでこのkeyを共通利用する。年月・period boundaryは必ずhousehold timezoneで解決する。

任意の日付Dに対して `projectTaskOnDate(task, D, householdCalendar)` を定義し、fixedはDがoccurrence dateか、flexibleはDがperiod内かを返す。未来occurrence/recordを数か月分pre-generateしない。必要なdate windowでon-demand projectionし、recordは状態変更・実施履歴・skipが発生した時だけ作る。

calendar表示はfixed中心のcell markerとする。flexible taskをperiod内の全cellへdot表示しない。selected dateでは、fixedの「その日のタスク」、weekly_flexibleの「今週中にやること」、monthly_flexibleの「今月中にやること」をdetailとして表示できる。

## 6. Assignment

`anyone` / `specific` は維持する。現行ではspecificの設定値を検証するがstate actionは実行者限定ではないため、新modelでも挙動を変えず、API/service実装時に明示的なcompatibility testを置く。

flexible taskで「誰か1人のcompleteでhousehold period達成」か「assigneeごとの達成」かは、現行コードの `completedCount` がtask/period全体を集計することから、MVPの互換案は household period達成である。ただしspecific assignmentの認可との組み合わせはopen questionとして残す。

## 7. Schema proposal

### 7.1 推奨: tasksへの共通列追加＋small config columns

MVPでは既存repository/queryを段階移行しやすい次の形を推奨する。

```text
tasks
  recurrence_type          once|daily|weekly_fixed|monthly_fixed|weekly_flexible|monthly_flexible
  start_date               YYYY-MM-DD NOT NULL after backfill
  target_date              YYYY-MM-DD NULL (once)
  deadline_time            HH:mm NULL
  notification_offset_minutes INTEGER NULL
  weekly_deadline_weekday  0..6 NULL (weekly_flexible)
  monthly_day               1..31 NULL (monthly_fixed / monthly_flexible day_of_month)
  monthly_deadline_type     month_end|day_of_month NULL (monthly_flexible)
```

`task_weekdays`はweekly_fixed専用に再利用する。`weekly_target_count`は新6種では使わず、旧weekly互換・migration監査のために当面read-onlyで保持する。旧 `scheduled_time`, `notification_time`, `notification_slot` はstaged rollout中にnullableで残し、canonical fieldへのbackfill完了後に読み取り専用化する。

`task_records`には少なくとも `target_date`, `period_start`, `period_end`, `period_key` のいずれかを追加し、period keyにunique indexを置く。ただし同periodの複数completedを許可するため、uniqueは「period-level skip/open state」用と「record event」用に分ける。既存weekly recordsは `target_week_start` をperiod_startへ対応づけ、record履歴を保持する。

### 7.2 alternative

`task_schedule_config`をtaskごとに1行持つ方式はnullable列を減らせるが、D1 query、migration、repository join、API validationが増える。recurrence-specific tableを6種に分ける方式は型安全だが、MVPの変更量とcalendar projectionの共通化に不利である。したがって今回のMVPではtasksへの列追加を採用候補とし、period calculationをdomain helperへ隔離する。

### 7.3 Migration/backward compatibility

1. 新列を追加し、既存列を削除しない。
2. 旧recurrenceを新recurrenceへbackfillする（`daily`, `scheduled`, `weekly` mapping）。
3. scheduledのweekdaysをweekly_fixedへ再利用する。
4. daily/scheduled recordの`target_date`を再利用し、weeklyの`target_week_start`をperiod boundaryへ変換する。
5. `notification_time`があるtaskは暫定 `deadline_time` と `offset=0`へ移し、legacy originを監査可能にする。nullはdeadline/reminderなし。
6. APIは旧fieldを一定期間受け付け、canonical responseを返す。旧weekly_target_count > 1は自動で1へ丸めず、migration reportまたはmanual conversion対象にする。
7. staged rolloutではread pathをcanonical優先・legacy fallback、write pathをcanonical＋必要なlegacy mirrorとする。
8. backfill検証後に旧列のwriteを停止し、十分な観測期間後に削除migrationを別承認する。

## 8. API impact proposal

`POST /api/tasks` と `PATCH /api/tasks/:id` は `recurrenceType`, `startDate`, recurrence-specific config, `deadlineTime`, `notificationOffsetMinutes`, assignmentをcanonical requestとする。旧 `scheduledTime`, `notificationTime`, `notificationSlot`, `weekdays`, `weeklyTargetCount` はcompatibility inputとして段階的に受け付ける。

`GET /api/tasks` とdetailは、task definitionに加えて `recurrence`, `deadline`, `notification`, `statusPolicy`を返す案とする。today/weekは `occurrenceKey` または `periodKey`, resolved `deadlineAt`, `status`, `overdue`, `completedCount`（flexible）を返す。historyはrecord idだけでなくstable scope keyを返す。

state actionは既存のstart/complete/skip/resetを維持し、fixedは`targetDate`、flexibleは`periodKey`をcanonical scopeとする。旧 `targetWeekStart` はweekly互換期間のみ受け付ける。

history-based createは自動候補から選択した時点では作成せず、create formへprefillする。copy対象はname/note/recurrence config/deadline/offset/assignment等、copyしないものはID、created_at、start_date、records/history。templateは明示保存・管理する再利用definitionであり、concrete start_date/records/historyを持たない。既存tasksはdefinition/template的だが、MVPでは別 `task_templates` tableを作らず、history候補とexplicit templateのUX/APIを分離できる設計を優先する。別tableが必要になる条件は、active taskのライフサイクルから独立したtemplate編集・archiving・共有権限が必要になった時とする。

## 9. Scheduler impact proposal

schedulerは `occurrence/period -> deadline_at -> notification_at -> delivery` の順で処理する。recurrenceごとにon-demandで対象scopeを解決し、deadline_timeまたはoffsetがnullなら送らない。flexibleはperiod completed count >= 1またはperiod skipなら送らない。

現行の20分delivery window、delivery dedup、claim lease、retry/release、household memberへの配信、evening summaryは維持する。dedup target keyはstable target key＋notification presetを含める。個別task通知payloadには`taskId`, stable scope key, same-origin `/tasks/{taskId}` URL候補を持たせ、night summaryはhome/today incomplete overviewへ遷移する候補とする。実装・deep-link変更は別phaseで行う。

## 10. Timezone policy

共有taskのstart_date、recurrence、deadline date/time、calendar projection、notification_atはhousehold timezoneを基準にする。recipient別subscriptionへ同じshared deadline instantを配信する。evening summaryは現行どおりuser notification settingのtimezone/timeを尊重するが、候補taskのscope判定はhousehold dateを使う。この差をAPI responseのdate/time表示で明示する。

## 11. Open questions

以下だけを実装前に決める。

1. old weeklyの`weekly_target_count > 1`を、複数回必須のlegacy modeとして残すか、manual conversionするか。
2. flexible periodのskip recordを既存`task_records`のspecial rowで表すか、period state列を追加するか。
3. `specific` assignmentでstate actionをassigned userだけに制限するか。現行behavior変更となるため、互換性テストとともに別承認する。
4. monthly fixedのmonth-end clampで、同月内にresolved dateが過ぎた場合の再発生日表示をどのAPI windowに含めるか。
5. templateを別tableに分離する条件と、history candidateの保存期間・privacy policy。
6. migration後にlegacy列を削除する時期。

## Phase 3 implementation status (2026-08-14)\n\nCanonical six recurrence types now use one server-side scope resolver. Fixed types use occurrence keys; flexible types use deadline-bounded period keys. Today/dashboard and Calendar expose additive scope, period, completed-count, deadline, and derived overdue fields. Canonical actions resolve scope from targetDate. Flexible reset deletes all records in the selected period. Legacy tasks, including weekly target counts greater than one, remain on the legacy path. Scheduler migration, deep links, migration changes, deployment, and production remain out of scope.\n\n## 12. Implementation phases

1. **Phase 1: domain/schema + migration** — canonical fields、period helper、backfill、indexes、compatibility read/write。
2. **Phase 2: API/service/repository** — recurrence validation、projection、scope actions、status/overdue、history response。
3. **Phase 3: task create/edit/detail UI** — 6種UI、deadline、preset select、period status。
4. **Phase 4: scheduler/reminder migration** — deadline-based scheduling、flexible suppression、dedup migration、legacy fallback removal。
5. **Phase 5: task notification deep-link** — individual detail and evening summary destinations。
6. **Phase 6: history/template creation UX** — prefill, explicit template lifecycle。
7. **Phase 7: calendar** — date projection, selected-date flexible details, fixed markers。

各phaseはdocs-only設計承認、local tests、migration dry-run、API/UI compatibility testの順にゲートする。今回の作業ではPhase 1以降の実装を行わない。
