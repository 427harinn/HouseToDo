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

## Visual Evidence rule

- visible UI変更ではScreenshotを生成するだけでは不十分。主要Screenshotを最終commit SHAにpinしたGitHub raw/blob URLでPR本文へ画像として埋め込む。
- Mockup parity taskでは、同一stateのProduction / Mockup ScreenshotをPR本文内でside-by-side表示する。画像は390×844、settled state、hover/focus neutralizedを基本とし、タップすれば原寸画像を開ける構成にする。

## Motion Evidence rule

- Swipe / Drag / Complete / transition等のMotion変更ではcanonical WebMを保存する。
- PR上で確認しやすいanimated GIF previewを可能な限り生成・埋め込む。GIFはreview preview、WebMはcanonical motion evidenceとして扱い、GIF変換で再生速度を変更しない。

## Evidence quality

- 基本viewportは390×844。
- Screenshotはsettled stateで撮影し、hover/focusをneutralizeする。
- Motionを人工的に遅くしない。GIF変換でも元の再生速度を維持する。
- PR本文から画像・GIF・WebM linkが実際に確認できることをCodex自身が確認する。
