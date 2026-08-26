# M7 Legacy Route Inventory — before code changes

Production base: `d89a9d7ad52f5580b65a2a44b0e350295ef542c7`
Mockup reference: `db8941dc3056f07862014242a349ae366da59e9c`
Branch: `feat/production-integration-legacy-m7`

This inventory was recorded before the M7 frontend changes. The route parser and renderer were in `src/App.tsx`.

## User-facing route inventory

Canonical routes already present:

`/login`, `/register`, `/household/create`, `/household/join`, `/home`, `/calendar`, `/tasks/new`, `/tasks/:taskId/edit`, `/shopping`, `/shopping/new`, `/shopping/items/:itemId/edit`, `/other`, `/other/members`, `/other/notifications`, `/other/storage`, `/other/household`, `/other/account`.

Compatibility/legacy routes present:

`/guest`, `/onboarding`, `/settings/members`, `/tasks`, `/tasks/:taskId`, `/tasks/:taskId/respond`, `/tasks/templates`, `/tasks/templates/:templateId/edit`, `/shopping/items/:itemId`, `/shopping/templates`, `/shopping/templates/new`, `/shopping/templates/:templateId/edit`.

The parser also falls back unknown paths to `/`. Query strings are not part of `parseRoute`; `/shopping?item=<id>` is read by the Shopping screen from `window.location.search`.

## Legacy Route Matrix — before cleanup

| Requested route | Current renderer before M7 | M7 target |
| --- | --- | --- |
| `/settings/members` | `MembersScreen` | `/other/members` |
| `/tasks` | `TaskListScreen` | `/home` |
| `/tasks/:taskId` | `TaskDetailScreen` | `/tasks/:taskId/edit` |
| `/tasks/:taskId/respond` | compact `TaskDetailScreen` | `/home` |
| `/tasks/templates` | `TaskTemplateListScreen` | `/tasks/new` |
| `/tasks/templates/:templateId/edit` | `TaskFormScreen` `template-edit` | `/tasks/new` |
| `/shopping/items/:itemId` | `ShoppingItemDetailScreen` | `/shopping?item=<itemId>` |
| `/shopping/templates` | `ShoppingTemplateListScreen` | `/shopping/new` |
| `/shopping/templates/new` | `ShoppingTemplateFormScreen` create | `/shopping/new` |
| `/shopping/templates/:templateId/edit` | `ShoppingTemplateFormScreen` edit | `/shopping/new` |
| `/guest` | auth/household state machine; no legacy screen | preserve M6 state redirect |
| `/onboarding` | auth/household state machine; no legacy screen | preserve M6 state redirect |

## Internal references found before cleanup

- Home task rows and the legacy task list/detail flow navigated to `/tasks/:taskId`.
- Task detail/template controls navigated to `/tasks`, `/tasks/templates`, and `/tasks/templates/:templateId/edit`.
- Calendar Shopping rows and Shopping list open actions navigated to `/shopping/items/:itemId`.
- Shopping list exposed legacy detail/template destinations.
- `/settings/members` was still used by the legacy Members screen and legacy compatibility state.
- API wrappers for Task Template and Shopping Template endpoints were also imported by canonical reuse/prefill flows; those backend clients were therefore not assumed dead.

The M7 implementation must distinguish compatibility redirect definitions from user-facing links and must not remove backend routes or persistence.
