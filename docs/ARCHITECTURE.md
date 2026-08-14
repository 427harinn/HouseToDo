# 現在のアーキテクチャ

> この文書は、現在のtechnical architectureを説明します。chronological worklogやmilestone記録ではありません。

## Runtimeと配置

React + Viteの静的アセットをCloudflare Workers Static Assetsへ配置し、`/api/*`はWorkerが先に処理します。Workerの主な層は、route、middleware、service、repository、libです。D1は永続データ、R2 binding `ATTACHMENTS`はprivate画像blobを担当します。

`wrangler.jsonc`の現在設定は、local Worker `house-to-do` / D1 `house-to-do` / R2 `house-to-do-attachments`、staging Worker `house-to-do-staging` / D1 `house-to-do-staging` / R2 `house-to-attachments-staging`です。staging URLは `https://house-to-do-staging.427harinn.workers.dev`、Static Assetsは `dist/client`です。

## Databaseとmigration

リポジトリのmigrationは `0001_initial.sql` から `0011_notification_delivery_claim_lease.sql` までです。D1の現在schemaはmigrationファイルと実際の適用状況を分けて確認します。remote適用済みかどうかを本文に固定記載しません。

主な領域はusers / sessions、households / members / invites、tasks / weekdays / records、shopping items / templates / images、image usage / upload reservations / orphan cleanup、push_subscriptions、notification settings / logs / delivery claimです。

## APIと認証

routeのsource of truthは `worker/app.ts` と `worker/routes/`です。認証はCookieセッション、パスワードはWorkers Web Crypto PBKDF2、状態変更APIはJSON・SameSite Lax・Origin検証で保護します。household middlewareが家庭境界を確認し、repositoryはD1アクセスを担当します。

主要API領域は `/api/auth/*`、`/api/households/*`、`/api/tasks/*`、`/api/dashboard/today`、`/api/shopping/*`、`/api/notifications/*`です。API一覧をREADMEや他docへ複製しません。

## Images / R2

画像はbrowser processing後にR2へ保存し、D1 metadataをtransaction境界に含めます。upload reservation、active usage、daily upload、pending cleanup、orphan queueをserviceとrepositoryで管理します。参照中のblobは削除せず、R2削除失敗はorphan queueへ送ります。

## PWA / Push

`public/manifest.webmanifest`と`public/sw.js`をproduction buildで登録します。Worker側はVAPID（Web Crypto、aes128gcm）でPush送信し、`WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY`、`WEB_PUSH_SUBJECT`をsecret bindingから読みます。endpointやsubscription keyはログ・API応答へ露出しません。

## Scheduler

`worker/index.ts`のscheduled handlerは、期限切れimage reservation cleanup、orphan R2 cleanup、notification schedulerを同じscheduled invocationで実行します。stagingのCronは `*/5 * * * *`、localのwrangler設定は `0 18 * * *` です。schedulerはdelivery window、notification logのdedup、pending delivery claim lease、retry semanticsを使います。実際の時刻・windowの詳細はservice実装とmigrationを正とします。

## 次期task modelの実装影響（未実装）

詳細設計は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) をsource of truthとする。実装時はtasksへcanonical schedule/deadline列を段階追加し、`task_weekdays`と既存recordsを互換利用する。recurrence計算、period key、resolved deadline、overdue判定はdomain helperへ隔離し、将来calendarとschedulerが同じprojectionを使う。

API/service/repository、task create/edit/detail、dashboard today/week、notification scheduler、deep-linkの順に影響するが、今回これらのコード・schema・Cron・Cloudflare設定は変更していない。future occurrencesをDBへpre-generateせず、date windowからon-demand projectionする方針である。

## 構成の境界

現在仕様と将来設計を混在させません。deadline、notification offset、recurrence redesign、calendar等は [ROADMAP.md](ROADMAP.md) に置きます。過去の理由は [DECISIONS.md](DECISIONS.md) に残し、作業進捗は保存しません。
