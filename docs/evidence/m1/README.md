# M1 UI Evidence

All screenshots and the WebM use a 390×844 viewport. The Playwright evidence test uses local API route mocks only; no Production API, Worker, D1, R2, or Cloudflare resource was changed.

- `home-390x844.png`: Home with the five-slot icon-only navigation.
- `calendar-390x844.png`: Calendar with Calendar selected.
- `shopping-390x844.png`: Shopping with Shopping selected.
- `members-other-current-390x844.png`: `/settings/members` with Other selected.
- `add-sheet-open-390x844.png`: Add Bottom Sheet open.
- `add-sheet-drag-dismiss.webm`: Add Sheet open, handle drag, and downward dismiss sequence.

The same E2E also verifies that a long Shopping list scrolls above the normal-flow navigation row, and that Add routes to both `/shopping/new` and `/tasks/new`. Reduced Motion final-state coverage is in `src/components/ui.foundation.test.tsx`.
