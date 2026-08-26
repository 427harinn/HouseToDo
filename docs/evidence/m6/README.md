# M6 Evidence

Production base: `ed749b70707068b1b7dfb96e055d4e06371af094`

Production render target: `0150ed4`

Mockup reference: `db8941dc3056f07862014242a349ae366da59e9c`

The `production/` and `mockup/` folders contain the nine semantic Entry states captured at 390x844. The `motion/` folder contains four canonical WebM recordings, GIF previews, and frame intermediates used only to build the previews. The `review-upload/` folder is intentionally limited to four labeled boards and four canonical WebM files.

State assertion is implemented in `scripts/capture-m6-evidence.mjs`; Mockup captures use the Hash router and `uilabState` query, while Production captures use actual form interactions against fixture-only API responses.
