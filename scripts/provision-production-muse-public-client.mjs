import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MUSE_PUBLIC_CLIENT_ID = "housetodo-muse";
export const MUSE_CONFIDENTIAL_CLIENT_ID = "housetodo-muse-production";
export const MUSE_REDIRECT_URI = "https://agent.meta.ai/api/hatch/oauth/callback";
export const MUSE_ALLOWED_SCOPES = ["tasks:read", "tasks:write", "shopping:read", "shopping:write"];
const DATABASE_ID = "f4877c95-59c1-4e42-9684-5bc51d880aa4";
const DATABASE_NAME = "house-to-do";
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

export const buildPublicClientInsertSql = (now) =>
  `INSERT INTO oauth_clients (client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled, created_at, updated_at) VALUES (${quote(MUSE_PUBLIC_CLIENT_ID)}, 'Muse', NULL, ${quote(JSON.stringify(MUSE_ALLOWED_SCOPES))}, 'none', 1, ${quote(now)}, ${quote(now)}); INSERT INTO oauth_client_redirect_uris (client_id, redirect_uri, created_at) VALUES (${quote(MUSE_PUBLIC_CLIENT_ID)}, ${quote(MUSE_REDIRECT_URI)}, ${quote(now)});`;

export const planPublicClientProvisioning = ({ client, redirectUris }) => {
  if (!client) {
    if (redirectUris.length > 0) throw new Error("A redirect URI exists without its OAuth client; refusing to modify inconsistent state.");
    return "insert";
  }

  const valid = client.client_id === MUSE_PUBLIC_CLIENT_ID &&
    client.client_name === "Muse" &&
    client.client_secret_hash === null &&
    client.allowed_scopes === JSON.stringify(MUSE_ALLOWED_SCOPES) &&
    client.token_endpoint_auth_method === "none" &&
    Number(client.enabled) === 1 &&
    redirectUris.length === 1 &&
    redirectUris[0] === MUSE_REDIRECT_URI;
  if (!valid) throw new Error(`Existing ${MUSE_PUBLIC_CLIENT_ID} does not exactly match the requested public client; refusing to overwrite it.`);
  return "noop";
};

const main = () => {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  if (args.has("--help")) {
    console.log("Usage: node scripts/provision-production-muse-public-client.mjs [--dry-run | --confirm-production]");
    return;
  }
  if (args.has("--dry-run") === args.has("--confirm-production")) {
    throw new Error("Choose exactly one of --dry-run or --confirm-production.");
  }

  const config = JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));
  const production = config.env?.production;
  const productionDb = production?.d1_databases?.find(({ binding }) => binding === "DB");
  const stagingDb = config.env?.staging?.d1_databases?.find(({ binding }) => binding === "DB");
  if (production?.name !== "house-to-do" || productionDb?.database_name !== DATABASE_NAME || productionDb?.database_id !== DATABASE_ID || stagingDb?.database_id === DATABASE_ID) {
    throw new Error("Refusing to continue: Wrangler production/staging D1 configuration does not match the expected production target.");
  }

  const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
  const execute = (sql, json = true) => {
    const commandArgs = [wrangler, "d1", "execute", "DB", "--env", "production", "--remote", "--command", sql];
    commandArgs.push(json ? "--json" : "--yes");
    const result = spawnSync(process.execPath, commandArgs, { cwd: root, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`Production D1 ${json ? "read" : "write"} failed (exit ${result.status ?? "unknown"}); Wrangler output was suppressed.`);
    return result.stdout;
  };
  const readRows = (sql) => {
    let parsed;
    try {
      parsed = JSON.parse(execute(sql));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("Could not parse Wrangler JSON output for production read-only check.");
      throw error;
    }
    const rows = (Array.isArray(parsed) ? parsed : parsed.result)?.flatMap((entry) => entry.results ?? []) ?? [];
    return rows;
  };
  const schema = readRows("PRAGMA table_info(oauth_clients)");
  const secretColumn = schema.find(({ name }) => name === "client_secret_hash");
  const authMethodColumn = schema.find(({ name }) => name === "token_endpoint_auth_method");
  const schemaSql = readRows("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'oauth_clients'")[0]?.sql ?? "";
  if (!secretColumn || Number(secretColumn.notnull) !== 0 || !authMethodColumn || !/^TEXT$/i.test(authMethodColumn.type) || /CHECK\s*\([^)]*token_endpoint_auth_method/i.test(schemaSql)) {
    throw new Error("Production schema cannot store a nullable client_secret_hash and token_endpoint_auth_method; no migration was attempted.");
  }

  const confidentialBefore = readRows(`SELECT client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled, created_at, updated_at FROM oauth_clients WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`);
  if (confidentialBefore.length !== 1) throw new Error(`Expected the existing ${MUSE_CONFIDENTIAL_CLIENT_ID} production Client to remain present; refusing to provision.`);
  const confidentialRedirectsBefore = readRows(`SELECT redirect_uri, created_at FROM oauth_client_redirect_uris WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)} ORDER BY redirect_uri`);
  const confidentialGrantCountBefore = readRows(`SELECT COUNT(*) AS count FROM oauth_grants WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`)[0]?.count;
  const confidentialAccessCountBefore = readRows(`SELECT COUNT(*) AS count FROM oauth_access_tokens WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`)[0]?.count;
  const confidentialRefreshCountBefore = readRows(`SELECT COUNT(*) AS count FROM oauth_refresh_tokens WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`)[0]?.count;

  const existingRows = readRows(`SELECT client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled FROM oauth_clients WHERE client_id = ${quote(MUSE_PUBLIC_CLIENT_ID)}`);
  const redirectRows = readRows(`SELECT redirect_uri FROM oauth_client_redirect_uris WHERE client_id = ${quote(MUSE_PUBLIC_CLIENT_ID)} ORDER BY redirect_uri`);
  const plan = planPublicClientProvisioning({ client: existingRows[0] ?? null, redirectUris: redirectRows.map(({ redirect_uri }) => redirect_uri) });
  if (dryRun) {
    console.log(`Production dry-run passed: schema allows nullable secrets; public Client will ${plan === "insert" ? "be inserted" : "remain unchanged"}.`);
    console.log(`Target: ${DATABASE_NAME} (${DATABASE_ID}); ${MUSE_PUBLIC_CLIENT_ID}; auth method none; Secret absent; exact redirect and scopes.`);
    return;
  }

  if (plan === "insert") {
    const now = new Date().toISOString();
    execute(buildPublicClientInsertSql(now), false);
  }

  const verifiedRows = readRows(`SELECT client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled FROM oauth_clients WHERE client_id = ${quote(MUSE_PUBLIC_CLIENT_ID)}`);
  const verifiedRedirects = readRows(`SELECT redirect_uri FROM oauth_client_redirect_uris WHERE client_id = ${quote(MUSE_PUBLIC_CLIENT_ID)} ORDER BY redirect_uri`);
  planPublicClientProvisioning({ client: verifiedRows[0] ?? null, redirectUris: verifiedRedirects.map(({ redirect_uri }) => redirect_uri) });

  const confidentialAfter = readRows(`SELECT client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled, created_at, updated_at FROM oauth_clients WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`);
  const confidentialRedirectsAfter = readRows(`SELECT redirect_uri, created_at FROM oauth_client_redirect_uris WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)} ORDER BY redirect_uri`);
  const confidentialGrantCountAfter = readRows(`SELECT COUNT(*) AS count FROM oauth_grants WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`)[0]?.count;
  const confidentialAccessCountAfter = readRows(`SELECT COUNT(*) AS count FROM oauth_access_tokens WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`)[0]?.count;
  const confidentialRefreshCountAfter = readRows(`SELECT COUNT(*) AS count FROM oauth_refresh_tokens WHERE client_id = ${quote(MUSE_CONFIDENTIAL_CLIENT_ID)}`)[0]?.count;
  if (JSON.stringify(confidentialBefore) !== JSON.stringify(confidentialAfter) ||
    JSON.stringify(confidentialRedirectsBefore) !== JSON.stringify(confidentialRedirectsAfter) ||
    confidentialGrantCountBefore !== confidentialGrantCountAfter ||
    confidentialAccessCountBefore !== confidentialAccessCountAfter ||
    confidentialRefreshCountBefore !== confidentialRefreshCountAfter) {
    throw new Error(`Verification failed: ${MUSE_CONFIDENTIAL_CLIENT_ID} or its grants/tokens changed. No confidential secret was printed.`);
  }
  console.log(`Production public OAuth Client ${MUSE_PUBLIC_CLIENT_ID} ${plan === "insert" ? "registered" : "already existed and was left unchanged"}; verified Secret absent and ${MUSE_CONFIDENTIAL_CLIENT_ID} unchanged.`);
  console.log(`Client ID=${MUSE_PUBLIC_CLIENT_ID}; Client Name=Muse; auth method=none; Secret absent; enabled=1.`);
  console.log(`Redirect URI=${MUSE_REDIRECT_URI}`);
  console.log(`Allowed scopes=${JSON.stringify(MUSE_ALLOWED_SCOPES)}`);
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production public OAuth provisioning failed.");
    process.exitCode = 1;
  }
}
