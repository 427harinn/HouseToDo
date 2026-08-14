# 現在のアーキテクチャ

> この文書は、現在のtechnical architectureを説明します。chronological worklogやmilestone記録ではありません。

## Runtimeと配置

React + Viteの静的アセットをCloudflare Workers Static Assetsへ配置し、`/api/*`はWorkerが先に処理します。Workerの主な層は、route、middleware、service、repository、libです。D1は永続データ、R2 binding `ATTACHMENTS`はprivate画像blobを担当します。

`wrangler.jsonc`の現在設定は、local Worker `house-to-do` / D1 `house-to-do` / R2 `house-to-do-attachments`、staging Worker `house-to-do-staging` / D1 `house-to-do-staging` / R2 `house-to-attachments-staging`です。staging URLは `https://house-to-do-staging.427harinn.workers.dev`、Static Assetsは `dist/client`です。

## Databaseとmigration

リポジトリのmigrationは `0001_initial.sql` から `0013_task_templates.sql` までです。D1の現在schemaはmigrationファイルと実際の適用状況を分けて確認します。今回の0013はlocalで検証済みですが、remote適用済みかどうかを本文に固定記載しません。

主な領域はusers / sessions、households / members / invites、tasks / weekdays / records / task templates、shopping items / templates / images、image usage / upload reservations / orphan cleanup、push_subscriptions、notification settings / logs / delivery claimです。

## APIと認証

routeのsource of truthは `worker/app.ts` と `worker/routes/`です。認証はCookieセッション、パスワードはWorkers Web Crypto PBKDF2、状態変更APIはJSON・SameSite Lax・Origin検証で保護します。household middlewareが家庭境界を確認し、repositoryはD1アクセスを担当します。

主要API領域は `/api/auth/*`、`/api/households/*`、`/api/tasks/*`、`/api/dashboard/today`、`/api/shopping/*`、`/api/notifications/*`です。API一覧をREADMEや他docへ複製しません。

## Images / R2

画像はbrowser processing後にR2へ保存し、D1 metadataをtransaction境界に含めます。upload reservation、active usage、daily upload、pending cleanup、orphan queueをserviceとrepositoryで管理します。参照中のblobは削除せず、R2削除失敗はorphan queueへ送ります。

## PWA / Push

`public/manifest.webmanifest`と`public/sw.js`をproduction buildで登録します。Worker側はVAPID（Web Crypto、aes128gcm）でPush送信し、`WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY`、`WEB_PUSH_SUBJECT`をsecret bindingから読みます。endpointやsubscription keyはログ・API応答へ露出しません。

## Scheduler

`worker/index.ts`のscheduled handlerは、期限切れimage reservation cleanup、orphan R2 cleanup、notification schedulerを同じscheduled invocationで実行します。stagingのCronは `*/5 * * * *`、localのwrangler設定は `0 18 * * *` です。canonical taskは`worker/lib/task-model.ts`のscope/deadline resolverを共有し、household timezoneでdeadline instantを解決してoffsetを引きます。stable occurrence/period keyをdelivery target keyに使います。legacy taskだけは`notification_time`を使用します。delivery window、dedup、pending claim lease、retry/release semanticsは共通です。

## Phase 3 task projection boundary

`worker/lib/task-model.ts` is the pure domain boundary for recurrence projection, stable scope keys, monthly clamping, flexible period boundaries, and deadline metadata. TaskService uses it for canonical today, week, dashboard, and action flows; TaskRecordRepository stores occurrence_key or period_key without generating pending rows. Legacy tasks bypass the canonical resolver where their semantics differ.

## Calendar projection boundary

`GET /api/tasks/calendar` is implemented in `TaskService.listCalendar`. The route validates an inclusive `from`/`to` range of 1–62 household-local dates and accepts an optional `selectedDate`. The service loads active household tasks, projects the requested date window with `projectTaskOnDate`, and reads matching task records in one range/period query. Fixed occurrence markers return counts and completion/skipped counts per date. Selected-date detail returns fixed tasks plus the active weekly/monthly flexible periods with the same `TaskWithStatus` merge used by today/dashboard flows. No occurrence rows are pre-generated and no migration is required.

The React route is `/calendar`, added to the existing lightweight parser and bottom navigation. Household `timezone` and `weekStartsOn` drive the initial today selection and calendar layout; date keys remain `YYYY-MM-DD` local household dates and are not converted through UTC instants in the API.

## 次期task modelの実装影響（Phase 2 API実装済み）

詳細設計は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) をsource of truthとする。実装時はtasksへcanonical schedule/deadline列を段階追加し、`task_weekdays`と既存recordsを互換利用する。recurrence計算、period key、resolved deadline、overdue判定はdomain helperへ隔離し、将来calendarとschedulerが同じprojectionを使う。

API/service/repository、canonical projection/actions、task create/edit/detail/dashboard UI、notification scheduler、Calendar UI/API、recent task reuse、task template CRUD/UIまで実装済みです。CronとCloudflare設定は変更していません。future occurrencesをDBへpre-generateせず、date windowからon-demand projectionします。notification deep-linkは後続phaseです。

Phase 1実装ではscheduler/UI互換のためlegacy `recurrence_type`を保持し、`model_recurrence_type`、deadline、start date、recurrence configをadditiveに追加する。schedulerの新deadline計算への切替、record actionの新period適用は後続phaseで行う。

## 構成の境界

現在仕様と将来設計を混在させません。TaskService/Repository/API validation、canonical today/week projection、Task UI、deadline reminder scheduler、Calendar projectionはcanonical modelへ対応済みです。実行履歴はtask_recordsと既存history API、最近使ったタスクはactive canonical task definitionのcreated_at降順候補、テンプレートは`task_templates`の明示保存definitionとして分離します。recentは`GET /api/tasks/recent`で最大8件を返し、legacy weekly target count > 1、inactive task、他householdのtaskは除外します。templateは日付・records/historyを持たず、household authorization後にcreate formへprefillします。どちらもHome、Calendar、schedulerのtask projectionへ混入させません。notification deep-link等は [ROADMAP.md](ROADMAP.md) に置きます。once/monthly系は`model_only` markerでlegacy処理から除外します。
