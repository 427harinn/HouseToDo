# PWA icon visual review

Generated from `docs/design/house-todo-app-icon.svg` with `npm run pwa:icons:generate`.

- `icon-contact-sheet.png`: v3/v4 comparison at 60px and 180px under simulated iOS/circular masks, v4 small-size checks, and neutral Home Screen context.
- `icon-ios-mask-preview.png`: isolated simulated iOS rounded-square mask.
- `icon-small-size-preview.png`: isolated v4 180px, 60px, and 40px views.

Visual review result: v4 preserves the v3 1.12x scale, moves the glyph up 8px, and expresses the body walls with matching vertical centerlines. The standard iOS composition remains separate from the safer maskable composition, and all assets retain a full-bleed mint background with no transparent corners or nested rounded container.
