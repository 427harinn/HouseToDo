# Codex Workflow

このRepositoryのUI移植作業では、以下を恒久ルールとする。

- 作業開始時に最新の`origin/main`をfetchし、そこから今回専用branchを作る。
- `main`へ直接commitしない。
- 実装・test・push後に`main`向けDraft PRを作る。
- PRは自動mergeせず、review後に人がmergeする。
- visible UI変更ではreview用ScreenshotをPRへ載せる。
- Motion / Swipe / Drag / transitionを変更した場合は動画Evidenceも残す。
- Motion Evidenceの基本viewportは390×844とする。
- 同じ意味・同じ役割のUIでは、Mockup latest mainの色、spacing、size、copy、layout、interaction、Motionをcanonicalとして再利用する。Production固有の差はbackend/data semanticsまたはaccessibility・platform制約などの理由をPR本文へ記録する。
- Mockup latest mainを作業開始時とparity audit時にfetchして確認する。Mockupはdesign / interaction / motionのsource of truth、ProductionはAPI、認証、データ取得、保存、権限、Worker、D1、R2、Cloudflare構成のsource of truthと明確に分ける。
- Draft PR作成前に、Codex自身がMockup latest mainとProductionを同一390×844で実際にrenderし、色・spacing・size・copy・layout・visible state・interaction・gesture・completion・sheet・Motionを比較して記録する。理由のない差はPR作成前に修正する。
- 参照Repositoryはread-onlyで扱い、fixture、data-uilab、hash routing、UI Lab adapterをProductionへ持ち込まない。Productionのreview fixtureはvisual evidence専用とし、business logicの代替にしない。
