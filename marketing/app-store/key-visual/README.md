# App Store key visual base

This directory contains the deterministic, text-free horizontal key visual for Canva handoff.

Render the final PNG with:

```bash
npm run marketing:key-visual:render
```

The output is `output/key-visual-base.png` at `2868×1320` pixels. It uses the supplied background unchanged and layers the supplied Shopping, Calendar, and Home screenshots from back to front. The renderer does not add copy, logos, annotations, icons, shapes, or device frames.

The Home screenshot is the frontmost layer at `565px` wide. Shopping is `500px` wide and Calendar is `485px` wide. All three use a `28px` radius, a `1px solid rgba(48, 53, 49, 0.06)` border, and `0 18px 40px rgba(48, 53, 49, 0.10)` shadow.
