import { generateOpaqueToken, sha256Hex } from "../lib/crypto";
import { nowIso } from "../lib/date";
import { AuthService, avatarUrlFor } from "./auth-service";
import { HouseholdService } from "./household-service";
import { UserRepository } from "../repositories/user-repository";
import type { AuthenticatedUser } from "../types/api";
import type { Env } from "../types/env";

export const OAUTH_SCOPES = [
  "tasks:read",
  "tasks:write",
  "shopping:read",
  "shopping:write"
] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];
export type TokenEndpointAuthMethod = "client_secret_basic" | "none";

export const OAUTH_ACCESS_TTL_SECONDS = 60 * 60;
export const OAUTH_REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;
export const OAUTH_TRANSACTION_TTL_SECONDS = 15 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const AUTHORIZATION_COMPLETION_TTL_SECONDS = 2 * 60;
const encoder = new TextEncoder();

type ClientRow = {
  client_id: string;
  client_name: string;
  client_secret_hash: string | null;
  allowed_scopes: string;
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  enabled: number;
};

type TransactionRow = {
  transaction_hash: string;
  client_id: string;
  user_id: string | null;
  redirect_uri: string;
  requested_scope: string;
  state: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  resource: string | null;
  csrf_token: string;
  expires_at: string;
  consumed_at: string | null;
};

type CodeRow = {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  resource: string | null;
  expires_at: string;
  consumed_at: string | null;
};

type CompletionRow = {
  completion_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  resource: string | null;
  expires_at: string;
  consumed_at: string | null;
};

type RefreshRow = {
  token_hash: string;
  grant_id: string;
  client_id: string;
  user_id: string;
  scope: string;
  resource: string | null;
  family_id: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  grant_revoked_at: string | null;
};

export type OAuthUser = AuthenticatedUser;
export type TokenPrincipal = {
  user: OAuthUser;
  scopes: Set<string>;
  clientId: string;
  resource: string | null;
};

export type UserOAuthGrant = {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  connectedAt: string;
};

export type OAuthDebugRecord = {
  path: string;
  method: string;
  statePresent: boolean;
  scopePresent: boolean;
  responseType: string | null;
  pkcePresent: boolean;
  clientAuthMethod: "basic" | "post" | "none" | "missing";
  clientId: string | null;
  clientFound: boolean;
  secretPresent: boolean;
  secretLength: number;
  secretHashMatches: boolean;
  grantType: string | null;
  redirectUri: string | null;
  scope: string | null;
  failure: string | null;
};

export class OAuthError extends Error {
  constructor(
    readonly oauthCode: string,
    message = oauthCode,
    readonly status = 400,
    readonly authenticate = false
  ) {
    super(message);
  }
}

const isoAfter = (seconds: number, now = new Date()): string =>
  new Date(now.getTime() + seconds * 1000).toISOString();

const equalSecret = (left: string, right: string): boolean => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1)
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
};

const parseScopes = (scope: string): string[] =>
  [...new Set(scope.trim().split(/\s+/).filter(Boolean))];

const parseAllowedScopes = (serialized: string): string[] => {
  try {
    const value: unknown = JSON.parse(serialized);
    return Array.isArray(value) && value.every((item) => typeof item === "string")
      ? value
      : [];
  } catch {
    return [];
  }
};

const constantTimeHashMatches = async (provided: string, stored: string): Promise<boolean> =>
  equalSecret(await sha256Hex(provided), stored);

const encodeBasicPart = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );

const decodeBasic = (header: string): { clientId: string; secret: string } | null => {
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const text = new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0))
    );
    const colon = text.indexOf(":");
    if (colon < 0) return null;
    return {
      clientId: decodeURIComponent(text.slice(0, colon)),
      secret: decodeURIComponent(text.slice(colon + 1))
    };
  } catch {
    return null;
  }
};

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const pkceChallenge = async (verifier: string): Promise<string> =>
  base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));

const readJsonScopes = (scope: string): Set<string> => new Set(parseScopes(scope));

export class OAuthService {
  constructor(private readonly env: Env, private readonly debug?: OAuthDebugRecord) {}

  private get db(): D1Database {
    return this.env.DB;
  }

  static isEnabled(env: Env): boolean {
    return env.APP_ENV === "production" || env.APP_ENV === "staging" || env.APP_ENV === "test";
  }

  private assertEnabled(): void {
    if (!OAuthService.isEnabled(this.env)) throw new OAuthError("server_error", "OAuth is unavailable", 404);
  }

  getIssuer(): string {
    const configured = this.env.OAUTH_ISSUER_URL?.trim();
    if (configured) return configured.replace(/\/$/, "");
    if (this.env.APP_ENV === "production") return "https://house-to-do.427harinn.workers.dev";
    if (this.env.APP_ENV === "staging") return "https://house-to-do-staging.427harinn.workers.dev";
    return "https://example.test";
  }

  private mcpResource(origin: string): string {
    return `${this.getIssuer() || origin}/mcp`;
  }

  async getCurrentUser(request: Request): Promise<OAuthUser | null> {
    try {
      return await new AuthService(this.db).authenticateRequest(request);
    } catch {
      return null;
    }
  }

  async listUserGrants(userId: string): Promise<UserOAuthGrant[]> {
    const result = await this.db.prepare(
      `SELECT g.id AS grant_id, g.client_id, c.client_name, g.scope, g.created_at
       FROM oauth_grants g
       INNER JOIN oauth_clients c ON c.client_id = g.client_id
       WHERE g.user_id = ? AND g.revoked_at IS NULL AND c.enabled = 1
       ORDER BY g.created_at DESC, g.id`
    ).bind(userId).all<{
      grant_id: string;
      client_id: string;
      client_name: string;
      scope: string;
      created_at: string;
    }>();
    return (result.results ?? []).map((row) => ({
      grantId: row.grant_id,
      clientId: row.client_id,
      clientName: row.client_name,
      scopes: parseScopes(row.scope),
      connectedAt: row.created_at
    }));
  }

  async revokeUserGrant(userId: string, grantId: string): Promise<boolean> {
    const grant = await this.db.prepare(
      "SELECT id FROM oauth_grants WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
    ).bind(grantId, userId).first<{ id: string }>();
    if (!grant) return false;
    await this.revokeGrant(grant.id);
    return true;
  }

  async authenticateClient(request: Request, form = new URLSearchParams()): Promise<ClientRow> {
    this.assertEnabled();
    const authorization = request.headers.get("authorization") ?? "";
    const credentials = decodeBasic(authorization);
    if (this.debug) {
      if (/^basic\b/i.test(authorization)) this.debug.clientAuthMethod = "basic";
      else if (this.debug.secretPresent) this.debug.clientAuthMethod = "post";
      else if (this.debug.clientId) this.debug.clientAuthMethod = "none";
      else this.debug.clientAuthMethod = authorization ? "none" : "missing";
    }
    const bodyClientId = form.get("client_id") ?? "";
    const bodySecret = form.get("client_secret") ?? "";
    if (bodySecret) {
      if (this.debug) this.debug.failure = "client_secret_post_unsupported";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    if (!credentials && !bodyClientId) {
      if (this.debug) this.debug.failure = authorization ? "client_auth_parse" : "client_auth_missing";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    if (credentials && bodyClientId && credentials.clientId !== bodyClientId) {
      if (this.debug) this.debug.failure = "client_id_mismatch";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    const clientId = credentials?.clientId ?? bodyClientId;
    if (this.debug) {
      this.debug.clientId = clientId.slice(0, 256);
      this.debug.secretPresent = Boolean(credentials?.secret);
      this.debug.secretLength = credentials?.secret.length ?? 0;
    }
    const client = await this.db
      .prepare(
        "SELECT client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled FROM oauth_clients WHERE client_id = ?"
      )
      .bind(clientId)
      .first<ClientRow>();
    if (this.debug) this.debug.clientFound = Boolean(client);
    if (!client) {
      if (this.debug) this.debug.failure = "client_not_found";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    if (client.enabled !== 1) {
      if (this.debug) this.debug.failure = "client_disabled";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    if (client.token_endpoint_auth_method !== "client_secret_basic" && client.token_endpoint_auth_method !== "none") {
      if (this.debug) this.debug.failure = "client_auth_method_mismatch";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    if (client.token_endpoint_auth_method === "none") {
      if (authorization || credentials || client.client_secret_hash) {
        if (this.debug) this.debug.failure = "public_client_auth_mismatch";
        throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
      }
      return client;
    }
    if (!credentials) {
      if (this.debug) this.debug.failure = "client_auth_missing";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    const hashMatches = Boolean(client.client_secret_hash) &&
      await constantTimeHashMatches(credentials.secret, client.client_secret_hash ?? "");
    if (this.debug) this.debug.secretHashMatches = hashMatches;
    if (!hashMatches) {
      if (this.debug) this.debug.failure = "client_secret_mismatch";
      throw new OAuthError("invalid_client", "Client authentication failed", 401, true);
    }
    return client;
  }

  async createAuthorizationTransaction(url: URL): Promise<{
    transactionId: string;
    clientName: string;
    requestedScopes: string[];
  }> {
    this.assertEnabled();
    const responseType = url.searchParams.get("response_type");
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const state = url.searchParams.get("state");
    const rawScopes = url.searchParams.get("scope") ?? "";
    const scopeList = parseScopes(rawScopes);
    if (this.debug) {
      this.debug.clientId = clientId.slice(0, 256);
      this.debug.redirectUri = redirectUri.slice(0, 2048);
      this.debug.scope = scopeList.join(" ").slice(0, 256);
    }
    if (responseType !== "code") {
      if (this.debug) this.debug.failure = "response_type_invalid";
      throw new OAuthError("unsupported_response_type");
    }
    if (!state || state.length > 1024) {
      if (this.debug) this.debug.failure = "state_validation";
      throw new OAuthError("invalid_request", "state is required");
    }
    const client = await this.db
      .prepare(
        "SELECT client_id, client_name, client_secret_hash, allowed_scopes, token_endpoint_auth_method, enabled FROM oauth_clients WHERE client_id = ?"
      )
      .bind(clientId)
      .first<ClientRow>();
    if (this.debug) this.debug.clientFound = Boolean(client);
    if (!client || client.enabled !== 1) {
      if (this.debug) this.debug.failure = client ? "client_disabled" : "client_not_found";
      throw new OAuthError("unauthorized_client");
    }
    if (client.token_endpoint_auth_method !== "client_secret_basic" && client.token_endpoint_auth_method !== "none") {
      if (this.debug) this.debug.failure = "client_auth_method_mismatch";
      throw new OAuthError("unauthorized_client");
    }
    const redirect = await this.db
      .prepare(
        "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE client_id = ? AND redirect_uri = ?"
      )
      .bind(clientId, redirectUri)
      .first<{ redirect_uri: string }>();
    if (!redirect) {
      if (this.debug) this.debug.failure = "redirect_uri_mismatch";
      throw new OAuthError("invalid_request", "redirect_uri mismatch");
    }
    const allowed = new Set(parseAllowedScopes(client.allowed_scopes));
    const supportedScopes = new Set<string>(OAUTH_SCOPES);
    if (scopeList.length === 0 || scopeList.some((scope) => !allowed.has(scope) || !supportedScopes.has(scope))) {
      if (this.debug) this.debug.failure = "scope_validation";
      throw new OAuthError("invalid_scope");
    }

    const challenge = url.searchParams.get("code_challenge");
    const challengeMethod = url.searchParams.get("code_challenge_method");
    if (client.token_endpoint_auth_method === "none" && (!challenge || challengeMethod !== "S256")) {
      if (this.debug) this.debug.failure = "pkce_required";
      throw new OAuthError("invalid_request", "Public clients must use S256 PKCE");
    }
    if ((challenge && challengeMethod !== "S256") || (!challenge && challengeMethod)) {
      if (this.debug) this.debug.failure = "pkce_method_validation";
      throw new OAuthError("invalid_request", "Only S256 PKCE is supported");
    }
    if (challenge && !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      if (this.debug) this.debug.failure = "pkce_challenge_validation";
      throw new OAuthError("invalid_request", "Invalid code_challenge");
    }
    const resource = url.searchParams.get("resource");
    if (resource && (resource.length > 2048 || !/^https:\/\//i.test(resource))) {
      if (this.debug) this.debug.failure = "resource_validation";
      throw new OAuthError("invalid_target");
    }
    if (resource && resource !== this.mcpResource(url.origin)) {
      if (this.debug) this.debug.failure = "resource_mismatch";
      throw new OAuthError("invalid_target");
    }

    const transactionId = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO oauth_authorization_transactions
          (transaction_hash, client_id, user_id, redirect_uri, requested_scope, state,
           code_challenge, code_challenge_method, resource, csrf_token, expires_at, consumed_at, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .bind(
        await sha256Hex(transactionId),
        clientId,
        redirectUri,
        scopeList.join(" "),
        state,
        challenge,
        challenge ? "S256" : null,
        resource,
        csrfToken,
        isoAfter(OAUTH_TRANSACTION_TTL_SECONDS),
        now
      )
      .run();
    return { transactionId, clientName: client.client_name, requestedScopes: scopeList };
  }

  async loadTransaction(transactionId: string): Promise<{
    row: TransactionRow;
    csrfToken: string;
    clientName: string;
  } | null> {
    this.assertEnabled();
    const row = await this.db
      .prepare(
        `SELECT transaction_hash, client_id, user_id, redirect_uri, requested_scope, state,
                code_challenge, code_challenge_method, resource, csrf_token, expires_at, consumed_at
         FROM oauth_authorization_transactions
         WHERE transaction_hash = ? AND expires_at > ? AND consumed_at IS NULL`
      )
      .bind(await sha256Hex(transactionId), nowIso())
      .first<TransactionRow>();
    if (!row) return null;
    const csrfToken = row.csrf_token;
    const client = await this.db
      .prepare("SELECT client_name FROM oauth_clients WHERE client_id = ? AND enabled = 1")
      .bind(row.client_id)
      .first<{ client_name: string }>();
    if (!client) return null;
    return { row, csrfToken, clientName: client.client_name };
  }

  async findTransactionForPost(transactionId: string): Promise<TransactionRow | null> {
    this.assertEnabled();
    return this.db
      .prepare(
        `SELECT transaction_hash, client_id, user_id, redirect_uri, requested_scope, state,
                code_challenge, code_challenge_method, resource, csrf_token, expires_at, consumed_at
         FROM oauth_authorization_transactions
         WHERE transaction_hash = ? AND expires_at > ? AND consumed_at IS NULL`
      )
      .bind(await sha256Hex(transactionId), nowIso())
      .first<TransactionRow>();
  }

  async bindTransactionToUser(transactionId: string, userId: string): Promise<boolean> {
    this.assertEnabled();
    const result = await this.db.prepare(
      `UPDATE oauth_authorization_transactions SET user_id = ?
       WHERE transaction_hash = ? AND expires_at > ? AND consumed_at IS NULL
         AND (user_id IS NULL OR user_id = ?)`
    ).bind(userId, await sha256Hex(transactionId), nowIso(), userId).run();
    return (result.meta?.changes ?? 0) === 1;
  }

  async validateConsentTransaction(transaction: TransactionRow): Promise<boolean> {
    this.assertEnabled();
    const client = await this.db.prepare(
      "SELECT allowed_scopes, enabled FROM oauth_clients WHERE client_id = ?"
    ).bind(transaction.client_id).first<{ allowed_scopes: string; enabled: number }>();
    if (!client || client.enabled !== 1) return false;

    const redirect = await this.db.prepare(
      "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE client_id = ? AND redirect_uri = ?"
    ).bind(transaction.client_id, transaction.redirect_uri).first<{ redirect_uri: string }>();
    if (!redirect || redirect.redirect_uri !== transaction.redirect_uri) return false;

    const scopes = transaction.requested_scope.split(" ").filter(Boolean);
    const allowedScopes = new Set(parseAllowedScopes(client.allowed_scopes));
    const supportedScopes = new Set<string>(OAUTH_SCOPES);
    return scopes.length > 0 && new Set(scopes).size === scopes.length &&
      scopes.every((scope) => supportedScopes.has(scope) && allowedScopes.has(scope));
  }

  async consumeTransaction(transaction: TransactionRow, userId: string): Promise<boolean> {
    this.assertEnabled();
    const result = await this.db.prepare(
      `UPDATE oauth_authorization_transactions SET consumed_at = ?
       WHERE transaction_hash = ? AND user_id = ? AND consumed_at IS NULL AND expires_at > ?`
    ).bind(nowIso(), transaction.transaction_hash, userId, nowIso()).run();
    return (result.meta?.changes ?? 0) === 1;
  }

  validateCsrf(candidate: string, storedToken: string): boolean {
    return Boolean(candidate) && equalSecret(candidate, storedToken);
  }

  async createAuthorizationCompletion(transaction: TransactionRow, userId: string): Promise<string> {
    this.assertEnabled();
    const completionHandle = generateOpaqueToken();
    const now = nowIso();
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO oauth_authorization_completions
          (completion_hash, client_id, user_id, redirect_uri, scope, state, code_challenge,
           code_challenge_method, resource, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      ).bind(
        await sha256Hex(completionHandle), transaction.client_id, userId, transaction.redirect_uri,
        transaction.requested_scope, transaction.state, transaction.code_challenge,
        transaction.code_challenge_method, transaction.resource,
        isoAfter(AUTHORIZATION_COMPLETION_TTL_SECONDS), now
      ),
      this.db.prepare("DELETE FROM oauth_authorization_transactions WHERE transaction_hash = ?")
        .bind(transaction.transaction_hash)
    ]);
    return completionHandle;
  }

  async canContinueAuthorization(handle: string): Promise<boolean> {
    this.assertEnabled();
    return (await this.findValidAuthorizationCompletion(handle)) !== null;
  }

  private async findValidAuthorizationCompletion(handle: string): Promise<CompletionRow | null> {
    if (!handle || handle.length > 128) return null;
    const completionHash = await sha256Hex(handle);
    const completion = await this.db.prepare(
      `SELECT completion_hash, client_id, user_id, redirect_uri, scope, state, code_challenge,
              code_challenge_method, resource, expires_at, consumed_at
       FROM oauth_authorization_completions
       WHERE completion_hash = ? AND expires_at > ? AND consumed_at IS NULL`
    ).bind(completionHash, nowIso()).first<CompletionRow>();
    if (!completion) return null;

    const client = await this.db.prepare(
      "SELECT allowed_scopes, enabled FROM oauth_clients WHERE client_id = ?"
    ).bind(completion.client_id).first<{ allowed_scopes: string; enabled: number }>();
    const registeredRedirect = await this.db.prepare(
      "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE client_id = ? AND redirect_uri = ?"
    ).bind(completion.client_id, completion.redirect_uri).first<{ redirect_uri: string }>();
    const allowedScopes = new Set(client ? parseAllowedScopes(client.allowed_scopes) : []);
    const scopes = parseScopes(completion.scope);
    if (!client || client.enabled !== 1 || !registeredRedirect ||
      registeredRedirect.redirect_uri !== completion.redirect_uri || !scopes.length ||
      scopes.some((scope) => !OAUTH_SCOPES.includes(scope as OAuthScope) || !allowedScopes.has(scope)) ||
      !await new HouseholdService(this.db).getCurrentHousehold(completion.user_id)) return null;
    return completion;
  }

  async completeAuthorization(handle: string): Promise<{
    redirectUri: string;
    state: string;
    code: string;
  } | null> {
    this.assertEnabled();
    const completion = await this.findValidAuthorizationCompletion(handle);
    if (!completion) return null;

    const code = generateOpaqueToken();
    const codeHash = await sha256Hex(code);
    const consumedAt = nowIso();
    const completionHash = completion.completion_hash;
    const result = await this.db.batch([
      this.db.prepare(
        `UPDATE oauth_authorization_completions SET consumed_at = ?
         WHERE completion_hash = ? AND consumed_at IS NULL AND expires_at > ?`
      ).bind(consumedAt, completionHash, consumedAt),
      this.db.prepare(
        `INSERT INTO oauth_authorization_codes
          (code_hash, client_id, user_id, redirect_uri, scope, code_challenge,
           code_challenge_method, resource, expires_at, consumed_at, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?
         WHERE EXISTS (
           SELECT 1 FROM oauth_authorization_completions
           WHERE completion_hash = ? AND consumed_at = ?
         )`
      ).bind(
        codeHash, completion.client_id, completion.user_id, completion.redirect_uri, completion.scope,
        completion.code_challenge, completion.code_challenge_method, completion.resource,
        isoAfter(AUTHORIZATION_CODE_TTL_SECONDS), consumedAt, completionHash, consumedAt
      )
    ]);
    if ((result[0]?.meta?.changes ?? 0) !== 1 || (result[1]?.meta?.changes ?? 0) !== 1) return null;
    return { redirectUri: completion.redirect_uri, state: completion.state, code };
  }

  async exchangeToken(request: Request, form: URLSearchParams): Promise<Response> {
    if (this.debug) {
      this.debug.grantType = (form.get("grant_type") ?? "").slice(0, 64) || null;
      this.debug.redirectUri = (form.get("redirect_uri") ?? "").slice(0, 2048) || null;
      this.debug.scope = (form.get("scope") ?? "").slice(0, 256) || null;
      this.debug.clientId = (form.get("client_id") ?? "").slice(0, 256) || null;
      const secret = form.get("client_secret") ?? "";
      this.debug.secretPresent = secret.length > 0;
      this.debug.secretLength = secret.length;
    }
    const client = await this.authenticateClient(request, form);
    const grantType = form.get("grant_type");
    if (grantType === "authorization_code") return this.exchangeCode(client, form, request);
    if (grantType === "refresh_token") return this.rotateRefreshToken(client, form, request);
    if (this.debug) this.debug.failure = grantType ? "grant_type_unsupported" : "grant_type_missing";
    throw new OAuthError("unsupported_grant_type");
  }

  private async exchangeCode(client: ClientRow, form: URLSearchParams, request: Request): Promise<Response> {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    if (!code || !redirectUri) {
      if (this.debug) this.debug.failure = "authorization_code_request_validation";
      throw new OAuthError("invalid_request");
    }
    const codeHash = await sha256Hex(code);
    const requestedResource = form.get("resource");
    if (requestedResource && requestedResource !== this.mcpResource(new URL(request.url).origin)) {
      if (this.debug) this.debug.failure = "token_resource_mismatch";
      throw new OAuthError("invalid_target");
    }
    const row = await this.db
      .prepare(
        `SELECT code_hash, client_id, user_id, redirect_uri, scope, code_challenge,
                code_challenge_method, resource, expires_at, consumed_at
         FROM oauth_authorization_codes WHERE code_hash = ?`
      )
      .bind(codeHash)
      .first<CodeRow>();
    const now = nowIso();
    if (
      !row || row.client_id !== client.client_id || row.redirect_uri !== redirectUri ||
      row.expires_at <= now || row.consumed_at
    ) {
      if (this.debug) {
        this.debug.failure = !row ? "authorization_code_not_found"
          : row.client_id !== client.client_id ? "authorization_code_client_mismatch"
          : row.redirect_uri !== redirectUri ? "authorization_code_redirect_uri_mismatch"
          : row.expires_at <= now ? "authorization_code_expired"
          : "authorization_code_already_used";
      }
      throw new OAuthError("invalid_grant");
    }
    if ((row.resource && row.resource !== this.mcpResource(new URL(request.url).origin)) ||
        (requestedResource && row.resource && requestedResource !== row.resource)) {
      if (this.debug) this.debug.failure = "authorization_code_resource_mismatch";
      throw new OAuthError("invalid_target");
    }
    if (row.code_challenge || client.token_endpoint_auth_method === "none") {
      const verifier = form.get("code_verifier") ?? "";
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || (await pkceChallenge(verifier)) !== row.code_challenge) {
        if (this.debug) this.debug.failure = "pkce_verification";
        throw new OAuthError("invalid_grant");
      }
    }
    const consumed = await this.db
      .prepare(
        "UPDATE oauth_authorization_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?"
      )
      .bind(now, codeHash, now)
      .run();
    if ((consumed.meta.changes ?? 0) !== 1) {
      if (this.debug) this.debug.failure = "authorization_code_reuse";
      throw new OAuthError("invalid_grant");
    }

    const user = await new UserRepository(this.db).findById(row.user_id);
    if (!user) {
      if (this.debug) this.debug.failure = "authorization_code_user_missing";
      throw new OAuthError("invalid_grant");
    }
    const authenticatedUser: OAuthUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: avatarUrlFor(user.id, user)
    };
    const grantId = crypto.randomUUID();
    await this.db.prepare(
      "INSERT INTO oauth_grants (id, user_id, client_id, scope, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)"
    ).bind(grantId, user.id, client.client_id, row.scope, now).run();
    return this.createTokenResponse({
      grantId,
      clientId: client.client_id,
      userId: authenticatedUser.id,
      scope: row.scope,
      resource: requestedResource ?? row.resource,
      familyId: crypto.randomUUID()
    });
  }

  private async rotateRefreshToken(client: ClientRow, form: URLSearchParams, request: Request): Promise<Response> {
    const token = form.get("refresh_token") ?? "";
    if (!token) {
      if (this.debug) this.debug.failure = "refresh_token_missing";
      throw new OAuthError("invalid_request");
    }
    const requestedResource = form.get("resource");
    if (requestedResource && requestedResource !== this.mcpResource(new URL(request.url).origin)) {
      if (this.debug) this.debug.failure = "refresh_resource_mismatch";
      throw new OAuthError("invalid_target");
    }
    const tokenHash = await sha256Hex(token);
    const row = await this.db
      .prepare(
        `SELECT r.token_hash, r.grant_id, r.client_id, r.user_id, r.scope, r.resource,
                r.family_id, r.expires_at, r.used_at, r.revoked_at, g.revoked_at AS grant_revoked_at
         FROM oauth_refresh_tokens r
         LEFT JOIN oauth_grants g ON g.id = r.grant_id
         WHERE r.token_hash = ?`
      )
      .bind(tokenHash)
      .first<RefreshRow>();
    if (!row || row.client_id !== client.client_id || row.grant_revoked_at || row.revoked_at) {
      if (this.debug) this.debug.failure = !row ? "refresh_token_not_found"
        : row.client_id !== client.client_id ? "refresh_token_client_mismatch"
        : "refresh_token_revoked";
      throw new OAuthError("invalid_grant");
    }
    if ((row.resource && row.resource !== this.mcpResource(new URL(request.url).origin)) ||
        (requestedResource && row.resource && requestedResource !== row.resource)) {
      if (this.debug) this.debug.failure = "refresh_resource_mismatch";
      throw new OAuthError("invalid_target");
    }
    if (row.used_at) {
      await this.revokeGrant(row.grant_id);
      if (this.debug) this.debug.failure = "refresh_token_reuse";
      throw new OAuthError("invalid_grant");
    }
    const now = nowIso();
    if (row.expires_at <= now) {
      if (this.debug) this.debug.failure = "refresh_token_expired";
      throw new OAuthError("invalid_grant");
    }
    const consumed = await this.db
      .prepare(
        "UPDATE oauth_refresh_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?"
      )
      .bind(now, tokenHash, now)
      .run();
    if ((consumed.meta.changes ?? 0) !== 1) {
      await this.revokeGrant(row.grant_id);
      if (this.debug) this.debug.failure = "refresh_token_reuse";
      throw new OAuthError("invalid_grant");
    }
    const nextTokens = await this.createTokenResponse({
      grantId: row.grant_id,
      clientId: row.client_id,
      userId: row.user_id,
      scope: row.scope,
      resource: requestedResource ?? row.resource,
      familyId: row.family_id
    });
    const responseBody: unknown = await nextTokens.clone().json();
    const replacement =
      typeof responseBody === "object" && responseBody !== null &&
      "refresh_token" in responseBody && typeof responseBody.refresh_token === "string"
        ? responseBody.refresh_token
        : "";
    await this.db.prepare(
      "UPDATE oauth_refresh_tokens SET replaced_by_hash = ? WHERE token_hash = ?"
    ).bind(await sha256Hex(replacement), tokenHash).run();
    return nextTokens;
  }

  private async createTokenResponse(input: {
    grantId: string;
    clientId: string;
    userId: string;
    scope: string;
    resource: string | null;
    familyId: string;
  }): Promise<Response> {
    const accessToken = generateOpaqueToken();
    const refreshToken = generateOpaqueToken();
    const now = nowIso();
    const accessExpiresAt = isoAfter(OAUTH_ACCESS_TTL_SECONDS);
    const refreshExpiresAt = isoAfter(OAUTH_REFRESH_TTL_SECONDS);
    await this.db.prepare(
      `INSERT INTO oauth_access_tokens
        (token_hash, grant_id, client_id, user_id, scope, resource, expires_at, revoked_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    ).bind(
      await sha256Hex(accessToken), input.grantId, input.clientId, input.userId,
      input.scope, input.resource, accessExpiresAt, now
    ).run();
    await this.db.prepare(
      `INSERT INTO oauth_refresh_tokens
        (token_hash, grant_id, client_id, user_id, scope, resource, family_id,
         expires_at, used_at, revoked_at, replaced_by_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`
    ).bind(
      await sha256Hex(refreshToken), input.grantId, input.clientId, input.userId,
      input.scope, input.resource, input.familyId, refreshExpiresAt, now
    ).run();
    return new Response(JSON.stringify({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: OAUTH_ACCESS_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: input.scope
    }), { status: 200, headers: tokenHeaders() });
  }

  async authenticateAccessToken(token: string): Promise<TokenPrincipal | null> {
    this.assertEnabled();
    const row = await this.db
      .prepare(
        `SELECT t.user_id, t.client_id, t.scope, t.expires_at, t.revoked_at, t.resource,
                g.revoked_at AS grant_revoked_at, c.enabled
         FROM oauth_access_tokens t
         INNER JOIN oauth_grants g ON g.id = t.grant_id
         INNER JOIN oauth_clients c ON c.client_id = t.client_id
         WHERE t.token_hash = ?`
      )
      .bind(await sha256Hex(token))
      .first<{
        user_id: string; client_id: string; scope: string; expires_at: string; revoked_at: string | null;
        resource: string | null; grant_revoked_at: string | null; enabled: number;
      }>();
    if (!row || row.expires_at <= nowIso() || row.revoked_at || row.grant_revoked_at || row.enabled !== 1)
      return null;
    const user = await new UserRepository(this.db).findById(row.user_id);
    if (!user) return null;
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: avatarUrlFor(user.id, user)
      },
      scopes: readJsonScopes(row.scope),
      clientId: row.client_id,
      resource: row.resource
    };
  }

  async revoke(request: Request, form: URLSearchParams): Promise<Response> {
    const client = await this.authenticateClient(request, form);
    const token = form.get("token") ?? "";
    if (token) {
      const tokenHash = await sha256Hex(token);
      const refresh = await this.db.prepare(
        "SELECT grant_id FROM oauth_refresh_tokens WHERE token_hash = ? AND client_id = ?"
      ).bind(tokenHash, client.client_id).first<{ grant_id: string }>();
      if (refresh) await this.revokeGrant(refresh.grant_id);
      await this.db.prepare(
        "UPDATE oauth_access_tokens SET revoked_at = ? WHERE token_hash = ? AND client_id = ? AND revoked_at IS NULL"
      ).bind(nowIso(), tokenHash, client.client_id).run();
    }
    return new Response(null, { status: 200, headers: tokenHeaders() });
  }

  private async revokeGrant(grantId: string): Promise<void> {
    const now = nowIso();
    await this.db.batch([
      this.db.prepare("UPDATE oauth_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, grantId),
      this.db.prepare("UPDATE oauth_access_tokens SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL").bind(now, grantId),
      this.db.prepare("UPDATE oauth_refresh_tokens SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL").bind(now, grantId)
    ]);
  }

}

export const tokenHeaders = (): Headers => new Headers({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff"
});

export const encodeClientCredentials = (clientId: string, secret: string): string =>
  `Basic ${btoa(`${encodeBasicPart(clientId)}:${encodeBasicPart(secret)}`)}`;
