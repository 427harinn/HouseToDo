# App Store raw capture

This directory contains the local, deterministic source fixture for HouseToDo App Store material.

The Playwright scenario serves the Vite app locally and seeds API responses from `fixtures/house-to-do.json`. It does not log in to or call production/staging. The capture clock is fixed to `2026-09-07T10:00:00+09:00`, and the browser viewport/device scale are fixed to `390×844` / `1`.

```bash
npm run marketing:seed
npm run marketing:capture:screenshots
npm run marketing:capture:screenshots:additional
npm run marketing:capture:videos
npm run marketing:videos:duration
npm run marketing:capture:all
```

PNG output is written to `raw/screenshots/`: the requested `01`–`06` files plus additional state candidates grouped under `home/`, `task-form/`, `calendar/`, `shopping/`, `settings/`, and `add-sheet/`. WebM output is written to `raw/videos/` with the requested `01`–`02` names. Screenshots use `fullPage: false`, so they are direct viewport captures with no frame, padding, scaling, crop, title, or text overlay. The video scenarios use explicit waits between interactions; the application animation durations are unchanged. `marketing:videos:duration` reads the WebM metadata and prints the actual duration of both captures.
