# M7 two-user integration diagnostics

- Environment: loopback-only Wrangler Worker + local D1 at `127.0.0.1:8788/8789`, Vite proxy, no fixture network interception for the core actions.
- Browser Context A and B used separate Playwright contexts, cookies, and sessions; registration, household creation, invite creation, registration, and join were completed through the real local API/UI path.
- `e2e/m7-real-integration.spec.ts`: 2 passed.
- Task: A created and assigned the Task in canonical Add UI; B saw it after navigation; B completed; A saw B as completer; A restored; B saw active state; A edited; B dashboard and Task endpoint returned the edited title.
- Shopping: A added a planned item in canonical Add UI; B saw it; canonical long-press reorder persisted the same order across A/B; B purchased; A saw B as purchaser; A restored; B saw pending state again with planned date preserved.
- Docker Compose was attempted but Docker daemon was unavailable (`dockerDesktopLinuxEngine` pipe missing). The repository-native Wrangler fallback was available and used.
