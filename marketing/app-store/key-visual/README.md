# App Store key visual base

This directory contains the deterministic, text-free horizontal key visual for Canva handoff.

Render the right-shifted PNG with:

```bash
npm run marketing:key-visual:render
```

The output is `output/key-visual-base-v3.png` at `2868×1320` pixels. The previous `output/key-visual-base-v2.png` remains unchanged for comparison. The renderer also writes `preview/key-visual-base-v2-v3-comparison.png`. It uses the supplied background unchanged and layers the supplied Shopping, Calendar, and Home screenshots from back to front. The renderer does not add copy, logos, annotations, icons, shapes, or device frames.

The Home screenshot is the frontmost layer at `565px` wide, positioned at `(1630, 60)`. Shopping is `500px` wide at `(1300, 145)`, and Calendar is `500px` wide at `(2025, 145)`. The group is shifted `90px` right from v2 while preserving approximately `330px` exposed on each side of Home. All three use a `28px` radius, a `1px solid rgba(48, 53, 49, 0.06)` border, and `0 20px 48px rgba(48, 53, 49, 0.11)` shadow.
