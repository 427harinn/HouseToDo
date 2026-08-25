# M3 Calendar evidence

All captures use a 390×844 viewport at device scale 1. Production captures use the local Worker contract through a request fixture only for deterministic visual evidence; the shipped UI remains backed by the production API. Mockup captures use the latest `HouseToDo-Mockup` main fixture app and the repository was not modified.

## Mockup parity audit

| state | result | note |
| --- | --- | --- |
| Calendar normal | pass | Compact year/month header, Today, Sunday-first 42-cell grid, bottom navigation |
| Calendar dense | pass | Two task names, ellipsis and `+N` behavior |
| Calendar Shopping | pass | Pending planned marker uses Lucide cart and count |
| Date Sheet normal | pass | Fixed backdrop/shell/header; content is the only translated layer |
| Date Sheet period + Shopping | pass | Section order and weaker Shopping hierarchy match |
| Completed collapsed/open | pass | Collapsed count, snapshot title, completer avatar and restore/edit actions |
| Completed swipe / restore | pass | Home swipe primitive reused; Calendar restore is date-scoped |
| Deleted completed | pass | Restore-only action for inactive task |
| Month swipe | pass | React state + bounded CSS transform; no View Transition API |
| Day swipe | pass | Sheet shell/header/backdrop remain fixed; content translates |

The visual comparison target was Mockup `db8941dc3056f07862014242a349ae366da59e9c` (latest main at task start). Production-only differences are API loading/error status text, real task data, and accessibility fallback controls.

## Screenshots

- Production: `production/01-calendar-normal.png` through `production/12-calendar-task-edit-return-context.png`
- Mockup: `mockup/01-calendar-normal.png` through `mockup/11-calendar-next-month.png`

The Draft PR embeds the eleven shared states as pinned Production/Mockup image pairs and the Production-only task-edit return context. The image URLs are pinned to the evidence commit rather than the branch name.

## Motion recordings

- `motion/calendar-task-complete.webm`
- `motion/calendar-month-swipe.webm`
- `motion/calendar-day-swipe.webm`
- `motion/calendar-completed-undo.webm`

Review GIF previews:

- `motion/previews/calendar-task-complete.gif`
- `motion/previews/calendar-month-swipe.gif`
- `motion/previews/calendar-day-swipe.gif`
- `motion/previews/calendar-completed-undo.gif`

GIFs are generated from the existing WebM playback at 10 fps and preserve the WebM speed. WebM remains the source of truth.

## Reviewer upload package

Run `node scripts/build-calendar-review-upload.mjs` after final capture. It clears and recreates `review-upload/` with only four side-by-side board PNGs and the four canonical WebM files. Each board includes the state name, Production HEAD SHA, Mockup SHA, and Evidence source.
