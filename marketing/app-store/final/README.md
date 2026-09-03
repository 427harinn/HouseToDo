# App Store final screenshots

This directory contains the first reproducible HTML/CSS render of the eight App Store candidate images.

## Render

```bash
npm run marketing:appstore:render
```

The renderer uses the supplied `screenimage/*.png` backgrounds and raw 390×844 screenshots without cropping or UI changes. The final canvas is 1320×2868, with the title rendered in Zen Kaku Gothic New and the small handwritten annotations rendered in Yomogi. Both fonts are loaded from the local Fontsource packages, so capture does not depend on Google Fonts network access.

Annotations are intentionally kept as inline SVG/HTML in `renderer/render.mjs` so their position and line weight can be adjusted without regenerating raster artwork. The contact sheet is written to `preview/contact-sheet.png`.

The Canva handoff base images are generated with:

```bash
npm run marketing:appstore:render:base
```

This mode omits all marketing copy and annotations, leaving only the supplied background, the selected raw screenshot, and the light screenshot decoration. It writes `base/01-home-base.png` through `base/08-notifications-base.png` and `preview/contact-sheet-base.png`.

## Output

- `screenshots/01-home.png` through `screenshots/08-notifications.png`: App Store candidate PNGs
- `preview/contact-sheet.png`: review-only 4×2 contact sheet
