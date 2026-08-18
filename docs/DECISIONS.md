# 設計判断ログ

> 長期的に残す重要な設計判断のsource of truthです。作業進捗や調査probeの時系列全文は置きません。

Statusは原則 `Accepted`。変更された判断には `Superseded` と `Superseded by` を追記し、単なる履歴は削除せず短く保ちます。

## 2026-08-14 Calendarはbounded range projectionとする

**Status:** Accepted; implemented

Calendarは `GET /api/tasks/calendar` の household-local date range projectionをsource of truthとし、rangeは最大62日、grid markerは固定 occurrence中心、flexible taskはselected-date detailだけに返す。`projectTaskOnDate`と既存のstatus/overdue mergeを再利用し、将来occurrenceをDBへ生成しない。

**理由:** recurrence semanticsをfrontendへ複製せず、monthly clamp・flexible period boundary・record stateをTask domainで一貫させるため。bounded rangeは異常な巨大取得と不要なrecord走査を防ぐ。

## 2026-08-10 Web Push receiver情報をログへ出さない

**Status:** Accepted

Web Pushのendpoint、p256dh、auth、VAPID material、Authorization、payload、upstream response bodyはログ・API応答・エラー詳細へ出さず、allowlistしたstage / errorCategory / upstreamStatus等だけを記録する。Apple等のreceiver調査は固定宛先のtransport probeに限定し、実送信の代替にはしない。

**理由:** Push endpointと鍵素材は機微情報であり、障害調査のための可観測性が漏えい経路にならないようにするため。

重要な技術判断や仕様変更理由を、ADRに近い簡潔な形式で記録する。軽微な修正はここへ昇格させず、Git差分で確認する。

## 2026-08-01 Shopping item and template MVP policy

**Status:** Accepted for the current shopping model. The historical context below predates the now-implemented image/R2 scope; the current behavior is defined in `PROJECT_SPEC.md`.

### Context
The shopping phase needs a household-shared list and reusable templates. At the time of this decision, images, R2, categories, stores, and inventory were out of scope; image/R2 support was subsequently added without changing the item/template decisions.

### Decision
- Store item quantity as `TEXT | NULL`, not numeric/unit columns.
- Store item status as `pending` or `purchased`.
- Physically delete shopping items, including purchased-item clearing.
- Logically delete templates with `active = 0`.
- Repeated `purchase` returns the current purchased item and does not overwrite `purchased_by`.
- Any household member may `unpurchase` another member's purchased item for MVP.
- Adding from a template copies the template fields as-is into a new pending item. Overrides are deferred.

### Rationale
Household shopping quantities are often natural language (`1本`, `500ml`, `適量`), so splitting values now would add complexity without improving the MVP. Shopping items are operational and short-lived, while templates are reusable configuration. Idempotent purchase avoids mobile double-tap problems and prevents accidental purchaser overwrites.

### Consequences
There is no durable purchase history after item deletion or clearing. A future history/audit feature would require an event table or logical deletion for items. Template edits do not affect already-created items, which keeps list entries stable after copying.

## 2026-07-31 Task templates and records are separated

### Context
The task phase needs recurring household chores without pre-generating one row per day. Daily, weekday-based, and weekly tasks also need current state and actor history.

### Decision
Store the task definition once in `tasks`, keep scheduled weekdays in `task_weekdays`, and create `task_records` only when a user starts, completes, skips, or resets a target date/week.

`pending` is not stored in D1. The API derives it when no matching `task_records` row exists.

Weekly tasks use `target_week_start`. Completed weekly work is recorded one row per completion so the app can later show who did each count. Weekly `in_progress` and `skipped` are limited to one open row per task/week by a partial unique index.

### Consequences
- Today lists include `daily` and scheduled weekday tasks only.
- Weekly progress is computed from records in the selected week.
- Reset for weekly tasks currently clears the whole task/week scope.
- This preserves actor history for weekly counts, but fully serialized concurrent weekly completion still depends on D1 write ordering.

## 2026-07-31 Task state transition policy

### Decision
State changes are implemented in `TaskService`.

- `pending -> start`: creates `in_progress`.
- `pending -> complete`: creates `completed`.
- `pending -> skip`: creates `skipped`.
- Same user repeating `start` or `complete` returns the existing effective state.
- Another user cannot overwrite `in_progress`.
- Completed records are not overwritten by another user.
- `reset` removes the current date/week record scope and returns the task to derived `pending`.
- Inactive tasks reject state changes.

### Consequences
This favors preventing accidental overwrites over allowing aggressive collaboration. A future event-log table can preserve every transition if audit depth becomes important.

## 2026-07-31 Task date calculation uses explicit timezone formatting

### Decision
Use `worker/lib/date-time.ts` with `Intl.DateTimeFormat` and an explicit household timezone, initially `Asia/Tokyo`. Week boundaries use `households.week_starts_on`.

### Consequences
Cloudflare Workers runtime timezone does not affect target dates. Temporal or an external date library is not introduced for MVP.

## 2026-07-21 Workers Static AssetsでSPAとAPIを同居

### 背景

仕様書ではCloudflare PagesまたはWorkers Static Assetsを選択するとされている。初期段階では、React SPAとWorker APIを不要に分散させず、無料枠内で扱いやすい構成にしたい。

### 検討した選択肢

- Cloudflare Pages + Pages Functions
- Cloudflare Workers + Workers Static Assets
- フロントエンドとAPIを別サービスに分離

### 決定

Cloudflare Workers Static AssetsでReact SPAとWorker APIを同じWorkerにまとめる。

### 理由

- `wrangler.jsonc` で静的アセットとWorker APIを一体管理できる。
- `/api/*` のみWorkerを先に通し、それ以外はSPAとして扱いやすい。
- サービスを分散させず、初期MVPの運用が単純になる。

### 影響

- `dist/client` を静的アセットの出力先にする。
- Worker entryは `worker/index.ts` とする。
- Cloudflare上の実リソース作成後にD1/R2のIDやbucket名を調整する。

### 将来の見直し条件

- Pages固有のプレビューやデプロイ運用が必要になった場合。
- Workers Static Assetsの制限がMVP要件に合わないと判明した場合。

## 2026-07-21 Docker中心の開発環境を採用

### 背景

依頼ではローカルPCへNode.jsや依存関係を直接入れず、Dockerコンテナ内で開発できることが求められている。

### 検討した選択肢

- ホストNode.jsで直接開発
- Docker Composeのみ
- Docker Compose + Dev Container

### 決定

Docker Composeを標準とし、VS Code利用者向けにDev Containerも用意する。

### 理由

- ホスト側の前提をGit、Docker、Docker Compose、エディタに限定できる。
- `node_modules` をDocker volumeに保持できる。
- Codexの作業環境と利用者の作業環境を揃えやすい。

### 影響

- READMEとCodex指示書ではDocker内コマンドを標準にする。
- 依存関係インストール、Lint、型チェック、テスト、ビルドはコンテナ内で実行する。

### 将来の見直し条件

- CI環境やCloudflare公式テンプレートとの整合で構成変更が必要になった場合。

## 2026-07-21 Worker API基盤は小さな独自ルーターで開始

### 背景

今後、認証、家庭、タスク、買い物などのAPIが増えるため、`worker/index.ts` に処理を集中させない構成が必要になった。一方で、現段階のAPI数は少なく、大きなWebフレームワークを導入すると依存と学習コストが増える。

### 検討した選択肢

- `switch` ベースの小さな独自ルーター
- Hono
- その他のWorkers対応フレームワーク

### 決定

MVP初期は小さな独自ルーターで開始し、`worker/app.ts`、`routes`、`middleware`、`lib`、`repositories`、`services` に責務を分離する。

### 理由

- 現在のAPI規模では独自ルーターで十分に読みやすい。
- 追加依存なしでWorkerの起動とビルドを単純に保てる。
- 今後、パスパラメータやミドルウェアが増えて複雑化した場合にHonoへ移行しやすい構造にできる。

### 影響

- `GET /api/health`、`POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me` を同じレスポンス形式で扱う。
- APIバージョニングは導入せず、MVPでは `/api` プレフィックスに統一する。

### 将来の見直し条件

- 動的パス、ネストしたミドルウェア、ルート数が増えて `switch` が読みにくくなった場合。
- 型安全なルーティングやOpenAPI生成が必要になった場合。

## 2026-07-21 入力検証は追加依存なしの独自ユーティリティで開始

### 背景

全APIで入力検証を共通化する必要がある。ZodやValibotは型推論やエラー整形に強いが、現段階では検証対象が少なく、依存を増やすほどの複雑さではない。

### 検討した選択肢

- Zod
- Valibot
- 独自の小さなバリデーション関数

### 決定

MVP初期は独自の小さなバリデーション関数を採用する。

### 理由

- Cloudflare Workersで追加設定なしに動作する。
- 外部入力を `unknown` として受け、検証後に型付き入力へ変換できる。
- 日本語エラーメッセージを共通レスポンスへ直接変換しやすい。
- バンドルサイズと依存管理を増やさない。

### 影響

- 認証APIではJSON Body、必須項目、メール形式、文字列長、不要プロパティの扱いを検証する。
- 不要プロパティはMVPでは無視し、保存やレスポンスには含めない。

### 将来の見直し条件

- フォームやAPI入力が増え、スキーマ再利用や型推論の恩恵が大きくなった場合。
- フロントエンドとWorkerで同じスキーマを共有したくなった場合。

## 2026-07-21 パスワードハッシュはWeb Crypto PBKDF2-SHA-256を採用

### 背景

Cloudflare Workers上でパスワードを安全に保存するため、ソルト付きのパスワードハッシュ方式が必要になった。SHA-256単体は高速すぎるため採用しない。

### 検討した選択肢

- Web Crypto APIのPBKDF2
- Argon2系ライブラリ
- bcrypt系ライブラリ
- SHA-256単体

### 決定

MVP初期はWeb Crypto APIのPBKDF2-SHA-256を採用する。ハッシュ文字列は `pbkdf2-sha256$iterations$salt$hash` 形式で保存する。

### 理由

- Cloudflare Workers標準のWeb Crypto APIで動作する。
- WASMやNode互換APIへの依存を避けられる。
- ランダムソルトと十分な反復回数を使用できる。
- Vitest上でも技術検証できた。

### 影響

- 現在の反復回数は `120000` とする。
- 無料枠CPU時間と実運用の応答時間を見て、反復回数は後で調整する可能性がある。
- Argon2やbcryptは、Workersでの安定性、WASMサイズ、CPU時間を再評価するまで採用しない。

### 将来の見直し条件

- Workers上で保守性が高くCPU時間も現実的なArgon2id実装を採用できると確認できた場合。
- ログイン処理の実測でPBKDF2の反復回数調整が必要になった場合。

## 2026-07-21 セッションはCookieの生トークンとD1のトークンハッシュで管理

### 背景

ログイン状態を保持しつつ、DB流出時にセッションの生トークンを再利用されないようにする必要がある。

### 検討した選択肢

- D1に生セッショントークンを保存する
- D1にトークンハッシュのみ保存する
- JWTをCookieへ保存する

### 決定

ブラウザへはランダムな生トークンをHttpOnly Cookieで渡し、D1にはSHA-256ハッシュのみ保存する。

### 理由

- サーバー側でログアウトや期限切れ削除を管理できる。
- DBには生トークンを残さない。
- JWTの署名鍵管理や失効リストを持ち込まずに済む。

### 影響

- `sessions.token_hash` を追加する `migrations/0002_auth_foundation.sql` を作成した。
- Cookie名は `house_todo_session`、有効期限は30日、MVPでは期限延長なしとする。

### 将来の見直し条件

- セッションローテーション、端末一覧、強制ログアウトが必要になった場合。
- 高頻度アクセスによりセッション照会の負荷が問題になった場合。

## 2026-07-21 CSRFはSameSite LaxとJSON限定から開始

### 背景

HttpOnly Cookieで認証するため、CSRF対策方針を明確にする必要がある。

### 検討した選択肢

- SameSite=Laxのみ
- SameSite=Lax + JSON限定 + 同一オリジン前提
- CSRFトークン必須

### 決定

MVPの同一オリジン構成では、`SameSite=Lax`、状態変更APIのJSON限定、GETで状態変更しない方針から開始する。

### 理由

- React SPAとWorker APIを同一Worker・同一オリジンで提供する前提に合う。
- `application/json` 以外のBodyを共通バリデーションで拒否できる。
- 初期段階でCSRFトークン管理を過剰に持ち込まない。

### 影響

- 認証APIのPOSTは `Content-Type: application/json` を要求する。
- CORSは不要に広げない。

### 将来の見直し条件

- 別オリジンのフロントエンドを採用する場合。
- 公開範囲が広がり、より強いCSRF耐性が必要になった場合。
- 外部サイトからの誘導や連携APIが増えた場合。

## 2026-07-21 状態変更APIにOrigin検証を追加

### 背景

HttpOnly Cookie認証を使うため、SameSiteに加えて状態変更APIの送信元を確認する必要がある。

### 決定

`POST`、`PUT`、`PATCH`、`DELETE` では `Origin` ヘッダーを必須とし、`ALLOWED_ORIGINS` に含まれるOriginだけを許可する。Originなしの状態変更リクエストも拒否する。あわせて `Content-Type: application/json` を要求する。

### 理由

- Cookieが自動送信されるAPIのCSRF耐性を高められる。
- 許可Originを環境変数で明示できる。
- 将来multipart APIを追加する場合も、JSON APIとは別に扱える。

### 影響

- ローカル開発では `ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174,http://app:5173,http://web:5173` を使う。`http://app:5173` と `http://web:5173` はDocker Compose内のPlaywright E2EからVite dev serverへアクセスするための内部Origin。
- `curl` 等の手動確認でも状態変更APIには `Origin` と JSON Content-Type が必要になる。

## 2026-07-21 MVPの1ユーザー1家庭制限はService層で行う

### 背景

MVPでは1ユーザーにつき1家庭に制限してよいが、将来的には複数家庭へ拡張できる構造を残したい。

### 決定

DB上は `household_members(household_id, user_id)` の一意制約に留め、複数家庭所属を表現できるテーブル構造を維持する。MVPの1ユーザー1家庭制限はService層で `countByUserId` を確認して制御する。

### 理由

- 将来の複数家庭対応時にマイグレーションの破壊的変更を避けやすい。
- 所属関係を家庭IDとユーザーIDの組み合わせで自然に表現できる。

### 影響

- 同時実行時にService層チェックだけでは完全に二重所属を防げない可能性がある。
- MVP期間だけ `household_members(user_id)` の一意インデックスを追加する案は、将来拡張とのトレードオフが大きいため今回は採用しない。

## 2026-07-21 家庭未所属は200でhousehold nullを返す

### 背景

登録直後のユーザーはログイン済みだが、まだ家庭に参加していない正常な状態になりうる。

### 決定

`GET /api/households/current` は、家庭未所属の場合も200で `{ household: null }` を返す。

### 理由

- フロントエンドが家庭作成または招待参加へ誘導しやすい。
- 家庭未所属を認証エラーやリソース欠落ではなく、オンボーディング中の状態として扱える。

### 影響

- 家庭内データを必要とするAPIでは、別途 `requireCurrentHousehold` により未所属をエラーとして扱う。

## 2026-07-21 auth/meは家庭情報を含めない

### 背景

ログインユーザー情報と家庭情報を同時に返すと初期画面のリクエスト数は減るが、認証と家庭所属の責務が混ざる。

### 決定

`GET /api/auth/me` はユーザー情報のみを返し、家庭情報は `GET /api/households/current` で取得する。

### 理由

- 認証APIは「誰であるか」に集中できる。
- 家庭APIは「どの家庭に所属し、何ができるか」を扱える。
- 未所属、owner/member、将来の複数家庭対応を家庭API側に閉じ込めやすい。

### 影響

- 初期画面で必要に応じて2リクエストになる。
- 将来、初期表示の性能が問題になった場合はDashboard APIなどで集約を検討する。
## 2026-07-21 フロントエンド状態管理はReactローカル状態で開始

### 背景

今回の範囲は、認証確認、家庭所属確認、オンボーディング、仮ホーム、メンバー管理までに限定される。サーバー状態はまだ少なく、タスクや買い物のキャッシュ無効化も未実装である。

### 決定

TanStack Queryなどのサーバー状態管理ライブラリは導入せず、Reactの`useState`、`useEffect`、軽量な画面ルート判定で実装する。API呼び出しは`src/api/client.ts`に集約し、`credentials: "include"`、JSON処理、共通エラー化をそこで扱う。

### 理由

- 依存関係を増やさず、今回のユーザーフローを完結できる。
- APIとUIの責務を分けつつ、将来のタスク・買い物実装時に状態管理ライブラリへ移行しやすい。
- Cookie認証の扱いを画面コンポーネントへ分散させない。

### 影響

- 画面間のデータ再取得は明示的な関数呼び出しで行う。
- タスク、買い物、通知などでキャッシュやmutation管理が増えた段階で、TanStack Queryなどの導入を再検討する。
## 2026-07-31 Keep lightweight routing for task UI

### Context
The task frontend adds `/tasks`, `/tasks/new`, `/tasks/:taskId`, `/tasks/:taskId/edit`, and `/tasks/:taskId/respond`.

### Decision
Do not introduce React Router in this phase. Extend the existing lightweight routing parser with task dynamic paths.

### Rationale
The route set is still small, existing auth and household guards already work with the local routing model, and avoiding a new dependency keeps the MVP easier to verify. Revisit a router library when nested layouts, route loaders, or broader navigation complexity appears.
## 2026-08-04 Shopping UI uses explicit refresh instead of realtime sync

### Context
The shopping UI needs to show changes made by another household member, but the MVP explicitly does not require WebSocket, polling, notifications, or production Cloudflare changes.

### Decision
Use initial fetch, manual refresh, post-mutation refetch, and `visibilitychange` refetch for the shopping list. Keep state local to React components and continue the existing lightweight routing model.

### Consequences
Two users can share state by refreshing or returning focus to the shopping screen. The UI avoids extra infrastructure and background traffic. True realtime collaboration remains a later enhancement.

## 2026-08-04 Store shopping images in a separate D1 table

Use `shopping_item_images` with `UNIQUE(shopping_item_id)` and household/item indexes. Reuse the existing private `ATTACHMENTS` R2 binding with keys `households/{householdId}/shopping/{itemId}/{imageId}.webp`. This separates replaceable metadata from the shopping item and keeps one-image enforcement in D1. Replacement is new R2 object, D1 upsert, then old-object deletion; failed D1 updates remove the new object where possible. R2 and D1 are not transactional, so orphan cleanup remains a documented operational risk. Public URLs, CDN, production R2, and the 30-day Cron remain out of scope.

## 2026-08-04 Run Docker E2E serially against one local Worker

### Context

The Docker E2E suite uses one shared Vite app, Wrangler dev Worker, local D1, and local R2. The Playwright configuration already uses one worker and `fullyParallel: false`; parallel test execution would create avoidable shared-state and artifact races.

### Decision

Keep `workers: 1` and `fullyParallel: false`. Require app and Worker healthchecks before starting the E2E container. Wait for `/api/health` from each spec before registration, and place screenshots under spec-specific subdirectories when the shared `all-e2e` artifact root is used.

### Rationale and limitation

This removes startup races and screenshot overwrites without adding fixed sleeps or automatic retries. During validation, Wrangler 4.114.0 also exhibited an intermittent runtime/esbuild deadlock and exited with code 1; `--no-bundle` was tested but cannot resolve this TypeScript module graph in the current configuration, and the suggested Wrangler 4.118.0 update had a peer dependency conflict. The final run succeeded after a clean Worker restart, but the underlying Wrangler instability remains an environment/tooling risk.

## 2026-08-04 Queue failed R2 deletions instead of deleting referenced images

### Decision

Complete the major D1 mutation first, then attempt the R2 delete through one shared helper. If only R2 deletion fails, return the user operation as successful and enqueue the key for deletion after 30 days. The cleanup service must recheck `shopping_item_images.r2_key` immediately before deletion; any live reference wins over the queue and removes the queue record without touching R2. Missing R2 objects are successful cleanup, retry delays are 1/3/7/14 days, and the fifth failure is retained as `abandoned`.

### Consequences

This prioritizes preventing deletion of a valid image over complete orphan recovery. A queue-registration failure after a successful D1 mutation is logged as a structural consistency risk and remains an operational follow-up; no public cleanup endpoint or production Cron registration is added.

## 2026-08-14 新task modelはdeadlineとnotification offsetを分離する

**Status:** Accepted — planned, not implemented

次期task modelではdeadlineをtask occurrence/periodの属性、通知をdeadlineからのpreset offsetとして別概念にする。`notification_offset_minutes` は `NULL`, `0`, `5`, `10`, `30`, `60`, `120` のいずれかとし、deadlineがないtaskはtime-based overdue/reminderを持たない。

## 2026-08-14 flexible recurrenceはperiod modelとする

**Status:** Accepted — planned, not implemented

`weekly_flexible` と `monthly_flexible` は日付occurrenceの集合ではなくdeadlineで閉じるperiodとして扱う。最低1回のcompletedで達成し、同periodの追加completeは複数recordとして保存する。将来occurrence/recordをpre-generateしない。

## 2026-08-14 month-end semanticを保持する

**Status:** Accepted — planned, not implemented

monthly flexibleのdefaultは `month_end` semanticを保存し、表示時に月の実際の末日へresolveする。`day_of_month` の存在しない月は末日にclampする。

## 2026-08-14 shared task date/deadlineはhousehold timezone基準とする

**Status:** Accepted — planned, not implemented

recurrence、calendar、deadline、notification_atはhousehold timezoneで解決し、recipientごとにshared deadline instantを変更しない。evening summaryの表示・送信時刻は既存のuser notification setting timezoneを維持する。

詳細なfield、period key、migration/API影響、未解決事項は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) に記載する。

## 2026-08-14 Phase 1はlegacy recurrenceを保持してcanonical model列を追加する

**Status:** Accepted — Phase 1 implementation

現行scheduler/UIの互換性を守るため、Phase 1 migrationでは既存 `tasks.recurrence_type` の値を置換しない。`model_recurrence_type` を追加して、daily/scheduledとtarget count 1のweeklyだけを安全にcanonical mappingする。weekly target countが2以上のtaskはNULLのmanual-review状態として残し、start_dateも既存行へ推測値をbackfillしない。旧列の置換・削除は後続phaseの別migrationとする。

## 2026-08-04 Prepare staging before production

Use a Wrangler `staging` environment before production. Keep staging and production D1/R2 resources separate, use workers.dev for the first staging deployment, keep R2 private and serve images through the Worker API, and manage secrets per environment only when a real secret is required. Apply Cron only after HTTP/API and manual Scheduled checks. `APP_ENV=staging` is a secure-cookie environment; only local development omits `Secure`. Production remains documentation-only until staging is accepted.

## 2026-08-14 Phase 2 task API compatibility boundary

Phase 2 accepts canonical `modelRecurrenceType` values while retaining legacy request fields. `daily`, `weekly_fixed`, and `weekly_flexible` map to legacy `daily`, `scheduled`, and `weekly`; `once` and monthly types use `model_only` so legacy today/week and scheduler code cannot misclassify them. PATCH merges omitted fields and atomically replaces weekday/config state. Only deadline plus offset zero mirrors to `notification_time`; positive offsets remain outside the legacy scheduler.

## 2026-08-14 Canonical reminders use stable task scope keys

Tasks with `model_recurrence_type` use the shared occurrence/period projector to resolve a household-local deadline, subtract `notification_offset_minutes`, and store `task:{occurrence_key|period_key}` in `notification_deliveries.target_key`. They never also enter the legacy `notification_time` path. Tasks without a canonical model retain the legacy scheduler, preserving weekly target counts greater than one. Existing delivery windows, sent deduplication, pending claim leases, failure release, and retry behavior remain unchanged.

## 2026-08-14 Recent task reuse and task templates are separate

**Status:** Accepted — Phase 6 local implementation

「最近使ったタスク」は実行履歴ではない。activeかつcanonicalな既存task definitionを`created_at DESC`で取得し、最大8件をcreate formのprefill候補として表示する。候補を選択しても即作成しない。taskごとに1件を表示し、recent専用tableやhash dedupは追加しない。legacy weekly target count > 1、inactive task、他householdのtaskは候補から除外する。

Recent/templateからコピーするのはname、note、canonical recurrence設定、deadline/reminder、assignmentである。task ID、household ID、task records、occurrence/period key、execution history、status、created/updated timestamps、startDateはコピーしない。onceのtargetDateもコピーせず、missing specific assigneeは別memberへ置換せず再選択を要求する。

明示的に保存するテンプレートはactive taskとは別の`task_templates` tableに置く。canonical six recurrence typesの設定だけを保存し、startDate、once targetDate、task_records、completion stateを持たせない。household memberだけが同一householdのtemplateをlist/create/edit/deactivateでき、deactivateは`active = 0`とする。templateはHome、Calendar、Dashboard、scheduler、action対象へ投影しない。`0013_task_templates.sql`はadditiveであり、既存tasks/task_recordsを変更しない。

## 2026-08-14 Shopping recent reuse uses existing items with normalized-name deduplication

**Status:** Accepted — Shopping UX Phase 1 implementation

Shopping recent candidates are read from existing `shopping_items`; no recent table or migration is introduced. Household authorization is applied through the existing `HouseholdService`. Pending and purchased items are both eligible because a purchased product can be bought again. Candidates are ordered by `created_at DESC` with an `id DESC` tie-breaker, deduplicated by `lower(trim(name))`, and capped at eight. The newest row supplies the reusable quantity/note configuration when those differ between purchases.

The recent API returns only `name`, `quantity`, `note`, and `createdAt`. The create form copies only those user-editable fields. Item identity, purchased state, purchaser, purchase time, execution/history data, and image metadata are never copied. Selection is always prefill → edit → save; it never creates an item immediately.

## 2026-08-14 Shopping image picker separates camera and library inputs

**Status:** Accepted — Shopping UX Phase 1 implementation

The Shopping form exposes a camera input using the supported image types plus `capture="environment"`, and a library/file input with the same accepted types and no `capture` attribute. Both feed one validation, compression, preview, remove, and upload handler. Browser/OS picker behavior is not guaranteed to be identical across iOS, Android, and desktop. Existing D1/R2 attachment storage, limits, and cleanup behavior remain unchanged.

## 2026-08-14 Shopping templates keep existing immediate-add semantics and gain new-form prefill

**Status:** Accepted — Shopping UX Phase 1 implementation

Existing Shopping template list, CRUD, household authorization, and `/api/shopping/templates/:id/add` behavior remain compatible. The Shopping new form additionally lists active templates as prefill candidates so users can edit before saving, matching the Task form family resemblance without changing shared-household scope or copying images.

## 2026-08-18 Shopping planned dates are local instance data projected through the existing Calendar API

**Status:** Accepted — local implementation

Add nullable `shopping_items.planned_purchase_date` through an additive migration and store it as a validated `YYYY-MM-DD` household-local date. Do not rebuild the table or convert the value to a UTC timestamp. Purchase and unpurchase mutations preserve it; explicit PATCH `null` clears it.

Extend `GET /api/tasks/calendar` additively instead of introducing a second Calendar endpoint or performing client-side filtering. Query only the requested household/date range and return minimal Shopping summaries, with separate Shopping marker counts and a separate selected-date `買うもの` section. Include pending and purchased items, but exclude attachments.

Treat the date as shopping-instance-specific data. Recent and Template prefill must not copy it, and Shopping templates do not persist it. The field has no Push, Cron, scheduler, or Task overdue semantics in this phase.
