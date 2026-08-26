# M7 PWA production-like diagnostics

- Implementation base: `d89a9d7ad52f5580b65a2a44b0e350295ef542c7`
- Server: local Wrangler Worker assets after `npm run build`; no deploy.
- `/manifest.webmanifest`: HTTP 200, `name=HouseToDo`, `short_name=HouseToDo`, `id=/`, `start_url=/`, `scope=/`, `display=standalone`, theme/background colors present.
- `/icons/house-todo-192.png`: HTTP 200, actual `192x192`.
- `/icons/house-todo-512.png`: HTTP 200, actual `512x512`.
- Chromium: `navigator.serviceWorker.getRegistration()` present, scope `/`, active worker present, controller present before and after reload.
- Start URL: unauthenticated `/` redirected to `/login`.
- Direct route checks: `/home`, `/calendar`, `/shopping`, `/other`, and `/shopping?item=missing-fixture` loaded/reloaded without SPA fallback failure; missing deep-link remains on canonical Shopping route.
- Notification URL same-origin/cross-origin/protocol-relative/malformed safety remains covered by existing `src/lib/notification-url.test.ts` and `public/sw.js`; no offline cache/fetch handler was added.
- WebKit: unavailable because the local Playwright WebKit executable is not installed.
- Real iPhone: not run; see `docs/PWA_MANUAL_CHECKLIST.md`.
