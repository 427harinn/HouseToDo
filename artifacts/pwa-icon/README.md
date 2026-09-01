# PWA icon visual review

Generated from `docs/design/house-todo-app-icon.svg` with `npm run pwa:icons:generate`.

- `icon-contact-sheet.png`: v2/v3 comparison at 60px and 180px under simulated iOS/circular masks, v3 small-size checks, and neutral Home Screen context.
- `icon-ios-mask-preview.png`: isolated simulated iOS rounded-square mask.
- `icon-small-size-preview.png`: isolated v3 180px, 60px, and 40px views.

Visual review result: standard v3 enlarges the house and check by 12% around the existing optical center for iOS; because that composition is tight under a circular mask, v3-maskable uses the safer inner composition. Both retain a full-bleed mint background with no transparent corners or nested rounded container.
