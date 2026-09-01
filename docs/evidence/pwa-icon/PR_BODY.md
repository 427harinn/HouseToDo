## Design concept

- A single clean house + check symbol for the HouseToDo PWA/iOS home-screen icon.
- Full-bleed mint background with a white house and high-contrast green check.
- No text, gradients, shadows, nested container, or baked-in platform corners.

## Assets and runtime changes

- Vector master: `docs/design/house-todo-app-icon.svg`
- Generated PNGs from that master: 180x180, 192x192, and 512x512.
- `index.html` now points `apple-touch-icon` (size 180x180) to `house-todo-v2-180.png`.
- `public/manifest.webmanifest` now points to the versioned 192px/512px assets and declares `purpose: any maskable`.
- Web Push notification payloads and the existing PWA asset check use the versioned 192px asset.
- Existing unversioned icon files are retained temporarily for compatibility with cached manifests.

## Review evidence

- Preview artifacts: `artifacts/pwa-icon/`
- Visual self-review: 1 SVG design iteration; 2 preview-generation passes (the second pass fixed only local preview image URLs).
- Final review passed raw, simulated iOS rounded-square, simulated circular mask, and 180px/60px/40px views.

## Verification

- `npm run pwa:icons:validate`
- `npm run lint`
- `npm run typecheck`
- `npm test -- --silent`
- `npm run build`
- `git diff --check`
- Local browser verification: manifest and all new icon URLs returned 200; icons returned `image/png`.

No database migration. Production is untouched. Auto-merge is not enabled.
