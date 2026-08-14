# 現在のプロダクト仕様

> この文書は、実装済みbehaviorを説明する現在のproduct specificationのsource of truthです。進捗ログ、作業履歴、将来案の一覧ではありません。

## 目的と利用者

HouseToDoは、同じ家庭のメンバーが家事タスクと買い物を共有し、日々の実行と完了履歴を扱うためのモバイルファーストPWAです。認証ユーザーは最大1家庭に所属するMVP制約があります。

## 現在の機能

### 認証・家庭

登録、ログイン、ログアウト、現在ユーザー取得をCookieセッションで行います。家庭の作成・更新、招待コード発行、招待参加、メンバー一覧、家庭内権限確認を提供します。家庭未所属ユーザーは現在家庭をnullとして扱います。

### タスク

タスクは「今回だけ」「毎日」「曜日を決める」「毎月○日」「週1回・日付不定」「月1回・日付不定」の6種類を画面から作成・編集できます。開始日、recurrence固有設定、任意の締め切り時刻、締め切り基準の通知preset、担当者を保持します。締め切りがない場合は通知を設定できません。

固定日taskはoccurrence、日付不定taskはperiodとしてstart / complete / skip / resetを扱います。日付不定taskはperiod内の1回完了で達成し、追加実施も記録できます。旧weekly target countが2以上のtaskは旧形式の意味を維持するcompatibility editorで扱い、自動変換しません。

### 買い物

家庭共有の買い物項目に数量・メモ・購入者・購入時刻を持たせます。購入・未購入・購入済み一括削除、テンプレートの作成・更新・無効化・テンプレートからのコピー追加を提供します。テンプレートから追加した項目は独立した項目です。

### 画像

買い物項目に任意の画像を1枚添付できます。JPEG / PNG / WebPをブラウザでWebPへ再エンコードし、EXIFを除去、長辺1280px以下、最終1MB以下としてR2へ非公開保存します。画像metadataと容量・予約・orphan cleanup情報はD1で管理し、読み書き削除時に家庭所属を確認します。

### 通知とPWA

manifestとService Workerを提供します。Service Workerはpush payloadを安全に解釈し、同一originのdeep linkだけを開きます。通知権限はユーザー操作時に要求し、PushSubscriptionはユーザー・端末単位で登録・解除します。

タスクのdeadline reminder、ユーザーのevening summary、Push送信、delivery log、重複防止、pending claim leaseを実装しています。canonical taskはhousehold timezoneのdeadlineからpreset offsetを引き、stable occurrence/period keyで重複を防止します。完了・skip済みscopeは通知しません。legacy taskは従来のnotification timeを維持します。evening summaryは当日未完了タスクがある場合に限り送信対象になります。test Push APIはproductionでは無効です。

### 現在のUX

モバイルファーストのReact UIで、ログイン、家庭管理、ホーム、タスク一覧・作成編集・詳細、買い物、画像、設定を提供します。設定では通知状態、Push購読、通知設定、家庭メンバー、画像使用量を確認できます。初期ラフ画像は現在UIの正確な参照ではありません。

## MVP境界

実装済みMVPは上記の認証・家庭・タスク・買い物・画像・PWA・Push・通知schedulerです。production rollout、production resource、運用上の本番secretはこの文書の実装済み範囲に含めません。

## API・DBの参照先

API一覧やDB schemaをこの文書に複製しません。現在のrouteは `worker/app.ts`、domain behaviorは `worker/services/`、migrationは `migrations/`を正とします。技術的な構成は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

## Phase 3 task domain

Canonical task projections and actions are now implemented for all six recurrence types. Today/dashboard responses add scope metadata, period bounds, completed counts, and derived overdue state while preserving existing fields. Action requests use targetDate and the server resolves occurrence/period scope. Calendar UI, scheduler migration, deep links, history/template UX, staging, production, and deployment remain future work.

## Future workへの境界

以下はROADMAP上の候補であり、現在仕様ではありません。

- history / templateからのtask creation
- calendar UI / integration
- shopping history・template UX、camera / photo-library選択
- UI refinement、WebMCP、scheduler query optimization
- production rollout

## 実装済みtask model

task recurrenceは `once`、`daily`、`weekly_fixed`、`monthly_fixed`、`weekly_flexible`、`monthly_flexible` の6種です。deadlineとnotification offsetを分離し、flexible taskはperiod内の最低1回完了で達成、追加実施は履歴に残します。start_dateは未指定時に作成日のhousehold local dateを保存します。Task UIとcanonical reminder schedulerまで実装済みです。calendar、notification deep-link、history/template UXは未実装です。詳細は [TASK_MODEL_DESIGN.md](TASK_MODEL_DESIGN.md) を参照します。
