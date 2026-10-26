# Agent API Phase 2 OAuth (staging and production)

This implements Muse's OAuth 2.0 Authorization Code flow and Streamable HTTP MCP endpoint. Dynamic Client Registration is not enabled. OAuth metadata, Authorization Code flow, token operations, and MCP are available in `staging`, `test`, and `production`. Production must use its own Worker, D1, OAuth client, and secrets, isolated from staging. Development remains unchanged.

The Phase 1 fixed Bearer Agent API is not enabled in production, even if `AGENT_API_TOKEN` or `AGENT_API_USER_ID` were accidentally present. Production MCP requests authenticate only with OAuth access tokens. Staging-only diagnostics and test-only routes remain environment-limited.

## Staging client setup

The staging OAuth client and Muse connection have been exercised end-to-end. Keep all staging IDs, secrets, tokens, D1 data, and diagnostics confined to staging.

After the OAuth migration has been applied to the staging D1 database and Muse provides the exact redirect URI, provision a staging client secret:

```powershell
$env:MUSE_OAUTH_REDIRECT_URI = "<exact HTTPS redirect URI from Muse>"
npm run oauth:provision:staging
Remove-Item Env:MUSE_OAUTH_REDIRECT_URI
```

The command updates only the `DB` binding under Wrangler's `staging` environment. It creates or rotates the fixed `housetodo-muse-staging` client, stores only the SHA-256 hash in `oauth_clients`, and registers the exact redirect URI. The random client secret is printed once only after the database command succeeds. Save it directly in an approved secret manager and Muse's `client_secret_basic` configuration. Do not paste it into a command, source file, issue, or log. Running the command again rotates the secret and adds another redirect URI; remove obsolete redirect URI rows explicitly after confirming Muse no longer uses them.

This command does not run as part of build, test, migration, or deployment tasks. It must only be used after the staging migration and explicit staging provisioning approval.

## Production client setup

Production uses the dedicated Worker `house-to-do` and production D1 database `house-to-do`. The production client is `housetodo-muse-production` (`Muse`), uses `client_secret_basic`, and has exactly this redirect URI: `https://agent.meta.ai/api/hatch/oauth/callback`. Its allowed scopes are `tasks:read`, `tasks:write`, `shopping:read`, and `shopping:write`.

After verifying the production D1 name and ID in `wrangler.jsonc`, confirming all OAuth migrations are applied, and verifying that production `oauth_clients` is empty, run this command from the repository root:

```powershell
npm run oauth:provision:production -- --confirm-production
```

The production-only script checks that the configured production D1 ID is `f4877c95-59c1-4e42-9684-5bc51d880aa4`, that staging points to a different D1, and that production has no OAuth clients. It inserts rather than updates, stores only the SHA-256 hash, and verifies the enabled client, authentication method, scopes, hash shape, and sole redirect URI. It also compares a safe staging-client snapshot before and after. If any check fails, it does not print the generated secret. On success, the Client Secret is shown once in the command output; copy it directly into the approved production secret store and Muse's production `client_secret_basic` configuration. Do not save it in a file, command, shell history, source, Git, PR, or logs. Do not rerun the command: the script refuses to run when a production OAuth client already exists, and the secret cannot be recovered from D1.

Never use the staging Client ID or secret, staging D1, tokens, or VAPID key pair in production. The production OAuth client must only be registered after production deploy readiness has been reviewed; do not use this script as part of CI, builds, tests, migration, or deploy.

## Endpoints

- `GET /.well-known/oauth-authorization-server`
- `GET /oauth/authorize`
- `POST /oauth/consent`
- `GET /oauth/complete`
- `GET /oauth/continue`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `GET /.well-known/oauth-protected-resource/mcp`
- `POST /mcp`

The MCP server exposes fourteen tools: `get_today_tasks`, `get_tasks_by_date`, `create_task`, `update_task`, `get_task_details`, `delete_task`, `complete_task`, `get_shopping`, `add_shopping`, `update_shopping`, `delete_shopping`, `purchase_shopping`, `unpurchase_shopping`, and `upload_shopping_image`. Task read tools require `tasks:read`; create/update/delete/complete require `tasks:write`. Shopping reads require `shopping:read`; shopping mutations and image upload require `shopping:write`.

`update_shopping` takes a required `itemId` and any non-empty subset of `name`, `quantity`, `note`, and `plannedPurchaseDate`; null clears nullable fields. Muse should first call `get_shopping` to identify the item and ask the user when multiple items could match. The update calls `ShoppingService.updateItem`, which preserves the attached image. `delete_shopping` and `unpurchase_shopping` take only a required `itemId`; they call `ShoppingService.deleteItem` and `ShoppingService.markPending`, respectively. Delete follows the existing physical-delete and image cleanup behavior in the service. All shopping operations derive the user from the OAuth access token and rely on service-level household authorization.

### Muse task input adapter

`create_task` accepts `title`, optional `description`, `date`, `time`, `recurrence`, and `notification`. The preferred recurrence object uses stable English weekday names (`monday` through `sunday`) and these types:

- `once` with optional `date` (defaults to today)
- `daily`
- `weekly` with `weekdays`
- `weekly_count` with `count` (1–7, mapped to the legacy `weeklyTargetCount` format)
- `weekly_flexible` with optional `deadlineWeekday`
- `monthly` with `dayOfMonth`
- `monthly_flexible` with `monthDeadline` and `dayOfMonth` when `day_of_month`
- `this_week` and `this_month` (one-off tasks within the current household-local period)
- `deadline` with a required `date`

`notification` is `{ enabled, minutesBefore }`; supported offsets are 0, 5, 10, 30, 60, and 120 minutes. A task time is required for notifications. Canonical recurrence maps to the existing `modelRecurrenceType`, `executionTiming`, weekdays, monthly fields, and deadline fields. The weekly-count compatibility format maps the requested offset to the existing legacy notification clock time. All normalized inputs pass through `validateTaskWriteInput`; `TaskService` remains responsible for household scoping and persistence.

The old `create_task` `{ title, date, time }` form remains accepted. If `recurrence` is omitted, the task is created once on `date` (or today when omitted).

`update_task` is partial: it requires `taskId` and accepts only fields to change. `get_task_details` returns the current recurrence, task time, notification, deadline, and assignment before an edit. `delete_task` calls `TaskService.deactivateTask`; it is a logical deactivation, not physical deletion.

Authorization codes last five minutes. Access tokens last 60 minutes. Refresh tokens have a 30-day sliding lifetime and rotate on every refresh; reuse of a used refresh token revokes its grant and token family. OAuth token responses use `Cache-Control: no-store`.

The four scopes are `tasks:read`, `tasks:write`, `shopping:read`, and `shopping:write`. Access tokens are opaque random values; only their SHA-256 hashes are stored. Client secrets are also represented only by SHA-256 hashes. Household access is resolved from the token's user through existing services on every API request.
