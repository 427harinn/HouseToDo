# HouseToDo app icon source

`house-todo-app-icon.svg` is the single vector master for the PWA/iOS icon refresh.

- Full-bleed background: `#8FD3B6`
- House glyph: white
- Check glyph: `#4E9F7D`
- The house/check stays in the central mask-safe area; platform masks are not baked into the source.

Generate the runtime PNGs and visual review artifacts with:

```sh
npm run pwa:icons:generate
```

The previous `house-todo-*.png` assets remain in `public/icons/` as temporary compatibility assets for already-cached manifests. Runtime references use the versioned `house-todo-v2-*.png` URLs.
