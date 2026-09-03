# App Store raw capture

This directory contains the local, deterministic source fixture for HouseToDo App Store material.

The Playwright scenario serves the Vite app locally and seeds API responses from `fixtures/house-to-do.json`. It does not log in to or call production/staging. The capture clock is fixed to `2026-09-07T10:00:00+09:00`, and the browser viewport/device scale are fixed to `390×844` / `1`.

```bash
npm run marketing:seed
npm run marketing:capture:screenshots
npm run marketing:capture:videos
npm run marketing:capture:all
```

PNG output is written to `raw/screenshots/` with the requested `01`–`06` names. WebM output is written to `raw/videos/` with the requested `01`–`02` names. Screenshots use `fullPage: false`, so they are direct viewport captures with no frame, padding, scaling, crop, title, or text overlay.
