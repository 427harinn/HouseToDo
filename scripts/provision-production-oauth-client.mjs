import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const CLIENT_ID = "housetodo-muse-production";
const DATABASE_ID = "f4877c95-59c1-4e42-9684-5bc51d880aa4";
const DATABASE_NAME = "house-to-do";
const REDIRECT_URI = "https://agent.meta.ai/api/hatch/oauth/callback";
const SCOPES = ["tasks:read", "tasks:write", "shopping:read", "shopping:write"];
const STAGING_CLIENT_ID = "housetodo-muse-staging";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));
const production = config.env?.production;
const productionDb = production?.d1_databases?.find(({ binding }) => binding === "DB");
const stagingDb = config.env?.staging?.d1_databases?.find(({ binding }) => binding === "DB");

if (!process.argv.includes("--confirm-production")) {
  console.error("Refusing to provision. Re-run with --confirm-production after reviewing the production D1 target.");
  process.exit(2);
}
if (
  production?.name !== "house-to-do" ||
  productionDb?.database_name !== DATABASE_NAME ||
  productionDb?.database_id !== DATABASE_ID ||
  stagingDb?.database_id === DATABASE_ID
) {
  console.error("Refusing to provision: Wrangler production/staging D1 configuration does not match the expected production target.");
  process.exit(2);
}

const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

const execute = (environment, sql, { json = true } = {}) => {
  const args = [wrangler, "d1", "execute", "DB", "--env", environment, "--remote", "--command", sql];
  if (json) args.push("--json");
  else args.push("--yes");
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    // Do not forward Wrangler output: fail closed and keep generated credentials out of diagnostics.
    throw new Error(`Wrangler D1 ${environment} read/write command failed (exit ${result.status ?? "unknown"}).`);
  }
  return result.stdout;
};

const readRows = (environment, sql) => {
  const output = execute(environment, sql);
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`Could not parse Wrangler JSON output for ${environment} read-only check.`);
  }
  const results = Array.isArray(parsed) ? parsed : parsed.result;
  const rows = results?.flatMap((entry) => entry.results ?? []) ?? [];
  if (rows.length === 0) throw new Error(`Wrangler returned no rows for ${environment} read-only check.`);
  return rows;
};

const stagingSnapshot = () => {
  const rows = readRows("staging", `SELECT client_id, client_name, allowed_scopes, token_endpoint_auth_method, enabled, updated_at, (SELECT COUNT(*) FROM oauth_client_redirect_uris WHERE client_id = '${STAGING_CLIENT_ID}') AS redirect_count FROM oauth_clients WHERE client_id = '${STAGING_CLIENT_ID}'`);
  return JSON.stringify(rows);
};

const productionState = readRows("production", `SELECT (SELECT COUNT(*) FROM oauth_clients) AS client_count, (SELECT COUNT(*) FROM oauth_clients WHERE client_id = '${CLIENT_ID}') AS target_count`)[0];
if (Number(productionState.client_count) !== 0 || Number(productionState.target_count) !== 0) {
  console.error("Refusing to provision: production oauth_clients is not empty. No Client or secret was changed.");
  process.exit(2);
}
const stagingBefore = stagingSnapshot();

const secret = randomBytes(32).toString("base64url");
const secretHash = createHash("sha256").update(secret, "utf8").digest("hex");
const now = new Date().toISOString();
const scopeJson = JSON.stringify(SCOPES);
const insertSql = `INSERT INTO oauth_clients (client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled, created_at, updated_at) VALUES (${quote(CLIENT_ID)}, 'Muse', ${quote(secretHash)}, ${quote(scopeJson)}, 'client_secret_basic', 1, ${quote(now)}, ${quote(now)}); INSERT INTO oauth_client_redirect_uris (client_id, redirect_uri, created_at) VALUES (${quote(CLIENT_ID)}, ${quote(REDIRECT_URI)}, ${quote(now)});`;

try {
  execute("production", insertSql, { json: false });

  const rows = readRows("production", `SELECT c.client_id, c.client_name, c.allowed_scopes, c.token_endpoint_auth_method, c.enabled, length(c.client_secret_hash) AS secret_hash_length, CASE WHEN c.client_secret_hash NOT GLOB '*[^0-9a-f]*' THEN 1 ELSE 0 END AS secret_hash_is_hex, (SELECT COUNT(*) FROM oauth_client_redirect_uris r WHERE r.client_id = c.client_id) AS redirect_count, (SELECT redirect_uri FROM oauth_client_redirect_uris r WHERE r.client_id = c.client_id LIMIT 1) AS redirect_uri FROM oauth_clients c WHERE c.client_id = '${CLIENT_ID}'`);
  const client = rows[0];
  const afterState = readRows("production", "SELECT COUNT(*) AS client_count FROM oauth_clients")[0];
  const expectedScopes = JSON.stringify(SCOPES);
  if (
    client.client_id !== CLIENT_ID ||
    client.client_name !== "Muse" ||
    client.allowed_scopes !== expectedScopes ||
    client.token_endpoint_auth_method !== "client_secret_basic" ||
    Number(client.enabled) !== 1 ||
    Number(client.secret_hash_length) !== 64 ||
    Number(client.secret_hash_is_hex) !== 1 ||
    Number(client.redirect_count) !== 1 ||
    client.redirect_uri !== REDIRECT_URI ||
    Number(afterState.client_count) !== 1
  ) {
    throw new Error("Post-provision verification failed. The generated Client Secret will not be printed.");
  }
  if (stagingSnapshot() !== stagingBefore) {
    throw new Error("Staging OAuth Client state changed unexpectedly. The generated Client Secret will not be printed.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production OAuth provisioning failed. The generated Client Secret will not be printed.");
  process.exit(1);
}

console.log(`Production OAuth Client ${CLIENT_ID} registered and verified. The secret is shown once; copy it directly into the approved Muse secret field now.`);
console.log(`CLIENT_ID=${CLIENT_ID}`);
console.log(`CLIENT_SECRET=${secret}`);
