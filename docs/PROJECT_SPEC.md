# 家庭用Todoアプリ 開発引き継ぎ仕様書

## 2026-08-01 Shopping backend foundation update

The backend now supports the MVP shopping-list foundation:

- Household-scoped shopping item CRUD at `/api/shopping/items`.
- Item fields: `name`, `quantity`, `note`, `status`, `added_by`, `purchased_by`, `purchased_at`, `sort_order`.
- `quantity` is stored as nullable text to support values such as `1本`, `500ml`, and `適量`.
- Item status is `pending` or `purchased`; purchasing records the acting user and timestamp.
- Repeated purchase calls are idempotent and do not overwrite an existing purchaser.
- Household members may unpurchase items, delete items, and clear purchased items.
- Shopping templates are separate records with `active` logical deletion.
- Template add copies the current template fields into a new pending item. Later template edits do not update existing items.
- `GET /api/dashboard/today` includes shopping pending count and up to three pending preview items.

Not included in this phase: complete shopping UI, images, R2, barcode scanning, price/store/category/inventory management, notifications, production Cloudflare resources, deployment, custom domain, and push.

## 2026-07-31 Task backend MVP update

The backend now supports the core task-management model for MVP:

- Task template creation, listing, detail, update, and logical delete.
- Recurrence types: `daily`, `scheduled`, `weekly`.
- Assignment types: `anyone`, `specific`; specific assignees must be members of the same household.
- Optional `scheduled_time` in `HH:mm`.
- Notification slot values: `morning`, `night`, `none`.
- Task record states: `in_progress`, `completed`, `skipped`.
- `pending` is not stored. It is derived when no record exists for the target date/week.
- Today target calculation includes daily tasks and scheduled tasks for the target weekday.
- Weekly task progress uses the household `week_starts_on` setting and explicit `Asia/Tokyo` date calculation.
- Home aggregation is available from `GET /api/dashboard/today`.

Not included in this phase: complete task-management screens, drag sorting, duplication, images, R2, shopping list work, PWA completion, Web Push, Cron notifications, production Cloudflare resources, production deployment, custom domain, rankings, and detailed chore analytics.

## 1. このドキュメントの目的

本ドキュメントは、家庭内で共有して使用するTodo・家事管理Webアプリの設計、技術構成、画面構成、デザイン方針をまとめたものである。

今後の実装作業はCodexを中心に進める想定であり、本ドキュメントをプロジェクト全体の基本仕様として扱う。

実装前に本ドキュメント全体を確認し、既存コード、現在の進捗、未実装項目との整合性を取ること。

画面デザインの参考として、リポジトリ内に画面ラフ画像を配置する。

想定ファイル例:

```text
docs/images/household-todo-screen-rough.png
```

実装時は、この画面ラフの雰囲気、情報配置、操作導線を参考にすること。

ただし、ラフ画像をそのまま忠実に再現することを目的とはしない。

以下を優先すること。

* iPhoneで使いやすいこと
* 家事の状態が一目で分かること
* 誰が対応したかが分かること
* 操作回数が少ないこと
* 通知から素早く完了報告できること
* 家庭内で継続して使いやすいこと
* 将来的にポートフォリオとして公開できる品質にすること

---

# 2. アプリ概要

## 2.1 仮称

```text
おうちTodo
```

名称は仮称であり、コード内で固定しすぎないこと。

画面表示名やメタデータは、後から変更しやすいように一か所で管理する。

例:

```ts
export const APP_NAME = "おうちTodo";
```

---

## 2.2 解決したい課題

同棲している二人の間で、以下のような認識のずれが発生している。

* 今日インコのご飯を交換したか分からない
* どちらが家事をしたか分からない
* 相手が今から作業しようとしているか分からない
* 毎日行う家事を忘れる
* 一週間のどこかで行えばよい家事を忘れる
* 買うべきものを共有できない
* 商品名だけでは伝わらない場合に写真やメモを共有したい
* 今日の家事がどのくらい残っているか分かりにくい

このアプリでは、家庭内タスクを共有し、実行状況と履歴を見える化する。

---

## 2.3 主な利用者

初期利用者は同棲中の二人を想定する。

ただし、データ構造や画面は可能な範囲で複数人に拡張できるようにする。

初期版では以下を想定する。

```text
1家庭あたり2人
```

将来的には、家族、ルームシェア、3人以上の世帯でも利用できる可能性を残す。

---

## 2.4 利用端末

主な利用端末はiPhone。

以下の利用方法を想定する。

* Safariでアクセス
* ホーム画面に追加
* PWAとして起動
* Web Push通知を受信
* 通知をタップして対象画面を開く
* タスクを完了、対応中、パスに変更する

PCブラウザでも最低限操作できるレスポンシブ設計にする。

ただし、UI設計はモバイルファーストとする。

---

# 3. 技術構成

## 3.1 基本方針

本アプリは、完全無料枠内での運用を目標とする。

Firebaseではなく、Cloudflareを中心とした構成を採用する。

独自ドメインは初期段階では使用しない。

Cloudflareが提供する無料URLを使用する。

想定URL:

```text
https://<project-name>.pages.dev
```

またはWorkersのカスタム開発URL。

独自ドメインは、MVP完成後や一般公開時に必要性を再検討する。

---

## 3.2 採用技術

| 用途      | 採用技術                                     |
| ------- | ---------------------------------------- |
| フロントエンド | React                                    |
| 言語      | TypeScript                               |
| ビルド     | Vite                                     |
| スタイリング  | CSS Modules、Tailwind CSS、または通常CSS        |
| PWA     | Web App Manifest、Service Worker          |
| API     | Cloudflare Workers                       |
| データベース  | Cloudflare D1                            |
| 画像保存    | Cloudflare R2                            |
| 定時実行    | Cloudflare Workers Cron Triggers         |
| 通知      | Web Push、VAPID                           |
| 認証      | Worker側でのセッション管理                         |
| 公開      | Cloudflare PagesまたはWorkers Static Assets |
| CLI     | Wrangler                                 |
| テスト     | Vitestなど                                 |
| E2E     | 必要に応じてPlaywright                         |

既存リポジトリの構成やCloudflareの最新推奨構成に合わせて、Cloudflare PagesまたはWorkers Static Assetsを選択する。

不要にサービスを分散させないこと。

---

## 3.3 Cloudflareリソース

最低限、以下を使用する。

```text
Cloudflare Workers
Cloudflare D1
Cloudflare R2
Cron Triggers
```

必要に応じて以下を利用する。

```text
Workers Static Assets
Cloudflare Pages
Cloudflare Turnstile
```

Cloudflare Turnstileは、公開ログイン画面への不正アクセスやボット対策が必要になった場合に検討する。

MVPでは必須ではない。

---

## 3.4 完全無料運用の前提

家庭内の2人利用を想定し、以下の制限を設ける。

* 1家庭あたりの利用者数を少数に限定
* 通知は朝と夜の1日2回を基本とする
* 画像はアップロード前に圧縮
* 画像は原則30日後に自動削除
* 1項目につき画像1枚
* 圧縮後の画像サイズは最大1MB
* ゲストモードではR2へ画像を保存しない
* 不要なAPIポーリングを行わない
* リアルタイム同期は必要最小限とする
* タスク数や買い物項目数に常識的な上限を設ける

無料枠の変更に備え、Cloudflareの利用量を定期的に確認できる構成にする。

---

# 4. システム全体構成

```text
iPhone / PCブラウザ
        │
        │ HTTPS
        ▼
React + TypeScript PWA
        │
        │ fetch
        ▼
Cloudflare Worker API
        │
        ├── Cloudflare D1
        │     ├── ユーザー
        │     ├── 家庭
        │     ├── タスク
        │     ├── 完了履歴
        │     ├── 買い物リスト
        │     ├── 通知購読
        │     └── セッション
        │
        ├── Cloudflare R2
        │     └── 添付画像
        │
        └── Cron Trigger
              ├── タスク単位の指定時刻通知
              ├── ユーザー単位の夜まとめ通知
              └── 期限切れレコード整理
```

---

# 5. 認証と家庭グループ

## 5.1 ログイン画面

ログイン画面では以下を提供する。

* ログイン
* 新規登録
* ゲストとして試す
* 利用規約
* プライバシーポリシー

一度ログインした端末では、ログイン状態を保持する。

セッションはCookieで管理する。

推奨属性:

```text
HttpOnly
Secure
SameSite=Lax
```

セッションIDをlocalStorageだけに保存しないこと。

---

## 5.2 新規登録

初期版では、以下のいずれかを採用する。

* メールアドレスとパスワード
* ユーザー名とパスワード
* 家庭招待コードと表示名

一般公開を意識するなら、メールアドレスとパスワードが望ましい。

パスワードは平文保存しない。

安全なハッシュ化方式を利用する。

認証方式は、実装前にCloudflare Workers環境で利用しやすい方法を選定する。

---

## 5.3 家庭グループ

ユーザーは、1つ以上の家庭グループに所属できる可能性を残す。

ただしMVPでは、1ユーザーにつき1家庭でもよい。

家庭グループは以下を持つ。

```text
家庭ID
家庭名
作成者
作成日時
週の開始曜日
タイムゾーン
```

初期タイムゾーン:

```text
Asia/Tokyo
```

初期の週開始曜日:

```text
月曜日
```

---

## 5.4 メンバー招待

家庭作成者は、別のユーザーを家庭に招待できる。

招待方法:

* 招待コード
* 招待リンク

招待コードは推測されにくく、期限を持たせてもよい。

例:

```text
有効期限: 24時間
使用可能回数: 1回
```

MVPでは、有効期限なしの招待コードでもよいが、将来的に改善できる構造にする。

実装上のMVP方針:

```text
有効期限: 24時間
使用回数: 1回
保存方式: D1には招待コードのSHA-256ハッシュのみ保存
発行権限: ownerのみ
参加時権限: member
```

平文の招待コードは作成直後のレスポンスでのみ返し、ログやD1には保存しない。

---

## 5.5 メンバー情報

メンバーは以下の情報を持つ。

```text
表示名
アイコン
テーマカラー
家庭内の権限
参加日時
```

初期の権限:

```text
owner
member
```

---

# 6. ゲストモード

## 6.1 目的

ゲストモードは以下の目的で提供する。

* 未登録ユーザーが機能を試す
* ポートフォリオとして公開する
* UIや操作感を確認してもらう
* サンプルタスクを操作できるようにする

---

## 6.2 ゲストデータ

ゲストは実際の家庭データへアクセスできない。

完全に独立したサンプルデータを使用する。

例:

```text
インコの朝ご飯
インコの水替え
ゴミ出し
洗濯物をたたむ
お風呂掃除
トイレ掃除
牛乳
卵
インコのえさ
トイレットペーパー
```

---

## 6.3 ゲストで可能な操作

* サンプルタスク一覧を見る
* 完了を押す
* 対応中を押す
* パスを押す
* 買い物リストへ追加する
* 購入済みにする
* サンプルテンプレートから追加する

---

## 6.4 ゲストで不可とする操作

* 実家庭データの閲覧
* 通知購読
* メンバー招待
* R2への画像保存
* アカウント設定変更
* 永続的な履歴保存

ゲスト操作は以下のどちらかとする。

* ブラウザ内の一時状態
* セッション単位の一時データ

ページ再読み込み時に初期状態へ戻ってもよい。

---

## 6.5 ゲスト表示

画面上に以下を明示する。

```text
ゲストモード

表示中のデータはサンプルです。
操作内容は実際の家庭には反映されません。
```

---

# 7. タスク機能

## 7.1 タスク分類

ユーザー向けの分類は以下とする。

```text
毎日のタスク
曜日指定タスク
今週中のタスク
```

内部的には以下のような種別を持たせる。

```ts
type TaskRecurrenceType =
  | "daily"
  | "scheduled"
  | "weekly"
  | "once";
```

### daily

毎日発生するタスク。

例:

```text
インコの朝ご飯
インコの夜ご飯
インコの水替え
```

### scheduled

指定曜日に発生するタスク。

例:

```text
月曜日と木曜日のゴミ出し
毎週日曜日のシーツ交換
```

### weekly

一週間のうち、どこかで指定回数を実施すればよいタスク。

例:

```text
トイレ掃除を週1回
床掃除を週2回
```

MVPでは週1回だけでもよい。

### once

一度だけ実施するタスク。

例:

```text
エアコンのフィルターを掃除する
```

---

## 7.2 タスク基本項目

タスクテンプレートは以下を持つ。

```text
タスクID
家庭ID
タイトル
説明
メモ
種別
担当者
通知枠
予定時刻
対象曜日
週内必要回数
有効状態
並び順
作成者
作成日時
更新日時
```

---

## 7.3 担当者

以下を選択できる。

```text
自分
特定のメンバー
どちらでも
全員
未定
```

MVPでは以下に絞ってよい。

```text
自分
相手
どちらでも
```

「どちらでも」の場合、どちらかが「今からやる」を押せる。

---

## 7.4 タスク状態

各タスクの当日または当週の状態として、以下を扱う。

```ts
type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";
```

画面表示:

| 内部値         | 表示  |
| ----------- | --- |
| pending     | 未完了 |
| in_progress | 対応中 |
| completed   | 完了  |
| skipped     | パス  |

---

## 7.5 今からやる

「どちらでも」のタスクで重複対応を防ぐために提供する。

「今からやる」を押した場合、以下を記録する。

```text
対応者
対応開始日時
```

他のメンバーには以下のように表示する。

```text
○○さんが対応中
```

対応中状態は解除できるようにする。

---

## 7.6 完了

完了時に以下を記録する。

```text
対象日または対象週
完了者
完了日時
メモ
画像
```

完了後も、間違えて押した場合に備えて完了取り消しを可能にする。

完了取り消し時には、履歴を削除するか取消履歴を残すかを決める。

MVPでは該当完了レコードを削除してよい。

---

## 7.7 パス

その日は実施しない場合に使用する。

例:

```text
今日は不要
外出している
まだ交換する必要がない
```

パス理由は任意入力とする。

MVPでは理由なしでもよい。

パスは完了とは別に集計する。

---

## 7.8 タスクの予定時間

タスクは、予定時刻あり・なしを選択できる。

```ts
type NotificationSlot =
  | "morning"
  | "night"
  | "none";
```

予定時刻例:

```text
07:00
09:00
21:00
```

通知処理を簡略化するため、MVPでは通知枠を中心に扱う。

* 朝
* 夜
* 通知なし

画面上では、必要に応じて具体的な予定時刻も表示する。

---

## 7.9 曜日指定

曜日指定タスクでは複数曜日を選択できる。

```ts
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
```

曜日番号の定義はプロジェクト内で統一する。

例:

```text
0 = 日曜日
1 = 月曜日
2 = 火曜日
3 = 水曜日
4 = 木曜日
5 = 金曜日
6 = 土曜日
```

UIでは日本語曜日を表示する。

---

## 7.10 今週中のタスク

一週間の開始と終了は家庭設定に依存する。

初期設定:

```text
月曜日 00:00から日曜日 23:59
```

完了回数を週単位で管理する。

例:

```text
トイレ掃除
週1回
今週 0 / 1回
```

将来的には週2回以上に対応できる設計にする。

---

# 8. 完了履歴

## 8.1 保存内容

完了履歴は以下を記録する。

```text
履歴ID
家庭ID
タスクID
対象日
対象週
状態
実行者
対応開始日時
完了日時
パス日時
メモ
添付画像ID
作成日時
更新日時
```

---

## 8.2 履歴の用途

* 今日誰が家事をしたか確認
* インコのご飯を交換したか確認
* 過去の対応日時を確認
* タスク詳細画面に最近の履歴を表示
* 将来的に担当回数を集計
* どちらかに家事が偏っていないか確認

---

## 8.3 集計機能

担当回数の集計はMVP必須ではない。

将来的に以下を検討する。

```text
今週の完了数
今月の完了数
メンバー別の完了数
タスク別の実施回数
```

ポイントやランキング形式にはしない。

家事負担を競争化しないデザインを優先する。

---

# 9. 買い物リスト

## 9.1 基本機能

買い物リストでは以下を提供する。

* 自由入力
* テンプレートから追加
* 数量入力
* メモ入力
* 写真添付
* 購入済み
* 購入済みの折りたたみ
* 項目削除
* 購入済み一括削除

---

## 9.2 買い物項目

```text
買い物項目ID
家庭ID
商品名
数量
単位
カテゴリ
メモ
添付画像ID
追加者
購入済み
購入者
追加日時
購入日時
並び順
```

---

## 9.3 買い物テンプレート

よく購入する商品をテンプレートとして登録する。

例:

```text
牛乳
卵
食パン
インコのえさ
トイレットペーパー
洗剤
```

テンプレートをタップすると、買い物リストへ追加する。

テンプレートには以下を持たせる。

```text
商品名
既定数量
単位
カテゴリ
既定メモ
```

---

## 9.4 重複追加

同じ商品が未購入リストに存在する場合、重複登録を防ぐ。

例:

```text
「牛乳」はすでに買い物リストにあります。
```

次の操作を選べるようにしてもよい。

```text
数量を増やす
そのまま追加
キャンセル
```

MVPでは単純に追加を拒否してよい。

---

## 9.5 購入済み

購入済み項目は一覧下部へ移動する。

初期状態では折りたたんでよい。

購入済みを解除できるようにする。

購入済み項目を一括削除できるようにする。

---

# 10. メモ機能

## 10.1 メモを持てる対象

以下にメモを設定できる。

* タスクテンプレート
* タスク完了記録
* 買い物項目
* 一時的な家庭内メモ

一時的な家庭内メモ機能は、MVP後でもよい。

---

## 10.2 メモ例

```text
えさ入れを洗ってから新しいご飯に交換する
お水も一緒に替える
この商品ではなく青いパッケージを買う
サイズはM
```

---

# 11. 画像添付

## 11.1 保存先

画像はCloudflare R2へ保存する。

D1には画像本体を保存しない。

D1にはメタデータのみ保存する。

---

## 11.2 添付可能対象

MVPでは以下に限定する。

* 買い物項目
* タスク完了記録
* メモ

タスクテンプレートへの恒久画像添付はMVP後でもよい。

---

## 11.3 画像制限

```text
1項目につき1枚
元画像最大10MB
圧縮後最大1MB
長辺1280px程度
WebP形式
品質0.7から0.8程度
保存期間30日
```

アップロード前にブラウザで圧縮する。

元画像は保存しない。

Canvas等で再エンコードし、位置情報などのメタデータを除去する。

---

## 11.4 自動削除

R2のLifecycle Ruleを使用し、画像を30日後に自動削除する。

オブジェクトキー例:

```text
attachments/{householdId}/{yyyy-mm}/{uuid}.webp
```

D1には以下を保存する。

```text
画像ID
家庭ID
関連種別
関連ID
R2オブジェクトキー
MIMEタイプ
ファイルサイズ
アップロード者
アップロード日時
有効期限
```

R2の実ファイル削除後、D1の期限切れレコードをCronで削除する。

---

## 11.5 画像表示

R2バケットは公開しない。

画像取得は認証済みWorker APIを経由する。

```text
GET /api/attachments/:attachmentId
```

APIでは以下を確認する。

* ログイン済みか
* 対象家庭のメンバーか
* 画像が期限切れでないか
* R2上に実ファイルが存在するか

画像が削除済みの場合は、画面上で以下を表示する。

```text
添付画像は保存期限を過ぎたため削除されました。
```

---

## 11.6 ゲスト画像

ゲストモードでは、実際にアップロードされた画像を表示しない。

固定のサンプル画像をリポジトリ内に配置する。

ゲストが画像を選択した場合、ブラウザ内の一時プレビューだけにするか、画像添付操作自体を無効にする。

---

# 12. 通知

## 12.1 通知方式

Web PushとVAPIDを使用する。

iPhoneでは、ホーム画面に追加されたPWAから通知許可を取得する。

iOS 16.4以降を対象とする。

---

## 12.2 通知時刻

個別タスク通知は、タスクごとに「通知なし」または指定時刻を設定する。notification timeは家庭内で共有するタスク設定とする。

夜まとめ通知は個別タスク通知とは別のユーザー設定とし、ON/OFF、時刻、タイムゾーンを持つ。既定値の候補はON、21:00、`Asia/Tokyo`だが、最終決定は設定実装マイルストーンで行う。

サーバー側のスケジュール実行では、保存されたタイムゾーンを基準に各設定時刻をUTCへ変換する。

---

## 12.3 通知対象

原則として、未完了タスクがある場合だけ通知する。

個別タスク通知:

* 指定時刻になったタスク
* 家庭でPush通知を有効にしているメンバーを通知対象とする

夜まとめ通知:

* その時点で今日の未完了タスクが1件以上ある場合だけ送る
* 未完了タスクが0件の場合は送らない
* MVPでは通知対象者をタスクごとに指定しない

---

## 12.4 通知文

個別タスク通知の例:

```text
インコの餌交換の時間です

タップして確認
```

夜まとめ通知の例:

```text
今日の家事が3件残っています

・インコの夜ご飯
・食器の片付け
・お風呂掃除

タップして確認
```

---

## 12.5 通知タップ

通知上に完了・パスのボタンは置かない。

iPhoneのPWA Web Pushでは、通知アクションボタンを前提にしない。

通知をタップすると、対象画面へ遷移する。

例:

```text
/tasks/respond?date=2026-07-21&slot=night
```

個別タスク通知の場合:

```text
/tasks/:taskId/respond?date=2026-07-21
```

MVPでは複数タスクをまとめて通知し、今日画面または回答画面へ遷移させる。

---

## 12.6 回答画面

通知から開いた画面では、操作を最小限にする。

表示内容:

```text
タスク名
予定
担当
メモ
画像
完了
今からやる
パス
```

通常の一覧画面を経由せず、直接回答できる導線にする。

---

## 12.7 通知設定

ユーザー単位または端末単位で以下を設定できる。

```text
通知有効・無効
夜まとめ通知 ON/OFF
夜まとめ通知時刻
タイムゾーン
この端末の購読状態
テスト通知
購読解除
```

タスクの通知時刻はタスク設定として家庭内で共有する。夜まとめ通知の設定はユーザー単位で持つ。

---

## 12.8 Push購読

Push購読情報は端末単位で保存する。

同じユーザーが複数端末を利用できるようにする。

保存項目:

```text
購読ID
家庭ID
ユーザーID
endpoint
p256dh
auth
端末名
作成日時
最終成功日時
```

Push送信時に410や404が返った購読は無効化または削除する。

---

## 12.9 二重通知防止

通知ログを保存する。

```text
家庭ID
対象日
通知枠
送信状態
送信日時
```

一意制約例:

```text
household_id
target_date
notification_slot
```

Cron再実行時に二重送信しないようにする。

---

# 13. 画面構成

## 13.1 画面一覧

| 画面        | 用途            |
| --------- | ------------- |
| ログイン      | ログイン、新規登録、ゲスト |
| 家庭作成      | 新しい家庭を作成      |
| 家庭参加      | 招待コードで参加      |
| ホーム       | 今日と今週の状態を確認   |
| タスク一覧     | タスクテンプレートの管理  |
| タスク作成・編集  | 繰り返し、担当、時間設定  |
| タスク詳細     | メモ、履歴、画像を確認   |
| タスク回答     | 完了、対応中、パス     |
| 買い物リスト    | 未購入、購入済みを管理   |
| 買い物項目編集   | 数量、メモ、画像      |
| 買い物テンプレート | 定番商品を管理       |
| 履歴        | 過去の実施履歴       |
| 通知設定      | Push通知の設定     |
| メンバー管理    | 家庭メンバー、招待     |
| 設定        | アプリ全体の設定      |
| ゲスト説明     | ゲストで可能な操作を説明  |

---

## 13.2 ボトムナビゲーション

ログイン後の主要画面では、下部に4タブを表示する。

```text
ホーム
タスク
買い物
設定
```

必要に応じて履歴はホームまたはタスク画面から遷移する。

タブを5個以上に増やさない。

---

# 14. 各画面の詳細

## 14.1 ログイン画面

### 表示要素

```text
アプリ名
キャッチコピー
ログインボタン
新規登録ボタン
ゲストで試すボタン
ログイン保持の説明
利用規約
プライバシーポリシー
```

### デザイン

* やさしい背景
* 家、植物、インコなどのイラスト
* メインボタンはミントまたはティール
* ゲストは控えめなサブボタン
* 情報量を増やしすぎない

---

## 14.2 ホーム画面

ホーム画面は最も重要な画面。

ユーザーがアプリを開いたとき、次を一目で確認できること。

```text
今日何件残っているか
今すぐやるべきこと
誰が何を対応したか
今週の進捗
買い物の未購入件数
```

### 上部

```text
日付
家庭名
通知アイコン
メンバー
今日の未完了数
```

### 今やること

時刻を過ぎている未完了タスク、または優先度の高いタスクを表示する。

例:

```text
インコのごはんを交換
通知設定に応じた指定時刻
未完了
```

### 今日のタスク

状態ごとに表示する。

```text
未完了
対応中
完了
パス
```

担当者や完了者も表示する。

### 今週のタスク

進捗を表示する。

例:

```text
2 / 5件完了
```

プログレスバーを使用する。

### 買い物リスト

未購入件数と一部商品を表示する。

詳細は買い物タブへ遷移する。

---

## 14.3 タスク一覧画面

タスクテンプレートを分類して表示する。

```text
毎日のタスク
曜日指定タスク
今週中のタスク
一度だけのタスク
無効なタスク
```

各タスクに以下を表示する。

```text
タイトル
担当
繰り返し
通知枠
有効・無効
```

操作:

```text
新規作成
編集
無効化
削除
複製
並び替え
```

複製はMVP後でもよい。

---

## 14.4 タスク作成・編集画面

入力項目:

```text
タイトル
説明
タスク種別
対象曜日
必要回数
担当者
時刻あり・なし
通知枠
通知対象
有効・無効
```

入力内容に応じてフォームを切り替える。

例:

* dailyでは曜日選択不要
* scheduledでは曜日選択を表示
* weeklyでは週内必要回数を表示
* onceでは対象日を表示

---

## 14.5 タスク詳細・回答画面

通知タップ後の主要画面。

### 表示

```text
タスク名
タスクアイコン
繰り返し情報
予定時間
担当
説明
メモ
写真
最近の履歴
```

### ボタン

```text
完了しました
今からやります
パスする
```

完了後は以下を表示する。

```text
○○さんが21:02に完了しました
```

自分が完了した場合は完了取り消しを可能にする。

---

## 14.6 買い物リスト画面

### 上部

```text
商品追加入力
テンプレートから追加
```

### テンプレート

チップ形式で表示する。

例:

```text
牛乳
卵
食パン
インコのえさ
トイレットペーパー
```

### 未購入

各項目に以下を表示する。

```text
チェックボックス
商品名
数量
メモ
画像サムネイル
追加者
メニュー
```

### 購入済み

画面下部に折りたたみ表示する。

```text
購入済み（2）
```

一括削除を提供する。

---

## 14.7 設定画面

カード形式で以下を表示する。

```text
通知設定
メンバー管理
タスクテンプレート
買い物テンプレート
週の開始曜日
ゲストモードについて
アプリ情報
ログアウト
```

### 通知設定カード

```text
夜まとめ通知 ON/OFF
夜まとめ通知時刻
タイムゾーン
通知状態
テスト通知を送る
```

### メンバー管理カード

```text
現在のメンバー
招待コードを発行
招待リンクを共有
```

### PWA案内

```text
ホーム画面に追加して、アプリのように使えます。
```

---

# 15. デザイン方針

## 15.1 ベンチマーク

デザインのベンチマークは、ファミリーバンクのような、家族向け・生活向けのやさしい共有アプリの雰囲気とする。

ただし、特定サービスの画面、ロゴ、配色、構成をそのまま模倣しない。

以下の要素を参考にする。

* 家族向けの親しみやすさ
* 生活感
* やさしい配色
* 大きめの余白
* 丸みのあるカード
* 威圧感のないボタン
* 情報を整理したダッシュボード
* 初見でも分かるナビゲーション

---

## 15.2 デザインコンセプト

```text
やさしく
すっきり
あたたかい
生活になじむ
ふたりで使いやすい
```

家事管理アプリではあるが、業務管理ツールのような硬い印象にしない。

達成率や未完了数で利用者を責める表現を避ける。

---

## 15.3 カラーパレット

基本色:

```text
ミント
ティール
淡い水色
オフホワイト
薄いグレー
```

アクセント:

```text
淡いコーラル
やさしい黄色
淡い青
淡い緑
```

状態色例:

| 状態  | 色      |
| --- | ------ |
| 未完了 | 淡いコーラル |
| 対応中 | 淡いブルー  |
| 完了  | 淡いグリーン |
| パス  | グレー    |
| 注意  | やさしい黄色 |

強い赤や高彩度の色を多用しない。

削除やログアウトなど、危険操作のみ赤を使用する。

---

## 15.4 UIスタイル

* 白またはオフホワイトの背景
* 角丸カード
* 薄い境界線
* 非常に弱い影
* 大きめのタップ領域
* 線画アイコン
* やさしいイラスト
* 適度な余白
* 文字を詰め込みすぎない
* 状態は色だけでなく文字でも示す

---

## 15.5 イラスト

インコ、植物、家、カップ、バスケット、掃除用品など、家庭生活を感じるモチーフを使用する。

イラストは装飾目的であり、操作を邪魔しないこと。

ログイン画面や空状態などに使用する。

---

## 15.6 アイコン

シンプルな線画アイコンを使用する。

候補:

```text
家
ベル
チェック
カレンダー
買い物カート
歯車
ゴミ箱
インコ
ご飯皿
カメラ
人物
時計
```

アイコンライブラリを使用する場合は、プロジェクト内で統一する。

例:

```text
Lucide
Heroicons
```

---

## 15.7 文字

日本語UIとして読みやすいサンセリフ体を使用する。

システムフォントを優先してよい。

例:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Hiragino Sans",
  "Yu Gothic",
  "Noto Sans JP",
  sans-serif;
```

---

## 15.8 レスポンシブ

モバイルファースト。

基本幅:

```text
320pxから430px程度
```

PCでは中央に最大幅を設ける。

例:

```text
max-width: 480px
```

管理画面や一覧は、PCで横幅を広げてもよい。

---

## 15.9 アクセシビリティ

* タップ領域は最低44px程度
* 色だけで状態を示さない
* コントラストを確保
* ボタンに明確なラベルを付ける
* アイコンのみの操作にはaria-labelを付ける
* フォームエラーを文字で表示
* フォーカス表示を消さない
* 画像には必要に応じて代替テキスト
* ローディング状態を示す
* スクリーンリーダーでも操作可能にする

---

# 16. データベース設計案

以下は初期案。

実装前に、要件を満たす形でマイグレーションを作成する。

---

## 16.1 users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  avatar_type TEXT,
  avatar_value TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 16.2 households

```sql
CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  week_starts_on INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 16.3 household_members

```sql
CREATE TABLE household_members (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  color TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (household_id, user_id)
);
```

---

## 16.4 household_invites

```sql
CREATE TABLE household_invites (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL
);
```

---

## 16.5 sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
```

`token_hash` は `migrations/0002_auth_foundation.sql` で追加する。ブラウザへ渡す生セッショントークンはD1へ保存せず、SHA-256ハッシュのみ保存する。

---

## 16.6 tasks

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recurrence_type TEXT NOT NULL,
  assigned_user_id TEXT,
  assignment_type TEXT NOT NULL DEFAULT 'anyone',
  scheduled_time TEXT,
  notification_slot TEXT NOT NULL DEFAULT 'none',
  weekly_target_count INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 16.7 task_weekdays

```sql
CREATE TABLE task_weekdays (
  task_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  PRIMARY KEY (task_id, weekday)
);
```

---

## 16.8 task_records

```sql
CREATE TABLE task_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  target_date TEXT,
  target_week TEXT,
  status TEXT NOT NULL,
  acted_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  skipped_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

同じ日、同じタスクの重複を防ぐ。

例:

```sql
CREATE UNIQUE INDEX idx_task_records_daily_unique
ON task_records(task_id, target_date);
```

週内タスクについては、必要に応じて別の一意制約を設計する。

---

## 16.9 shopping_items

```sql
CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  category TEXT,
  note TEXT,
  purchased INTEGER NOT NULL DEFAULT 0,
  added_by TEXT NOT NULL,
  purchased_by TEXT,
  purchased_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 16.10 shopping_templates

```sql
CREATE TABLE shopping_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  default_quantity TEXT,
  category TEXT,
  default_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 16.11 attachments

```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  related_type TEXT NOT NULL,
  related_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

---

## 16.12 push_subscriptions

```sql
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  last_failure_at TEXT
);
```

---

## 16.13 notification_logs

```sql
CREATE TABLE notification_logs (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  target_date TEXT NOT NULL,
  notification_slot TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (
    household_id,
    target_date,
    notification_slot
  )
);
```

---

# 17. API設計案

APIはREST形式でよい。

全APIで認証、家庭所属確認、入力検証を行う。

---

## 17.1 認証

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

---

## 17.2 家庭

```text
POST /api/households
GET  /api/households/current
PATCH /api/households/current
POST /api/households/current/invites
POST /api/households/join
GET  /api/households/current/members
```

`GET /api/households/current` は、ログイン済みだが家庭未所属の場合に `household: null` を200で返す。これは家庭作成または招待参加へ誘導するオンボーディング状態として扱うため。

MVPでは1ユーザー1家庭に制限する。ただしDB上は複数家庭所属に拡張できる `household_members` 構造を維持し、MVP制限はService層で行う。

---

## 17.3 タスク

```text
GET    /api/tasks
POST   /api/tasks
GET    /api/tasks/:taskId
PATCH  /api/tasks/:taskId
DELETE /api/tasks/:taskId
```

---

## 17.4 今日・今週

```text
GET /api/dashboard/today
GET /api/dashboard/week
```

ダッシュボードAPIは、画面で必要な情報をまとめて返してよい。

不要な複数リクエストを避ける。

---

## 17.5 タスク回答

```text
POST /api/tasks/:taskId/start
POST /api/tasks/:taskId/complete
POST /api/tasks/:taskId/skip
POST /api/tasks/:taskId/reset
GET  /api/tasks/:taskId/history
```

---

## 17.6 買い物

```text
GET    /api/shopping-items
POST   /api/shopping-items
PATCH  /api/shopping-items/:itemId
DELETE /api/shopping-items/:itemId

POST /api/shopping-items/:itemId/purchase
POST /api/shopping-items/:itemId/unpurchase
DELETE /api/shopping-items/purchased
```

---

## 17.7 買い物テンプレート

```text
GET    /api/shopping-templates
POST   /api/shopping-templates
PATCH  /api/shopping-templates/:templateId
DELETE /api/shopping-templates/:templateId
POST   /api/shopping-templates/:templateId/add
```

---

## 17.8 添付画像

```text
POST   /api/attachments
GET    /api/attachments/:attachmentId
DELETE /api/attachments/:attachmentId
```

---

## 17.9 Push通知

```text
POST   /api/push-subscriptions
DELETE /api/push-subscriptions/:subscriptionId
POST   /api/notifications/test
GET    /api/notifications/status
```

---

# 18. ルーティング案

```text
/
├── /login
├── /register
├── /guest
├── /household/create
├── /household/join
├── /home
├── /tasks
├── /tasks/new
├── /tasks/:taskId
├── /tasks/:taskId/edit
├── /tasks/:taskId/respond
├── /shopping
├── /shopping/templates
├── /history
├── /settings
├── /settings/notifications
├── /settings/members
└── /about
```

---

# 19. 状態管理

フロントエンドの状態は以下を分ける。

## サーバー状態

* ログインユーザー
* 家庭情報
* タスク
* 履歴
* 買い物リスト
* 通知状態

TanStack Queryなどの利用を検討する。

ただし、依存ライブラリを増やしすぎない。

## UI状態

* モーダル
* 入力フォーム
* 選択中タブ
* ゲスト用一時データ
* 画像プレビュー

---

# 20. PWA要件

最低限以下を実装する。

```text
manifest.webmanifest
Service Worker
アプリアイコン
テーマカラー
ホーム画面追加対応
オフライン時の最低限画面
Web Push受信
通知タップ時の画面遷移
```

manifest例:

```json
{
  "name": "おうちTodo",
  "short_name": "おうちTodo",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8FBFA",
  "theme_color": "#39B7A5"
}
```

アイコンは以下を用意する。

```text
192x192
512x512
apple-touch-icon
通知用badge
```

---

# 21. Service Worker要件

以下を処理する。

```text
install
activate
fetch
push
notificationclick
```

通知データ例:

```json
{
  "title": "今日の家事が3件残っています",
  "body": "タップして確認してください",
  "url": "/home?from=notification&slot=night"
}
```

通知タップ時は、既存のPWAウィンドウがあればフォーカスし、なければ開く。

---

# 22. セキュリティ要件

* パスワードを平文保存しない
* CookieはHttpOnly、Secure
* Cookie認証を使う状態変更APIではOriginを検証する
* 状態変更APIでは原則としてJSON Content-Typeを要求する
* APIごとに認証確認
* 家庭IDだけでデータへアクセスさせない
* 必ずユーザーが家庭メンバーか確認
* 入力値を検証
* SQLはバインド変数を使用
* 画像MIMEタイプを検証
* 画像サイズを制限
* R2オブジェクトキーを推測困難にする
* R2バケットを公開しない
* ゲストと本番データを分離
* 招待コードをログへ平文出力しない
* VAPID秘密鍵をSecretsへ保存
* CORSを必要以上に広げない
* エラーに内部情報を含めない
* 削除APIで権限確認
* セッション期限を設ける

---

# 23. エラーハンドリング

ユーザー向けには分かりやすい日本語を表示する。

例:

```text
ログインに失敗しました。
メールアドレスまたはパスワードを確認してください。
```

```text
画像のアップロードに失敗しました。
通信環境を確認して、もう一度お試しください。
```

```text
このタスクはすでに別のメンバーが完了しています。
```

技術的な例外やスタックトレースを画面に表示しない。

---

# 24. 競合対策

二人が同時に同じタスクを操作する可能性がある。

以下を考慮する。

* 同じタスクの二重完了
* 対応中の同時登録
* 買い物項目の同時更新
* 購入済みの重複操作
* 通知の二重送信

D1の一意制約、トランザクション相当の処理、更新条件を使用する。

完了APIは冪等性を意識する。

---

# 25. 日付とタイムゾーン

サーバー側ではUTCを基本とする。

家庭ごとのタイムゾーンを保持する。

画面表示と当日判定は`Asia/Tokyo`を使用する。

日付境界、週境界、Cron時刻を慎重に扱う。

以下をテストする。

* 23:59から翌日
* 月曜0:00
* 日曜23:59
* 月末
* 年末年始
* 通知時刻
* UTCとJSTの変換

---

# 26. MVP範囲

初期リリースでは以下を実装する。

## 必須

* ログイン
* ログイン状態保持
* ログアウト
* 家庭作成
* 招待コードで家庭参加
* ゲストモード
* 今日のホーム画面
* 毎日タスク
* 曜日指定タスク
* 週内1回タスク
* タスク作成・編集・無効化
* 未完了
* 対応中
* 完了
* パス
* 完了取り消し
* 完了者、完了日時の履歴
* 買い物リスト
* 買い物テンプレート
* メモ
* 画像1枚添付
* 画像圧縮
* R2保存
* 30日後の画像削除
* PWA
* Push通知
* タスク単位の指定時刻通知
* ユーザー単位の夜まとめ通知
* テスト通知
* 通知タップ後の回答導線
* レスポンシブ対応

---

## MVP後

* 週2回以上
* 一度だけのタスク
* 詳細な家事集計
* カレンダー表示
* 写真複数枚
* コメントスレッド
* 店舗別買い物リスト
* 金額管理
* レシート管理
* プロフィール画像
* タスク複製
* 並び替えのドラッグ操作
* オフライン編集
* メール通知
* 通知時刻の自由設定
* 複数家庭への所属
* 管理者権限の詳細化

---

# 27. 開発順序

以下の順で実装する。

## Phase 1: 基盤

* React、TypeScript、Vite
* Cloudflare Workers
* Wrangler設定
* D1接続
* マイグレーション
* 環境変数
* ルーティング
* 基本レイアウト
* デザイン変数

## Phase 2: 認証

* ユーザー登録
* ログイン
* ログアウト
* セッション
* 認証ガード
* ログイン保持
* ゲストモード

## Phase 3: 家庭

* 家庭作成
* メンバー
* 招待コード
* 家庭参加

## Phase 4: タスク

* タスク作成
* タスク一覧
* 毎日タスク
* 曜日指定
* 週内タスク
* 今日のタスク計算
* 状態変更
* 履歴

## Phase 5: ホーム画面

* 未完了数
* 今やること
* 今日のタスク
* 今週の進捗
* 買い物プレビュー

## Phase 6: 買い物

* 自由入力
* テンプレート
* 購入済み
* 一括削除
* メモ

## Phase 7: 画像

* ブラウザ圧縮
* R2アップロード
* 認証付き取得
* 手動削除
* Lifecycle Rule
* D1レコード整理

## Phase 8: PWA / Service Worker基盤

* manifest
* Service Worker
* アプリシェルの最低限のオフラインフォールバック

次フェーズ以降:

* Push購読
* VAPID
* テスト通知
* Cron
* タスク単位の指定時刻通知
* ユーザー単位の夜まとめ通知
* 二重送信防止
* 無効購読削除

## Phase 9: 品質改善

* テスト
* アクセシビリティ
* ローディング
* エラー表示
* 空状態
* レスポンシブ
* iPhone実機確認
* ゲスト公開確認

---

# 28. テスト方針

## 単体テスト

* 日付計算
* 今日の対象タスク判定
* 週内タスク判定
* 通知対象判定
* 権限判定
* 入力バリデーション
* 画像サイズ判定

## APIテスト

* 認証なし拒否
* 別家庭データ拒否
* 正常作成
* 正常更新
* 二重完了
* 存在しないID
* 不正入力
* 招待コード
* 画像権限

## E2E

* 新規登録
* 家庭作成
* 招待参加
* タスク登録
* タスク完了
* 買い物追加
* 買い物購入済み
* ゲスト操作
* ログアウト
* ログイン保持

## 実機確認

* iPhone Safari
* ホーム画面追加
* standalone表示
* 通知許可
* Push受信
* 通知タップ
* 画像撮影・添付
* 画面回転
* キーボード表示
* 小さい画面での操作

---

# 29. Codexへの作業ルール

Codexは、実装時に以下を守ること。

## 作業前

1. 本ドキュメントを読む
2. 画面ラフ画像を確認する
3. 現在のリポジトリ構成を確認する
4. `git status`を確認する
5. 既存実装を壊さない
6. 変更対象を明確にする

## 実装時

* TypeScriptの型を適切に定義する
* `any`を安易に使わない
* 定数を一か所で管理する
* UI文言を分散させすぎない
* コンポーネントを巨大化させない
* API、DB、UIの責務を分離する
* 入力値を必ず検証する
* 認可処理を省略しない
* エラーを握りつぶさない
* 無料枠を意識する
* 不要なポーリングをしない
* 画像を元サイズで保存しない
* ゲストデータと実データを混ぜない

## 作業後

以下を報告する。

```text
変更ファイル
実装内容
設計判断
実行した確認
テスト結果
未対応事項
注意点
```

コミットは、明示的に指示されない限り行わない。

大規模な変更を一度に行わず、Phaseまたは機能単位で分ける。

---

# 30. 画面ラフの扱い

リポジトリ内の画面ラフ画像を参照する。

想定パス:

```text
docs/images/household-todo-screen-rough.png
```

ラフ画像には以下の画面が含まれる。

```text
ログイン
ホーム
タスク詳細
買い物リスト
設定
```

ラフの主な意図:

* ホームで今日と今週を一目で確認
* 通知からタスク詳細へ遷移
* タスク詳細で完了、対応中、パスを選択
* 買い物テンプレートから簡単に追加
* 設定から通知、メンバー、テンプレートを管理
* 家庭向けのやさしく温かいデザイン
* インコを生活モチーフとして使用
* 情報量は多いが、カードで整理する
* ボトムナビゲーションで主要画面を切り替える

ラフ画像の文字や細部に誤りがある場合は、本ドキュメントを優先する。

---

# 31. 完成条件

MVP完成と判断する条件は以下。

* 二人が別端末から同じ家庭へ参加できる
* タスクを登録できる
* 今日の対象タスクが正しく表示される
* どちらかが完了するともう一方も確認できる
* 誰がいつ完了したか分かる
* 対応中にできる
* パスにできる
* 週内タスクの進捗が分かる
* 買い物を共有できる
* 買い物テンプレートから追加できる
* メモを共有できる
* 写真を添付できる
* 写真が30日後に削除される
* iPhoneのホーム画面に追加できる
* 設定したタスク単位の指定時刻通知と夜まとめ通知が届く
* 通知から対象画面を開ける
* ゲストモードを公開できる
* 実家庭データがゲストに漏れない
* 無料枠を前提とした構成になっている
* モバイルで無理なく操作できる
* デザインがラフとコンセプトに沿っている

---

# 32. 最終的なプロダクトの方向性

本アプリは、家事を厳密に管理する業務ツールではない。

家庭内の小さな認識違いや、家事のやり忘れを減らし、二人が気持ちよく生活するための共有ツールとする。

重要なのは、タスクを大量に管理することではなく、以下を自然に実現すること。

```text
今日やったか分かる
誰がやったか分かる
今から誰かがやるか分かる
忘れていたら通知で気付ける
買うものを二人で共有できる
```

デザインや文言では、未完了を責める表現を避ける。

たとえば、

```text
未完了です
```

だけでなく、

```text
今日の家事が3件残っています
```

```text
時間のあるときに確認しましょう
```

など、やさしい案内を心がける。

ユーザーが毎日開いても負担を感じず、生活の中に自然になじむアプリを目指す。
## 2026-07-31 Task frontend MVP update

The frontend now consumes the task backend API for MVP task management:

- Home displays `GET /api/dashboard/today` data: date, household, members, today summary, today tasks, and weekly task progress.
- Task management displays `GET /api/tasks?includeInactive=true` grouped by recurrence and active state.
- Create and edit screens support daily, scheduled, and weekly task inputs.
- Detail and respond screens support start, complete, skip with optional reason, reset, and recent history.
- Task display labels are centralized for recurrence type, assignment type, notification slot, weekday, and status.
- Shopping remains a preparation page for this phase.

Not included in this phase: shopping list implementation, attachments, R2, Web Push, Cron, production Cloudflare resources, deployment, custom domain, rankings, and detailed analytics.
## 2026-08-04 Shopping item image specification

One optional image is supported per shopping item. JPEG, PNG, and WebP inputs are accepted up to 10MB. The browser converts them to WebP with Canvas, removes EXIF through re-encoding, limits the long side to 1280px, and enforces a final 1MB limit. The authenticated APIs are `PUT/GET/DELETE /api/shopping/items/:itemId/image`; R2 remains private and D1 metadata is stored in `shopping_item_images`. R2 and D1 are not one transaction, so orphan cleanup risk after external R2 failures is documented. Production R2, public URLs, CDN, 30-day Cron, and deployment are not included.

## 2026-08-04 Shopping UI scope update

The frontend now includes the complete MVP shopping list UI using the existing `/api/shopping/*` APIs. Users can view pending and purchased items, add/edit/delete items, mark purchased, return to pending, clear purchased items, manage reusable shopping templates, add items from templates, and see purchaser/time information after refresh.

Routes added for this phase: `/shopping`, `/shopping/new`, `/shopping/items/:itemId`, `/shopping/items/:itemId/edit`, `/shopping/templates`, `/shopping/templates/new`, and `/shopping/templates/:templateId/edit`.

Still out of scope: image upload, compression, WebP, R2, image URLs, image deletion/Cron, barcode reading, price, store, category, inventory, notifications, production Cloudflare resources, deployment, custom domain, commit, and push.

### Orphan R2 cleanup (2026-08-04)

Normal images referenced by `shopping_item_images` are never deleted by age. Only failed R2 deletions are queued in `orphan_r2_objects` with a unique `r2_key`. Candidates become due after 30 days, then the daily `0 18 * * *` UTC Scheduled Handler processes at most 50 records. It rechecks D1 references, treats missing R2 objects as success, retries after 1/3/7/14 days, and preserves the fifth failure as `abandoned`. Major D1 mutations succeed even when the subsequent R2 delete fails; queue-registration failures are structured errors. Production Cron registration, production R2 operations, deployment, commit, and push remain out of scope.
