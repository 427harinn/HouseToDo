import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const redirectUri = process.env.MUSE_OAUTH_REDIRECT_URI;
if (!redirectUri) {
  console.error("Set MUSE_OAUTH_REDIRECT_URI to the exact HTTPS URI shown by Muse.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(redirectUri);
} catch {
  console.error("MUSE_OAUTH_REDIRECT_URI must be an absolute HTTPS URI.");
  process.exit(1);
}
if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
  console.error("MUSE_OAUTH_REDIRECT_URI must use HTTPS and must not contain credentials or a fragment.");
  process.exit(1);
}

const clientId = "housetodo-muse-staging";
const clientSecret = randomBytes(32).toString("base64url");
const secretHash = createHash("sha256").update(clientSecret, "utf8").digest("hex");
const sqlText = (value) => `'${value.replaceAll("'", "''")}'`;
const now = new Date().toISOString();
const allowedScopes = JSON.stringify(["tasks:read", "tasks:write", "shopping:read", "shopping:write"]);
const sql = `INSERT INTO oauth_clients (client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled, created_at, updated_at) VALUES (${sqlText(clientId)}, 'Muse', ${sqlText(secretHash)}, ${sqlText(allowedScopes)}, 'client_secret_basic', 1, ${sqlText(now)}, ${sqlText(now)}) ON CONFLICT(client_id) DO UPDATE SET client_secret_hash = excluded.client_secret_hash, allowed_scopes = excluded.allowed_scopes, token_endpoint_auth_method = excluded.token_endpoint_auth_method, enabled = 1, updated_at = excluded.updated_at; INSERT OR IGNORE INTO oauth_client_redirect_uris (client_id, redirect_uri, created_at) VALUES (${sqlText(clientId)}, ${sqlText(redirectUri)}, ${sqlText(now)});`;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const result = spawnSync(process.execPath, [
  wrangler,
  "d1",
  "execute",
  "DB",
  "--env",
  "staging",
  "--remote",
  "--command",
  sql
], { cwd: root, encoding: "utf8", windowsHide: true });

if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stderr.write(result.stdout);
  console.error("Staging OAuth client provisioning failed. The secret was not printed.");
  process.exit(result.status ?? 1);
}

console.log("Staging OAuth client provisioned. Save the client secret now; it cannot be recovered.");
console.log(JSON.stringify({ client_id: clientId, client_secret: clientSecret }, null, 2));
