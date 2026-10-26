# Agent API Phase 1

The Agent API is enabled only when `APP_ENV=staging` (and in tests). Browser routes under `/api/*` continue to use cookie sessions and the existing state-changing Origin check.

## Staging configuration

The staging Worker host from `wrangler.jsonc` is `https://house-to-do-staging.427harinn.workers.dev`.

1. Create or use the personal account in staging and create/join its household. Sign in and read the user's `id` from `GET /api/auth/me`; set this as `AGENT_API_USER_ID`.
2. Generate a unique token locally, for example in PowerShell:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```

3. From the repository root, add each value as a staging Worker secret. Wrangler prompts for the value; do not put secret values in command arguments or commit them:

   ```powershell
   npx wrangler secret put AGENT_API_TOKEN --env staging
   npx wrangler secret put AGENT_API_USER_ID --env staging
   ```

4. Deploy only to staging:

   ```powershell
   npm run cf:deploy:staging:dry-run
   npx wrangler deploy --env staging
   ```

No database migration is required. Do not run a production deploy or set production secrets for Phase 1.

## Requests

Send `Authorization: Bearer <AGENT_API_TOKEN>` and `Content-Type: application/json` for POST requests. Do not send the token in URLs or log it. Responses use the standard `{ "ok": true, "data": ..., "requestId": ... }` envelope.

```http
GET /api/agent/tasks/today
GET /api/agent/tasks?date=2026-10-24
POST /api/agent/tasks
{ "title": "ゴミ出し", "date": "2026-10-24", "time": "19:00" }
POST /api/agent/tasks/{taskId}/complete
{ "targetDate": "2026-10-24" }
GET /api/agent/shopping
POST /api/agent/shopping
{ "name": "牛乳", "quantity": "1本", "note": null, "plannedPurchaseDate": null }
POST /api/agent/shopping/{itemId}/purchase
{}
```

Task completion requires the occurrence `targetDate`; flexible tasks may also need `calendarDate` when their selected calendar date differs. Item and task lookup remains scoped to the configured user's current household by the existing services.
