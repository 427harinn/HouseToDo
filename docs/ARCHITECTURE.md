# 現在のアーキテクチャ

> この文書は、現在のtechnical architectureを説明します。chronological worklogやmilestone記録ではありません。

## Runtimeと配置

React + Viteの静的アセットをCloudflare Workers Static Assetsへ配置し、`/api/*`はWorkerが先に処理します。Workerの主な層は、route、middleware、service、repository、libです。D1は永続データ、R2 binding `ATTACHMENTS`はprivate画像blobを担当します。

`wrangler.jsonc`の現在設定は、local Worker `house-to-do` / D1 `house-to-do` / R2 `house-to-do-attachments`、staging Worker `house-to-do-staging` / D1 `house-to-do-staging` / R2 `house-to-attachments-staging`です。staging URLは `https://house-to-do-staging.427harinn.workers.dev`、Static Assetsは `dist/client`です。

## Databaseとmigration

リポジトリのmigrationは `0001_initial.sql` から `0014_shopping_planned_purchase_date.sql` までです。0014は `shopping_items.planned_purchase_date TEXT NULL` と household/date range indexをadditiveに追加し、table rebuildや既存rowの書き換えを行いません。fresh local DBの0001→0014とexisting local DBの0013→0014を検証します。D1の現在schemaはmigrationファイルと実際の適用状況を分けて確認し、remote適用済みかどうかを本文に固定記載しません。

主な領域はusers / sessions、households / members / invites、tasks / weekdays / records / task templates、shopping items / templates / images、image usage / upload reservations / orphan cleanup、push_subscriptions、notification settings / logs / delivery claimです。

## APIと認証

routeのsource of truthは `worker/app.ts` と `worker/routes/`です。認証はCookieセッション、パスワードはWorkers Web Crypto PBKDF2、状態変更APIはJSON・SameSite Lax・Origin検証で保護します。household middlewareが家庭境界を確認し、repositoryはD1アクセスを担当します。

主要API領域は `/api/auth/*`、`/api/households/*`、`/api/tasks/*`、`/api/dashboard/today`、`/api/shopping/*`、`/api/notifications/*`です。API一覧をREADMEや他docへ複製しません。

Staging Muse integration uses OAuth bearer tokens at `/mcp`. The MCP task adapter translates its compact recurrence/notification schema through shared task validation and `TaskService`; shopping tools call `ShoppingService` for list, partial update, deletion, purchase, and restore behavior. Household scope is resolved only from the authenticated token user; the service enforces item household ownership and owns image preservation and R2 cleanup. Production remains disabled in this integration configuration.

## Images / R2

画像はbrowser processing後にR2へ保存し、WebPまたはJPEGの実際のcontent typeとmagic bytesを検証してD1 metadataをtransaction境界に含めます。upload reservation、active usage、daily upload、pending cleanup、orphan queueをserviceとrepositoryで管理します。参照中のblobは削除せず、R2削除失敗はorphan queueへ送ります。

## PWA / Push

`public/manifest.webmanifest`と`public/sw.js`をproduction buildで登録します。Worker側はVAPID（Web Crypto、aes128gcm）でPush送信し、`WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY`、`WEB_PUSH_SUBJECT`をsecret bindingから読みます。endpointやsubscription keyはログ・API応答へ露出しません。

## Scheduler

`worker/index.ts`のscheduled handlerは、期限切れimage reservation cleanup、orphan R2 cleanup、notification schedulerを同じscheduled invocationで実行します。stagingのCronは `*/5 * * * *`、local/defaultのwrangler設定は `0 18 * * *` です。canonical taskは`worker/lib/task-model.ts`のscope/deadline resolverを共有し、household timezoneで`deadlineDate` / `deadlineTime`を解決します。通常のtask reminderは既存のnotification offsetを、follow-upは通常通知が設定されたtaskに限り家事時刻の30分後を基準にします。legacy follow-upは`scheduled_time`を実際の家事時刻、`notification_time`をfollow-up対象判定に使い、既存reminderの意味を維持します。stable occurrence/period keyをdelivery target keyに使い、follow-up直前にもTaskRecordを再確認します。Shopping追加通知とtask follow-upは既存`notification_deliveries`のclaim lease、delivery window、dedup、retry/release semanticsを共有します。

## Phase 3 task projection boundary

`worker/lib/task-model.ts` is the pure domain boundary for recurrence projection, stable scope keys, monthly clamping, flexible period boundaries, and deadline metadata. TaskService uses it for canonical today, week, dashboard, and action flows; TaskRecordRepository stores occurrence_key or period_key without generating pending rows. Legacy tasks bypass the canonical resolver where their semantics differ.

## Calendar projection boundary

`GET /api/tasks/calendar` is implemented in `TaskService.listCalendar`. The route validates an inclusive `from`/`to` range of 1–62 household-local dates and accepts an optional `selectedDate`. The service loads active household tasks, projects the requested date window with `projectTaskOnDate`, and reads matching task records in one range/period query. Fixed occurrence markers return counts and completion/skipped counts per date. Selected-date detail returns fixed tasks plus the active weekly/monthly flexible periods with the same `TaskWithStatus` merge used by today/dashboard flows. No occurrence rows are pre-generated and no migration is required.

The React route is `/calendar`, added to the existing lightweight parser and bottom navigation. Household `timezone` and `weekStartsOn` drive the initial today selection and calendar layout; date keys remain `YYYY-MM-DD` local household dates and are not converted through UTC instants in the API.

The same route additively integrates planned Shopping items without changing task projection semantics. `ShoppingItemRepository.listPlannedByHouseholdId` performs a bounded household-scoped `planned_purchase_date >= from AND planned_purchase_date <= to` query for grid markers. When building selected-date detail, `ShoppingItemRepository.listUnplannedByHouseholdId` separately queries household-scoped rows with `planned_purchase_date IS NULL`; the route concatenates selected-date planned rows first and unplanned rows second. The route adds `shoppingCount` and `purchasedShoppingCount` to date markers and a minimal `selected.shopping` list; it does not load attachment payloads. Pending and purchased rows are both included in selected detail, while only planned rows contribute to markers and accessible counts. Calendar item activation uses the existing Shopping detail route.

`planned_purchase_date` is stored as a nullable `YYYY-MM-DD` household-local date. Create/update validation rejects invalid calendar dates; PATCH omission preserves it and explicit `null` clears it. Purchase/unpurchase repository updates do not touch this column. Recent/template response and prefill boundaries exclude the date because it belongs to one shopping instance. The notification scheduler does not query or interpret this field.

`purchased_at` remains the existing ISO timestamp value. The frontend formats it through the shared date-time helper with `household.timezone`, showing date and time consistently in the Shopping list, detail, and Calendar selected-date card. Purchased rows without a planned date follow the same selected-date policy because purchased-item clearing physically deletes them and Shopping has no durable history table.

## Shopping UX Phase 1 boundary

Shopping recent reuse is a read-only projection of `shopping_items`; no recent table or migration is added. `ShoppingItemRepository.listRecentByHouseholdId` scopes by household, keeps pending and purchased rows eligible, deduplicates with normalized `lower(trim(name))`, sorts newest first, and applies a maximum limit of eight. `ShoppingService` and `GET /api/shopping/recent` return only `name`, `quantity`, `note`, and `createdAt`, so item identity, purchase state, purchaser, history fields, and image metadata cannot be copied by the UI.

The new Shopping form loads recent candidates and active Shopping templates together, then maps either selection into the existing form state. Save remains the only item creation path. Existing Shopping template CRUD and the `/add` endpoint retain their household-scoped semantics and immediate-add behavior for compatibility; the new-form template panel provides the Task-style prefill path.

Camera and library inputs are separate browser file inputs but share one change handler and the existing `processShoppingImage` / preview / upload pipeline. The camera input requests `capture="environment"`; the library input has no `capture` attribute. Browser/OS behavior is best-effort across iOS, Android, and desktop. R2 keys, D1 image metadata, compression, validation, and attachment limits are unchanged.

## 次期task modelの実装影響（Phase 2 API実装済み）

詳細設計は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) をsource of truthとする。実装時はtasksへcanonical schedule/deadline列を段階追加し、`task_weekdays`と既存recordsを互換利用する。recurrence計算、period key、resolved deadline、overdue判定はdomain helperへ隔離し、将来calendarとschedulerが同じprojectionを使う。

API/service/repository、canonical projection/actions、task create/edit/detail/dashboard UI、notification scheduler、Calendar UI/API、recent task reuse、task template CRUD/UIまで実装済みです。CronとCloudflare設定は変更していません。future occurrencesをDBへpre-generateせず、date windowからon-demand projectionします。notification deep-linkは後続phaseです。

Phase 1実装ではscheduler/UI互換のためlegacy `recurrence_type`を保持し、`model_recurrence_type`、deadline、start date、recurrence configをadditiveに追加する。schedulerの新deadline計算への切替、record actionの新period適用は後続phaseで行う。

## E2E test infrastructure

`npm run test:e2e`はlocal/self-contained specを単一workerで実行します。共有local D1/R2の衝突を避けるため、parallelismとretryは増やしません。Docker unavailable時は、build済みlocal Workerを許可Originの`http://127.0.0.1:5174`で起動してhost Playwrightを実行します。

`e2e/staging`はlocal suiteからstagingへ接続しません。staging専用configと`npm run test:e2e:staging`でのみ実行し、厳密なstaging workers.dev URLと7つのcredential/base URL環境変数が揃わない場合は、理由付きでskipします。staging specがlocal URLへfallbackする経路はありません。local configのtrace/screenshot/video設定は維持し、failure artifactは`PLAYWRIGHT_ARTIFACT_DIR`配下に保存します。

## 構成の境界

現在仕様と将来設計を混在させません。TaskService/Repository/API validation、canonical today/week projection、Task UI、deadline reminder scheduler、Calendar projectionはcanonical modelへ対応済みです。実行履歴はtask_recordsと既存history API、最近使ったタスクはactive canonical task definitionのcreated_at降順候補、テンプレートは`task_templates`の明示保存definitionとして分離します。recentは`GET /api/tasks/recent`で最大8件を返し、legacy weekly target count > 1、inactive task、他householdのtaskは除外します。templateは日付・records/historyを持たず、household authorization後にcreate formへprefillします。どちらもHome、Calendar、schedulerのtask projectionへ混入させません。notification deep-link等は [ROADMAP.md](ROADMAP.md) に置きます。once/monthly系は`model_only` markerでlegacy処理から除外します。
