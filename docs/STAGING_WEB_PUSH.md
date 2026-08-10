# Staging Web Push setup

This milestone uses only the `staging` Worker. Do not run these commands without the `--env staging` flag.

The Worker implements Web Push `aes128gcm` encryption with the Workers Web Crypto API and VAPID authentication. No third-party push library is required. The private VAPID secret is a JSON P-256 JWK; the public key is the URL-safe base64 raw P-256 key.

Generate files outside this repository. The script prints only the output directory, never secret values:

```powershell
node scripts/generate-vapid-secrets.mjs C:\Users\<you>\house-to-do-staging-secrets mailto:<you@example.com>
```

Register only to the staging Worker. `Get-Content` supplies the value to Wrangler without putting it in the command line or repository:

```powershell
Get-Content -Raw C:\Users\<you>\house-to-do-staging-secrets\WEB_PUSH_VAPID_PUBLIC_KEY | npx wrangler secret put WEB_PUSH_VAPID_PUBLIC_KEY --env staging
Get-Content -Raw C:\Users\<you>\house-to-do-staging-secrets\WEB_PUSH_VAPID_PRIVATE_KEY | npx wrangler secret put WEB_PUSH_VAPID_PRIVATE_KEY --env staging
Get-Content -Raw C:\Users\<you>\house-to-do-staging-secrets\WEB_PUSH_SUBJECT | npx wrangler secret put WEB_PUSH_SUBJECT --env staging
```

Confirm presence only with `npx wrangler secret list --env staging`. Never use `wrangler secret put` without `--env staging` for this milestone.
