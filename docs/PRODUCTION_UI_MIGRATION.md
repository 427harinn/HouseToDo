# Production UI Migration

HouseToDo-Mockupをdesign / interaction / motionのsource of truthとし、ProductionのAPI・認証・router・データ・権限・Cloudflare構成はProduction側をsource of truthとする。

## Milestone overview

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 | Shared UI Foundation: tokens, global foundation, motion constants, App Shell, Bottom Navigation, Add Bottom Sheet | In progress |
| M2 | Task UI: task rows, create/detail interaction and completion UI | Planned |
| M3 | Calendar screen visual migration and calendar interactions | Planned |
| M4 | Shopping screen visual migration and shopping interactions | Planned |
| M5 | Other screen and formal `/other` route | Planned |
| M6 | Auth, register, household entry and onboarding visual migration | Planned |
| M7 | Cross-screen polish, responsive/accessibility and motion consistency | Planned |
| M8 | Final visual regression, evidence and production-readiness review | Planned |

現在実装中なのはM1のみ。M2以降のscreen redesign、API、Worker、D1、R2、認証backend変更はこのbranchの対象外とする。

## M1 transitional mapping

最終Bottom Navigationは`Home / Calendar / Add / Shopping / Other`の5枠とする。M1では正式なOther screenをまだ作らないため、Otherは既存の`/settings/members`へ遷移し、`/settings/members`表示時はOtherをcurrent扱いにする。この暫定mappingはM5で正式な`/other`へ置き換える。

中央Addは既存の`/tasks/new`（家事）と`/shopping/new`（買い物）へ遷移する。form自体のデザイン移植はM2/M4で行う。

## Reference commits

- Production base: `11a6c2848ccf726ca865510f68eca3ae1af7c9d1`（作業開始時に確認した`origin/main`）
- HouseToDo-Mockup reference: `db8941dc3056f07862014242a349ae366da59e9c`（PR #18 merge後の`origin/main`）
