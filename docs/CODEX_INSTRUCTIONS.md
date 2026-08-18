# Codex向け開発指示

> この文書はHouseToDoでのCodex作業ルールです。現在仕様は [PROJECT_SPEC.md](PROJECT_SPEC.md)、技術構成は [ARCHITECTURE.md](ARCHITECTURE.md) を参照します。

## 作業開始前

必須で読むもの:

- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/CODEX_INSTRUCTIONS.md`
- `.ai/MILESTONE.md`
- `.ai/TASKS.md`

必要時だけ読むもの:

- `docs/DECISIONS.md`
- `docs/STAGING_DEPLOYMENT.md`
- `docs/ROADMAP.md`
- relevantな画像/UI reference

巨大な履歴を毎回読む・更新する運用は行いません。実装の判断は必ず現在のsource codeでも確認します。

## 作業中

- ユーザーが指定した範囲だけを変更し、既存の未コミット変更を上書きしない。
- Dockerが利用可能ならDockerを優先する。利用不能ならhost gateと確認範囲を報告する。
- secrets、token、cookie、password、VAPID private key、Push endpoint / keyを表示・保存・コミットしない。
- migrationは既存ファイルを書き換えず、必要なら追加ファイルとして設計する。
- GUI変更ではPlaywrightのscreenshot/traceを使って確認する。
- staging、production、Cloudflare resource、deploy、remote migration、pushは明示承認なしに実行しない。

## Git

- 作業前後に `git status --short` と `git diff --check` を確認する。
- `git reset --hard`、`git clean -fd`、無関係な既存変更の削除は行わない。
- commitは依頼範囲が完了し、差分を確認してから行う。git pushは別途明示依頼がない限り行わない。
- safe.directoryが必要な場合は、global設定を書き換えず `git -c safe.directory=<repo>` を使う。

## 文書の責務

- PROJECT_SPEC: 実装済みのproduct behavior
- ARCHITECTURE: 現在のtechnical architecture
- DECISIONS: 長期的に残す重要decision
- ROADMAP: 未実装future work
- MILESTONE: 現在取り組むmilestoneだけ
- TASKS: current milestoneの未完了taskだけ
- STAGING_DEPLOYMENT: staging runbook

## 完了時

変更ファイル、検証コマンド、結果、未対応事項を簡潔に報告します。コード・API・DB・UI・運用に影響する変更では、関連文書のsource of truthも更新します。

## E2E test boundary

- `npm run test:e2e`はlocal/self-contained suiteです。staging-only specは明示skipされ、staging URLへ向けません。
- `npm run test:e2e:staging`は`STAGING_E2E_BASE_URL`とowner/member/crossのemail/password環境変数を要求します。不足時は理由付きskipとし、local URLへfallbackしません。
- Playwrightのsingle worker、既存のbrowser error checks、failure screenshot/trace/video artifact方針を維持します。retry追加、固定sleep追加、button count assertion追加でgreenにしません。
