# Agent API Phase 2 OAuth (staging)

This implements Muse's OAuth 2.0 Authorization Code flow and Streamable HTTP MCP endpoint for staging. Dynamic Client Registration is not enabled. OAuth and MCP are enabled only when `APP_ENV` is `staging` or `test`.

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
