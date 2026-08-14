# 現在のプロダクト仕様

> この文書は、実装済みbehaviorを説明する現在のproduct specificationのsource of truthです。進捗ログ、作業履歴、将来案の一覧ではありません。

## 目的と利用者

HouseToDoは、同じ家庭のメンバーが家事タスクと買い物を共有し、日々の実行と完了履歴を扱うためのモバイルファーストPWAです。認証ユーザーは最大1家庭に所属するMVP制約があります。

## 現在の機能

### 認証・家庭

登録、ログイン、ログアウト、現在ユーザー取得をCookieセッションで行います。家庭の作成・更新、招待コード発行、招待参加、メンバー一覧、家庭内権限確認を提供します。家庭未所属ユーザーは現在家庭をnullとして扱います。

### タスク

タスクは `daily`、`scheduled`、`weekly` のrecurrence typeを持ちます。scheduledは曜日指定を持ち、タイトル、メモ、担当者、予定時刻、通知slot、通知時刻、active状態を保持します。タスクは一覧、今日、今週、dashboardで表示し、start / complete / skip / resetの状態遷移と完了履歴を提供します。

現在のモデルは既存のrecurrenceと時刻指定を維持します。次のtask model刷新案をこの文書で確定した仕様として扱いません。

### 買い物

家庭共有の買い物項目に数量・メモ・購入者・購入時刻を持たせます。購入・未購入・購入済み一括削除、テンプレートの作成・更新・無効化・テンプレートからのコピー追加を提供します。テンプレートから追加した項目は独立した項目です。

### 画像

買い物項目に任意の画像を1枚添付できます。JPEG / PNG / WebPをブラウザでWebPへ再エンコードし、EXIFを除去、長辺1280px以下、最終1MB以下としてR2へ非公開保存します。画像metadataと容量・予約・orphan cleanup情報はD1で管理し、読み書き削除時に家庭所属を確認します。

### 通知とPWA

manifestとService Workerを提供します。Service Workerはpush payloadを安全に解釈し、同一originのdeep linkだけを開きます。通知権限はユーザー操作時に要求し、PushSubscriptionはユーザー・端末単位で登録・解除します。

タスクの指定通知、ユーザーのevening summary、Push送信、delivery log、重複防止、pending claim leaseを実装しています。evening summaryは当日未完了タスクがある場合に限り送信対象になります。test Push APIはproductionでは無効です。

### 現在のUX

モバイルファーストのReact UIで、ログイン、家庭管理、ホーム、タスク一覧・作成編集・詳細、買い物、画像、設定を提供します。設定では通知状態、Push購読、通知設定、家庭メンバー、画像使用量を確認できます。初期ラフ画像は現在UIの正確な参照ではありません。

## MVP境界

実装済みMVPは上記の認証・家庭・タスク・買い物・画像・PWA・Push・通知schedulerです。production rollout、production resource、運用上の本番secretはこの文書の実装済み範囲に含めません。

## API・DBの参照先

API一覧やDB schemaをこの文書に複製しません。現在のrouteは `worker/app.ts`、domain behaviorは `worker/services/`、migrationは `migrations/`を正とします。技術的な構成は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

## Future workへの境界

以下はROADMAP上の候補であり、現在仕様ではありません。

- deadlineとnotification offset preset
- recurrence redesign（柔軟なweekly / monthly）
- history / templateからのtask creation
- calendar UI / integration
- shopping history・template UX、camera / photo-library選択
- UI refinement、WebMCP、scheduler query optimization
- production rollout

## 承認済み次期task model（未実装）

次フェーズではtask recurrenceを `once`、`daily`、`weekly_fixed`、`monthly_fixed`、`weekly_flexible`、`monthly_flexible` の6種へ整理する。deadlineとnotification offsetを分離し、flexible taskはperiod内の最低1回完了で達成、追加実施は履歴に残す。start_dateは全typeで保存し、未指定時は作成日のhousehold local dateとする。

この仕様は承認済みだが未実装であり、現在の `daily` / `scheduled` / `weekly`、`notification_time`、today/week/dashboardの挙動を置き換えていない。詳細は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) を参照する。
