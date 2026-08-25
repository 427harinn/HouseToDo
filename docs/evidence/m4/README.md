# M4 Shopping Evidence

Production UI evidence was captured from committed render target `651363dd5700adfb18ce1a8608c7ee60ea999f91` and Mockup evidence from `db8941dc3056f07862014242a349ae366da59e9c`. All captures use a 390×844 viewport, settled after network and animation completion with neutral focus/hover.

Production evidence uses the shipped Production React UI with a deterministic, household-scoped review API fixture only for visual evidence. The fixture is not part of the application business logic. The Mockup repository was read-only and was not changed.

## Evidence layout

- `production/`: M4 Shopping list, item, Add, and Edit captures.
- `mockup/`: matching canonical Mockup states.
- `motion/`: four canonical WebM recordings.
- `motion/previews/`: GIF previews generated from the canonical WebM at 10fps without changing playback timing.
- `review-upload/`: exactly four labeled side-by-side boards and four canonical WebM files for reviewer upload.

The four canonical interactions are real pointer/touch-style browser operations: expand/collapse, purchase/restore, left swipe to Edit, and long-press drag reorder.
