# Codex Workflow

このRepositoryのUI移植作業では、以下を恒久ルールとする。

- 作業開始時に最新の`origin/main`をfetchし、そこから今回専用branchを作る。
- `main`へ直接commitしない。
- 実装・test・push後に`main`向けDraft PRを作る。
- PRは自動mergeせず、review後に人がmergeする。
- visible UI変更ではreview用ScreenshotをPRへ載せる。
- Motion / Swipe / Drag / transitionを変更した場合は動画Evidenceも残す。
- Motion Evidenceの基本viewportは390×844とする。
- 同じ意味・同じ役割のUIでは、既存の色、spacing、size、interaction、Motionを再利用する。
- ProductionのAPI、認証、データ取得、保存、権限、Worker、D1、R2、Cloudflare構成をUI移植のsource of truthとし、UI作業で変更しない。
- 参照Repositoryはread-onlyで扱い、fixture、data-uilab、hash routing、UI Lab adapterをProductionへ持ち込まない。
