# HouseToDo 通知システム監査

WP9 preflight / existing notification capability review。監査日: 2026-09-02。

## 監査条件

- Base SHA: 940a4d8bbe5c4d47f3fa12d6dad50e70afac7c93
- Branch: audit/notification-system
- 作業範囲: repository の静的コード、migration、設定、テスト、既存 docs の確認。
- Staging: 設定の読み取りのみ。remote D1、secret、deploy、push smoke は実行していない。
- Production: 未接触。
- D1 migration: なし。
- 判定語: IMPLEMENTED はコード上の機能が存在、PARTIAL は一部の経路または仕様だけ、MISSING は該当実装なし。

## 1. Architecture inventory

### Backend / Worker

| Area | Files | Evidence |
| --- | --- | --- |
| Worker entry / routes | worker/index.ts, worker/app.ts, worker/routes/notifications.ts, worker/routes/notification-settings.ts | scheduled()、notification API route、auth wrapper |
| Subscription | worker/services/push-subscription-service.ts, worker/repositories/push-subscription-repository.ts | current-household scoped register/unregister、endpoint upsert、enable/disable |
| Web Push | worker/services/web-push-service.ts, worker/lib/crypto.ts | Web Push payload encryption、VAPID ES256、endpoint POST |
| Scheduler | worker/services/notification-scheduler-service.ts, worker/repositories/notification-scheduler-repository.ts, worker/repositories/notification-delivery-repository.ts | legacy/canonical reminder resolver、summary、claim lease |
| Authoritative task projection | worker/services/task-service.ts, worker/lib/task-model.ts, worker/repositories/task-repository.ts, worker/repositories/task-record-repository.ts | Home projection、canonical occurrence/period scope |

### Frontend / PWA

| Area | Files | Evidence |
| --- | --- | --- |
| Service Worker | public/sw.js, src/main.tsx, public/manifest.webmanifest | push、showNotification、notificationclick、production registration |
| Notification API / settings | src/api/notifications.ts, src/pages/OtherSettingsPage.tsx | VAPID public key、subscription、test push、summary settings UI |
| Browser capability / VAPID | src/lib/capabilities.ts, src/lib/vapid.ts | Push/Notification/standalone capability detection、public-key decoding |
| Navigation / Home | src/App.tsx, src/lib/notification-url.ts, src/api/home.ts | legacy route redirect、Home detail expansion、safe URL helper |
| Task model / form | src/task-model-ui.ts, src/api/tasks.ts, worker/lib/validation.ts | deadline and notification offset; legacy notification fields |

### Data / configuration / operational docs

- migrations/0001_initial.sql: original tasks、push_subscriptions、notification_logs tables。
- migrations/0009_push_subscription_foundation.sql: subscription lifecycle、FK、endpoint hash/index。
- migrations/0010_notification_scheduler.sql: tasks.notification_time、user_notification_settings、notification_deliveries。
- migrations/0011_notification_delivery_claim_lease.sql: claimed_at backfill。
- migrations/0012_task_model_foundation.sql: canonical recurrence/deadline/notification offset backfill。
- migrations/0015_account_avatars_and_morning_notifications.sql: morning summary fields。
- wrangler.jsonc: default 0 18 * * *、staging */5 * * * *。
- .dev.vars.example, .env.example, scripts/generate-vapid-secrets.mjs, scripts/validate-staging-config.mjs, docs/STAGING_DEPLOYMENT.md。
- README.md, docs/ARCHITECTURE.md, docs/PROJECT_SPEC.md, docs/TASK_MODEL_DESIGN.md, docs/DECISIONS.md, docs/ROADMAP.md。

### Tests

- worker/notifications.test.ts: settings、VAPID public key、subscription API、test endpoint、safe errors。
- worker/services/web-push-service.test.ts: encryption request、success、404/410、HTTP/network/VAPID failure classification。
- worker/services/notification-scheduler-service.test.ts: delivery window、DST、legacy/canonical recurrence、completion/skip、retry/dedup、morning/evening。
- worker/repositories/notification-delivery-repository.test.ts: new claim、sent duplicate、stale lease、concurrent reclaim。
- worker/scheduled.test.ts: scheduled handler waitUntil and cleanup invocation。
- src/lib/capabilities.test.ts, src/lib/vapid.test.ts, src/lib/notification-url.test.ts: browser capability、public-key decode、safe URL helper。
- src/App.test.tsx: task deadline/offset form、Home inline detail and Complete behavior。Notification click/deep-link integration testはない。
- worker/app.test.ts, worker/lib/validation.test.ts: general API/validation coverageの一部に task notification fields。

## 2. Subscription flow

### Browser / PWA flow

1. src/main.tsx は production かつ Service Worker 対応時だけ /sw.js を load 後に登録する。
2. Settings の「この端末の通知」を有効化すると、ユーザー操作中に Notification.requestPermission() を呼ぶ。
3. registration.pushManager.getSubscription() を確認し、なければ VAPID public key を取得して subscribe({ userVisibleOnly: true, applicationServerKey })。
4. PushSubscription.toJSON() の endpoint, keys.p256dh, keys.auth を POST /api/notifications/subscriptions に送る。
5. 無効化時は同じ endpoint を API から DELETE した後、browser の subscription.unsubscribe() を呼ぶ。

### Storage / association

push_subscriptions は id, household_id, user_id, endpoint, endpoint_hash, p256dh, auth, enabled, timestamps、disabled_at, last_success_at, last_failure_at を持つ。user_id と household_id の FK は ON DELETE CASCADE。endpoint は table-level UNIQUE、endpoint hash にも partial unique index がある（migrations/0009_push_subscription_foundation.sql:5-45）。

登録・解除 API は authenticated user と current household を要求する。登録時は current household に保存する。保存時に endpoint が存在すれば、その既存 row の user/household、keys、timestamps を更新して再有効化するため、同じ endpoint は一時に一人・一家庭にだけ属する。異なる endpoint は user/household ごとに複数保存でき、送信時は全 active subscription を列挙する。

### Exact behavior / gaps

- Duplicate browser registration: endpoint lookup + update、row は増えない。
- Endpoint uniqueness: global endpoint unique。別ユーザーの同一 endpoint を登録すると既存 row をそのユーザーへ付け替える。
- Unsubscribe: user_id AND household_id AND endpoint に一致する row だけ DELETE。対象なしでも API は { removed: true } を返す。
- Expired cleanup: 404/410 response は enabled=0, disabled_at, last_failure_at を更新する。DBからは物理削除しない。
- Malformed key / invalid subscription: base64 URL文字列、HTTPS endpoint の形式だけを登録時に検証する。暗号化時の p256dh 65-byte / auth 16-byte 不一致は invalid_subscription として失敗するが、無効化はしない。
- Network、401/403、429、5xx、その他4xxは failure classification のみで、404/410以外は subscription row を無効化しない。一般 failure の時刻を last_failure_at に記録する処理もない。
- 404/410 は対象 row だけを無効化するため、同じ user の他端末には影響しない。
- Safari/iPhone: navigator.standalone / standalone display mode を検出し、UI上は「iPhoneではホーム画面に追加」と案内する。実機での Safari Push receipt はこの repository test にはない。Safari専用APIやAPNs SDKはない。

登録 body は authenticated user が任意に送れる形式で、endpoint ownership proof はない。したがって、認証済みユーザーが知っている endpoint を送れば既存 row を付け替えられる設計である。通常の browser flow では自端末の PushSubscription を送る。

## 3. Push server

### VAPID / secrets

- Public key: GET /api/notifications/vapid-public-key が authenticated user にだけ返す WEB_PUSH_VAPID_PUBLIC_KEY。
- Private key: WEB_PUSH_VAPID_PRIVATE_KEY。repositoryへ値はない。.dev.vars.example と staging runbook では secret name のみ定義。
- Subject/contact: WEB_PUSH_SUBJECT。mailto: または https: を要求。
- Env type: worker/types/env.ts に3つの optional string binding。
- wrangler.jsonc にsecret valueはなく、top-level / staging configの secret existenceは runtime deployment設定に依存する。

### Implementation

外部 web-push libraryは package.json にない。worker/services/web-push-service.ts が Web Crypto で実装している。

- User public key: ECDH P-256。
- Payload: JSON文字列を aes128gcm record としてRFC Web Push形式で暗号化。
- Auth: subscription auth を HMAC/HKDF に使用。
- VAPID: private JWKを ECDSA P-256 に importし、ES256 JWTを endpoint origin audienceで署名。
- Request: POST endpoint, Content-Encoding: aes128gcm, Content-Type: application/octet-stream, TTL: 60, VAPID Authorization。
- APNs/Web Push: Apple endpoint hostnameを診断用に分類するが、送信は標準Web Push HTTP request一本で、APNs専用実装ではない。FCM/Mozillaも同様に endpointへ標準送信する。

秘密値はログ・監査文書・レスポンスに出さない。public keyだけは認証済みAPIで公開される。

## 4. Cron

worker/index.ts:8-35 に Cloudflare scheduled handler が存在する。ctx.waitUntil() 内で次を順に実行する。

1. expired image reservation cleanup
2. orphan R2 cleanup
3. runNotificationScheduler(env, new Date(controller.scheduledTime))

各 cleanup と notification scheduler の例外は catch してログ化する。notification scheduler の DB/household loop 内に household単位の独立 catch はなく、scheduler全体の例外は scheduled handlerで握って後続 invocationへ委ねる。

| Environment | Cron | Assessment |
| --- | --- | --- |
| default config（production相当の明示 env はない） | 0 18 * * * | UTC 18:00の1日1回。09:00/21:00の任意設定を安定して拾う頻度ではない。 |
| staging | */5 * * * * | 5分ごと。設定時刻から20分のdelivery window内で拾う設計と整合。 |
| local test fixture | handlerへ scheduledTime を注入 | 実Cronではない。 |

env.production override は存在しない。production resource ID / secret valueも設定ファイルにはない。staging validatorは */5 * * * * をUTC triggerとして要求する（scripts/validate-staging-config.mjs:4,23-26）。Stagingの実 remote状態は問い合わせていないため、「設定上 configured」とだけ判定する。

## 5. Morning notification

**判定: PARTIAL**

### Implemented

- user_notification_settings に morning_summary_enabled, morning_summary_time があり、migration defaultは disabled / 09:00。
- Settings UIで端末Push有効時だけ朝通知をON/OFF、input type=timeで時刻変更できる。
- 時刻の設定値は HH:mm、timezoneはIANA timezoneとして検証される。
- schedulerは設定 enabled userごとに resolveScheduledNotification() の20分 half-open windowで判定する。
- active task、対象日、daily recordの completed / skipped 除外は legacy/daily系について実装。
- 対象が0件なら送らない。
- title/body/dataは現状 今日の家事 / 今日の家事がN件あります / { url: "/" }。

### Missing or drifting from target

- household timezone固定ではない。trigger判定は recipientの setting.timezone を使用し、userごとに household timezoneと異なる値を保存可能。
- summaryの task eligibility は isTaskDueToday() という別ロジックで、Home projectionを呼ばない。canonical once/monthly/flexible、future startDate等を正確に同じ意味では扱わない。
- bodyに残りタスク名を含めない。scheduler内には task title があるが、payloadは件数だけ。
- / に遷移するだけで、対象 task selection/deep-linkはない。
- default Cronの1日1回では、09:00等の時刻を保証できない。
- assigned userだけへ絞らず、summaryは設定をONにした各メンバーへ送る。

### Detailed selection rules actually used

summary用 getIncompleteTasksForDate(dateKey) は、全 active taskから次を選ぶ。

- recurrenceType === "daily": 対象（ただし startDateを自分では見ない）。
- recurrenceType === "scheduled" かつ weekdays一致: 対象。
- canonical weekly_fixed は通常 recurrenceType と weekdaysが残るため対象になり得る。
- once / monthly_fixed / weekly_flexible / monthly_flexible: raw recurrence/weekday条件により summary対象外。
- legacy weekly: isTaskDueToday() が明示的に除外。
- record statusが completed または skipped: 除外。in_progressとrecordなしは残り扱い。

## 6. Evening notification

**判定: PARTIAL**

朝と同じ scheduler / selection / recipient / timezone / Cron制約を持つ。異なる点は default time 21:00、title 今日のやり残し、body 未完了の家事がN件あります。0件なら送らない。completed exclusion、dedup、test coverageはあるが、canonical/Home parity、タイトル列挙、household-local time保証、production cadenceは未完成。

## 7. Remaining-task calculation

### Home authoritative projection

GET /api/home/today は HomeService.getToday() → TaskService.listHomeForHousehold() を使う（worker/services/home-service.ts:72-87, worker/services/task-service.ts:231-316）。Homeは household timezoneで target dateを求め、active taskを projectTaskOnDate() に通し、scopeに応じた recordを集める。

Homeの canonical projectionは以下を扱う。

| Recurrence | Home scope / status |
| --- | --- |
| once | target date occurrence |
| daily | start date以後の daily occurrence |
| weekly_fixed | configured weekdaysの occurrence |
| monthly_fixed | day-of-monthを月日数にclampした occurrence |
| weekly_flexible | deadline weekdayで閉じる week period、period内1回で達成 |
| monthly_flexible | month endまたは指定日で閉じる month period、period内1回で達成 |
| legacy daily / scheduled | legacy projection、activeかつ該当日 |
| legacy weekly | household week scope と weekly target count |

Homeは pending をDBに保存せず、recordがなく、または in_progress のとき derived statusにする。active taskの completed / skipped は active task listから除外し、当日の action historyは別に表示する。assigneeは household memberであることを write時に検証するが、Homeの表示/残り判定を assigneeで絞らない。

### Notification duplication / drift

task-specific canonical reminderは resolveCanonicalNotifications() で projectTaskOnDate() を共有し、occurrence/period record、completed/skipped、stable target keyを判定する。この部分はHomeに近い。

一方 morning/evening summaryは isTaskDueToday() と listDailyRecords() だけを使う。したがって次が重複・drift箇所である。

- Homeとsummaryで recurrence selection が別。
- summaryは canonical flexible period recordを見ない。
- summaryは startDate、monthly day、period boundaryを自分で解決しない。
- summary trigger timezoneと task status date timezoneの source が分かれる可能性がある。
- task-specific reminderは canonical resolver、summaryは legacy-style resolver。

通知対象資格はHomeの authoritative projection、またはその共有可能な projection APIへ寄せる必要がある。

## 8. Task-specific notification

| Layer | Status | Actual capability |
| --- | --- | --- |
| DB | PARTIAL | legacy tasks.notification_time と canonical deadline_time + notification_offset_minutes がある。独立した任意 reminder time / notify_at tableはない。 |
| Backend API | PARTIAL | create/PATCHで canonical deadline/offset、legacy notificationTimeを受ける。task-specific notification専用APIはない。 |
| Frontend UI | PARTIAL | canonical task formに「時間」と「通知なし/時刻ちょうど/5分前…」がある。別の通知時刻入力はない。legacy fieldsは互換stateにあるが現行canonical UXの中心ではない。 |
| Scheduler | IMPLEMENTED | legacy notification_time と canonical deadline-offsetを20分 windowで評価。6 canonical recurrenceのresolver自体はある。summaryは別実装でdriftする。 |
| Push generation | PARTIAL | task payloadは送るが titleは共通 家事の時間です、bodyは task title、recipientは全 household member。target copy/assignee policyは未確定。 |
| Deep-link | PARTIAL | payloadは { url: "/tasks/{taskId}" }。safe same-origin clickはあるが、実際は legacy redirectで edit routeへ行き、Home選択・展開にはならない。 |

Current task-specific payload:

~~~text
title: 家事の時間です
body: <task.title>
data: { url: /tasks/<taskId> }
~~~

これは送信機能としては存在するが、target product exampleの「ゴミ出しの時間です」/ instruction bodyとは一致しない。

## 9. Task time vs notification time

現行 fieldsの意味は次のとおり。

- legacy scheduled_time: legacy daily/scheduled taskの表示用予定時刻。schedulerの triggerには使わない。
- legacy notification_time: task単位の絶対時刻。legacy schedulerがこの時刻に送る。notification_slot は保存されるが schedulerの時刻解決には使われない。
- canonical deadline_time: Home/Calendarの締切・表示時刻。
- canonical notification_offset_minutes: deadlineからの相対通知時刻。nullは通知なし。migrationは legacy notification_time を deadline_time と offset 0 に backfillする。

現行canonical設計は、すでに「表示上の deadline」と「deadlineからの notification offset」を分離している。任意の絶対 reminder を追加するなら、task display/deadline timeを自動的に notification time とみなさない B（独立 reminder/notification time）が安全である。今回は変更しない。

## 10. Service Worker

public/sw.js:38-61 の push handlerはJSON objectだけを受け、次の showNotification(title, options) を構築する。

| Property | Used? | Current behavior |
| --- | --- | --- |
| title | YES | stringなら使用、default HouseToDo |
| body | YES | stringなら使用 |
| icon | YES | same-origin safe asset URLのみ |
| badge | YES | payloadにあれば same-origin safe asset URL。現行scheduler payloadでは未指定 |
| tag | NO | 未使用 |
| data | YES | data.urlをsame-origin path/query/hashに制限して保存 |
| actions | NO | 未使用 |
| requireInteraction | NO | 未使用 |
| renotify | NO | 未使用 |

payloadが無い、JSONでない、objectでない場合は表示しない。showNotification() の完了は event.waitUntil() で待つ。

Web Pushが提供するのは title/body/data等で、collapsed/expanded/long-press presentationはOS/browserの責務である。別の「long press」Web APIイベントは実装されていない。

## 11. Notification click

notificationclick は常に notificationをcloseし、event.notification.data.urlをsafe URL化する。

- clients.matchAll({ type: "window", includeUncontrolled: true })。
- 同一origin window clientがあれば最初の1件を選ぶ。
- targetと current pathnameが異なるときだけ client.navigate(targetUrl).then(focus)。
- pathnameが同じなら query/hashが違っても navigateせず focusする。
- clientがなければ clients.openWindow(targetUrl)。
- cross-origin、protocol違い、malformed URL、empty valueは / に fallback。

現在の payload target /tasks/{id} は src/App.tsx:248-250 の legacy redirectで /tasks/{id}/edit になる。notification dataの taskIdを client stateへ直接渡す処理はない。Safari standalone専用の分岐もない。

Task deep-link capability: **PARTIAL**。safe open/focusはREADYだが、desired Home selection/deep-linkは未実装。

## 12. Home task-selection readiness

Homeには既存の inline detail capabilityがある。

- HomeScreen は active task rowを表示し、row clickで expandedTaskId を切り替える。
- 展開部の先頭に 完了 buttonがある。
- clickだけでは completeを実行しない。
- complete開始時は row detailを閉じる。
- 一度に一件だけ展開できる。

しかし routeFromLocation() / parseRoute() は /home の queryを task selectorとして読まず、HomeScreen も window.location.search の task を参照しない。したがって /home?task=<id> の現状結果は通常Homeを表示するだけで、次はできない。

| Desired behavior | Current |
| --- | --- |
| active taskをURLから locate | NO |
| detailを自動展開 | NO |
| scroll into view | NO（Home task用はない。Shoppingには同等処理がある） |
| Completeをすぐ押せる | 手動でrowを展開すれば YES、notification tap直後は NO |
| 自動completeしない | YES。現行row clickは状態を変えない |

最小実装案は、Homeで query task IDを読み、authoritative Home response受領後に同じ active task IDが存在するときだけ expandedTaskId を設定し、row refの scrollIntoView({ block: "center" }) を一度実行すること。taskが無い/完了済み/別家庭なら展開せず通常Homeとし、Completeはユーザー操作だけにする。

## 13. Multi-device behavior

- iPhone PWA、desktop browser、別 deviceは通常それぞれ異なる endpoint rowを持てる。
- 一人の userの active subscriptionは user_id + household_id で全列挙されるため、複数端末への送信をサポートする。
- 1 endpointの404/410無効化はその rowだけ。他端末rowは残る。
- 一人の userの複数端末のうち一部だけ成功した場合、sendPayload は sent > 0 なら delivery全体を sent とする。失敗端末だけを後で再送する単位ではない。
- morning/evening summaryは enabled settingsを持つ userごと。Push subscriptionがない userには送信されない。
- task-specific notificationは schedulerが household members全員をrecipientとして loopし、各userの active subscriptionsへ送る。assigned userのみではない。

## 14. Recipient / assignee behavior

Actual policy: **task-specificは全 household member、summaryはsummary settingsをONにした全 household member**。assigned_user_id / assignment_type は schedulerのrecipient filterに使われない。unassigned taskも同じく全員へ送る。

これは現在の Homeが household shared task listで、assigneeは表示/責任情報として扱う意味とは整合するが、個人reminderとしては過通知になり得る。後続仕様では assigned only、all members、unassignedはall・assignedはassigned only のいずれかを明示してから変更すべきである。

## 15. Duplicate protection

notification_deliveries の unique keyは (user_id, household_id, notification_type, target_key)。schedulerはdelivery前に atomic claim()を行う。

- summary target key: scheduled local date。morning/eveningは notification typeが異なる。
- legacy task target key: task.id:scheduledDate:scheduledTime。
- canonical task target key: task:occurrence:<scope> または task:period:<scope>。
- pending claimの leaseは10分。stale pendingは再claim可能。
- sent rowは同じ target keyを再claimしない。
- push failure (sent === 0) は rowを削除して次のwindowで retry。
- crashでpendingが残った場合はlease後にretry。
- Concurrent stale reclaimはD1 conditional upsertで1件だけ通ることをtest済み。

制約は強いが、送信成功後の markSent() が失敗した場合は rowがpendingのまま残り、lease後に再送する可能性がある（exactly-onceではない）。また複数端末の一部成功は全体sent扱いなので、端末別retryはない。

## 16. Failure handling

| Failure | Actual behavior |
| --- | --- |
| one subscription fails | WebPushServiceはsubscriptionごとに順次処理し、次を継続。one failureで同userの他subscriptionは中断しない。 |
| one recipient fails | schedulerの次のmember loopは継続。sendPayloadが一部成功ならdeliveryはsent。 |
| 404/410 | rowをdisabled化、物理削除なし。 |
| malformed p256dh/auth | encryption failure。rowはdisabled化しない。 |
| network error | safe classification/log。schedulerではdeliveryをrelease。自動 retryは次のcron window（window内なら）に依存。 |
| 401/403/429/5xx/other 4xx | failure classification。404/410以外はrow state変更なし。 |
| missing/invalid VAPID config | sendPayload throws push-config-missing。deliverがcatchしてdeliveryをrelease。summary/task loopの次の処理は継続するが、設定が無い間は各送信で失敗する。 |
| D1/list/query failure | per-household/per-recipient catchはないためscheduler全体が中断し、scheduled handlerがエラーをログ化。後続householdはその invocationで処理されない。 |

送信結果・diagnosticsは endpoint、keys、Authorization、secret valueを出さない設計で、staging/development/testだけ詳細分類をlogする。

## 17. Timezone

- household timezone sourceは households.timezone、default Asia/Tokyo。
- Home target date、task projection、deadline instantは household timezone。
- summary triggerは user_notification_settings.timezone。GET defaultは household timezoneだが、PATCHでuserごとに変更可能。
- schedulerは Intl.DateTimeFormat の IANA timezoneで local date/timeを計算し、20分 windowを比較。
- canonical deadlineは zonedDateTimeToDate() で UTC instantへ変換し、notification offsetを引く。
- DST timezoneの America/New_York testはある。DST transitionのwall-clock ambiguous/nonexistent timeをproduct policyとして固定するtestはない。
- Cloudflare Cron expressionは設定上UTC。periodic Cronからアプリがlocal timeを判定する方針は stagingでは成立するが、defaultの1日1回Cronは頻度不足。

結論: IANA/DST-awareな計算コードは実装済みだが、targetの「household timezoneに従う」はsummary settingsがuser timezoneを使うため厳密には未達。

## 18. Security

- subscription register/unregister、VAPID public key、settings、test pushは requireAuth。
- state-changing APIは allowed Origin と JSON Content-Typeを middlewareで検証。
- register/unregisterは current householdを要求。subscription rowも household/user FKを持つ。
- 任意task IDを含む現行 notification URLは、click時はsame-originに制限され、アプリの task APIは認証済み current household境界で再検証する。payload内のtask IDは暗号化済みPush payloadでrecipientへ送られる。
- summary payloadは task名/IDを含まず、task-specific payloadはtitleとtask pathを含む。household名や他task一覧は含まない。
- endpoint registrationに本人の browser subscription ownership proofはなく、知っている endpointのrow付け替え余地がある。
- safeUrl は open redirectを防ぐ。src/lib/notification-url.ts に同等のhelper/testがあるが、Service Workerは独自の同等実装を持つ。
- VAPID private key、subscription key、Authorization、payload secretはレスポンス/diagnostic logへ出さない。

## 19. Tests

### Covered

- subscribe/register: authenticated current-household、endpoint upsert、HTTPS/base64 validation、user isolation。
- unsubscribe: owner rowだけ削除する isolation。
- settings: morning/evening independent enable/time persistence、timezone field。
- VAPID: public key response、missing config、base64 decode、private import/sign failure。
- Web Push: encrypted body、required headers、2xx、404/410 disable、network/HTTP error classification、安全な診断。
- Scheduler: 20-minute window、midnight rollover、DST timezone、legacy daily/scheduled/weekly selection、canonical fixed/flexible recurrence、completed/skipped exclusion、start date、retry、claim lease、summary dedup、empty summary。
- scheduled handler: waitUntil と notification scheduler invocationを含む。
- Home UI: manual row expansion、Complete button、clickで自動completeしない、一件だけ展開、completion/pass/restore。

### Missing

- real Service Worker push / showNotification integration。
- real notificationclick focus/navigate/openWindow。
- /home?task=<id> route parsing、auto-selection、auto-expand、auto-scroll、wrong-household/missing-task fallback。
- summary bodyに task titlesを含める仕様・truncation。
- summaryが6 canonical recurrenceとHome projectionに一致すること（特に once/monthly/flexible/startDate）。
- household timezoneを固定した朝夜境界、user timezone diverging from household、DST skip/fold。
- duplicate test for push success followed by markSent failure、partial multi-device retry。
- malformed subscription cleanup / repeated expired endpoint cleanup。
- real 404/410 push service contract、Safari/iPhone PWA receipt。
- assignee recipient policy。

## 20. Gap analysis / recommended N1/N2 implementation plan

### Gap matrix

| Feature | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Web Push subscription | IMPLEMENTED | OtherSettingsPage subscribe; notification route; push_subscriptions | endpoint ownership proofはない |
| Unsubscribe | IMPLEMENTED | DELETE route + deleteOwnedByEndpoint | no-op deleteもsuccess表示 |
| Multiple devices | IMPLEMENTED | endpoint rows列挙、user/household query | per-device result/retryなし |
| Invalid subscription cleanup | PARTIAL | 404/410でdisabled | malformed key/networkはcleanupなし |
| Morning schedule | PARTIAL | settings + scheduler + 20-min window | default Cron頻度、projection/timezone/body gap |
| Evening schedule | PARTIAL | settings + scheduler + 20-min window | same |
| Completed exclusion | IMPLEMENTED | isIncomplete、canonical record checks | summary recurrence driftあり |
| Remaining task titles | MISSING | summary payloadは件数のみ | title list bodyなし |
| Timezone | PARTIAL | IANA Intl / zoned resolver | summaryはuser timezone、default Cron不足 |
| Assignee filtering | MISSING | schedulerはmembers全員へloop | recipient policy未分岐 |
| Duplicate prevention | IMPLEMENTED | unique key + 10-min claim lease | markSent failure/partial device caveat |
| Individual task notification DB | PARTIAL | notification_time; deadline_time + offset | dedicated reminder time/tableなし |
| Individual task notification UI | PARTIAL | canonical deadline + offset controls | independent reminder timeなし、legacy UX弱い |
| Individual task scheduler | PARTIAL | legacy/canonical resolver | summary/Home parityとrecipient policy gap |
| Individual task push | PARTIAL | encrypted task payload send | generic copy、all-members recipient |
| Task notification deep-link | PARTIAL | /tasks/{id} + safe click | Home selected taskではなくedit redirect |
| Home auto-selection | MISSING | Home queryは未読、manual expandedTaskIdのみ | task query読取なし |
| Home auto-scroll | MISSING | Shoppingだけ scrollIntoView | Home task ref/scrollなし |
| Immediate Complete availability | PARTIAL | expanded Home detailにComplete | notification tap後は未展開 |
| Notification actions | MISSING | SW optionsにactionsなし | iPhone必須にすべきでない。tapを主動線にする |
| Long-press detail body | PARTIAL | OSがbodyを表示、summaryは件数のみ | title列挙がなくexpanded detailに不十分 |

### Recommended N1: reliable morning/evening remaining-task summaries

実装済みの settings、scheduler、delivery claim、Web Pushを再利用し、次の順に縮小実装する。

1. Summaryの正式な対象を household-local date と定義し、Homeと同じ projectTaskOnDate / record scopeを使う shared projectionへ統合する。once、daily、weekly_fixed、monthly_fixed、weekly_flexible、monthly_flexible、legacyを対象仕様どおりに明示する。
2. completed / skipped / inactive / start date / period completionの判定を同じ projection結果から行い、assigneeは現行product policy（当面 all members または assigned-only）を明文化する。
3. task titlesを1件、2-3件、many件の日本語formatでbodyへ追加する。summaryが0件なら送らない現行behaviorは維持する。
4. production相当のCronをperiodic UTC triggerへ変更し、staging同様にアプリ側で household-local 09:00/21:00 windowを判定する。DST/household timezone境界テストを追加する。
5. summaryを含む recipient単位の送信結果、partial device failure、markSent failureをテストし、必要なら failure retry policyを定める。

### Recommended N2: task-specific reminder + Home selected-task deep-link

1. 現行 canonical deadline_time + notification_offset_minutes を使うか、独立 reminder時刻を要求するなら reminder_time / notify_at を追加するかを決定する。display deadlineを暗黙に通知時刻へ昇格させない。
2. API/formに通知設定を明示し、legacy notification_timeとの互換境界を整理する。schedulerはshared projectionと stable occurrence/period keyを使う。
3. payloadを { url: "/home?task=<id>" }（または同等の safe deep-link）へ変更し、Service Workerのsame-origin guardを維持する。
4. Home authoritative data受領後に task IDを同一 household response内で照合し、存在する active taskだけ選択・展開・scrollする。Completeは自動実行しない。
5. click handler、query/hash差分、no client/openWindow、missing/completed/inactive task、multi-device deliveryをtestする。Notification actionsはbest-effortの後続候補に留める。

### Final audit verdict

NOTIFICATION_AUDIT_READY

通知基盤（subscription、VAPID、暗号化、Cron handler、task reminder resolver、delivery dedup）は存在する。しかし target product behaviorとしては、朝夜 summaryの reliable household-local/Home-parity、残りtask名、task-specific copy、Home deep-link selection/expansion/scrollが未達または部分実装である。

