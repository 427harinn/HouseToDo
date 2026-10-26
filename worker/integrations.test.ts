import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { sha256Hex } from "./lib/crypto";
import { encodeClientCredentials, OAuthService, OAUTH_SCOPES } from "./services/oauth-service";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";

const ORIGIN = "https://example.test";
const CLIENT_ID = "housetodo-muse-staging";
const CLIENT_SECRET = "integration-test-client-secret";

const envFor = async (): Promise<Env> => {
  const db = new MemoryD1();
  const env = {
    DB: db as unknown as D1Database,
    ATTACHMENTS: new MemoryR2(),
    ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
    APP_ENV: "test",
    ALLOWED_ORIGINS: ORIGIN,
    OAUTH_ISSUER_URL: ORIGIN
  } as unknown as Env;
  (db as unknown as MemoryD1).oauthClients.set(CLIENT_ID, {
    client_id: CLIENT_ID,
    client_name: "Muse",
    client_secret_hash: await sha256Hex(CLIENT_SECRET),
    allowed_scopes: JSON.stringify(OAUTH_SCOPES),
    token_endpoint_auth_method: "client_secret_basic",
    enabled: 1
  });
  return env;
};

const registerUser = async (env: Env, email: string) => {
  const response = await createApp().fetch(new Request(`${ORIGIN}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: "integration-test-password", displayName: "AI test" })
  }), env);
  expect(response.status).toBe(201);
  const cookie = response.headers.get("set-cookie") ?? "";
  const user = Array.from((env.DB as unknown as MemoryD1).users.values()).find((item) => item.email === email);
  if (!user) throw new Error("Registered user missing from test database");
  return { cookie, userId: user.id };
};

const integrationRequest = (method: "GET" | "DELETE", cookie?: string, grantId?: string) =>
  new Request(`${ORIGIN}/api/integrations${grantId ? `/${grantId}` : ""}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method === "DELETE" ? { origin: ORIGIN, "content-type": "application/json" } : {})
    },
    ...(method === "DELETE" ? { body: "{}" } : {})
  });

describe("AI integrations API", () => {
  it("requires a cookie session and returns only the signed-in user's safe grant fields", async () => {
    const env = await envFor();
    const app = createApp();
    expect((await app.fetch(integrationRequest("GET"), env)).status).toBe(401);
    const owner = await registerUser(env, "integrations-owner@example.com");
    const other = await registerUser(env, "integrations-other@example.com");
    const memory = env.DB as unknown as MemoryD1;
    memory.oauthGrants.set("grant-owner", {
      id: "grant-owner", user_id: owner.userId, client_id: CLIENT_ID,
      scope: "tasks:read shopping:write", created_at: "2026-10-20T00:00:00.000Z", revoked_at: null
    });
    memory.oauthGrants.set("grant-other", {
      id: "grant-other", user_id: other.userId, client_id: CLIENT_ID,
      scope: "tasks:write", created_at: "2026-10-21T00:00:00.000Z", revoked_at: null
    });

    const response = await app.fetch(integrationRequest("GET", owner.cookie), env);
    expect(response.status).toBe(200);
    const payloadUnknown: unknown = await response.json();
    const payload = payloadUnknown as { data: { integrations: Array<Record<string, unknown>> } };
    expect(payload.data.integrations).toEqual([{
      grantId: "grant-owner",
      clientId: CLIENT_ID,
      clientName: "Muse",
      scopes: ["tasks:read", "shopping:write"],
      connectedAt: "2026-10-20T00:00:00.000Z"
    }]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("client_secret_hash");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("refresh_token");
    expect(serialized).not.toContain("authorization_code");
    expect(serialized).not.toContain("csrf_token");
  });

  it("rejects another user's revoke and revokes its own grant, access token, and refresh token", async () => {
    const env = await envFor();
    const app = createApp();
    const owner = await registerUser(env, "integrations-revoke-owner@example.com");
    const other = await registerUser(env, "integrations-revoke-other@example.com");
    const memory = env.DB as unknown as MemoryD1;
    const accessToken = "access-token-that-must-never-leak";
    const refreshToken = "refresh-token-that-must-never-leak";
    const accessHash = await sha256Hex(accessToken);
    const refreshHash = await sha256Hex(refreshToken);
    const scope = "tasks:read";
    const createdAt = new Date().toISOString();
    memory.oauthGrants.set("revoke-grant", {
      id: "revoke-grant", user_id: owner.userId, client_id: CLIENT_ID,
      scope, created_at: createdAt, revoked_at: null
    });
    memory.oauthAccessTokens.set(accessHash, {
      token_hash: accessHash, grant_id: "revoke-grant", client_id: CLIENT_ID,
      user_id: owner.userId, scope, resource: `${ORIGIN}/mcp`,
      expires_at: "2999-01-01T00:00:00.000Z", revoked_at: null, created_at: createdAt
    });
    memory.oauthRefreshTokens.set(refreshHash, {
      token_hash: refreshHash, grant_id: "revoke-grant", client_id: CLIENT_ID,
      user_id: owner.userId, scope, resource: `${ORIGIN}/mcp`, family_id: "family-1",
      expires_at: "2999-01-01T00:00:00.000Z", used_at: null, revoked_at: null,
      replaced_by_hash: null, created_at: createdAt
    });

    expect((await app.fetch(integrationRequest("DELETE", other.cookie, "revoke-grant"), env)).status).toBe(404);
    expect(memory.oauthGrants.get("revoke-grant")?.revoked_at).toBeNull();
    expect(await new OAuthService(env).authenticateAccessToken(accessToken)).not.toBeNull();

    const revoked = await app.fetch(integrationRequest("DELETE", owner.cookie, "revoke-grant"), env);
    expect(revoked.status).toBe(200);
    expect(await new OAuthService(env).authenticateAccessToken(accessToken)).toBeNull();
    expect(memory.oauthAccessTokens.get(accessHash)?.revoked_at).toBeTruthy();
    expect(memory.oauthRefreshTokens.get(refreshHash)?.revoked_at).toBeTruthy();

    const refreshResponse = await app.fetch(new Request(`${ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: encodeClientCredentials(CLIENT_ID, CLIENT_SECRET),
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString()
    }), env);
    expect(refreshResponse.status).toBe(400);
    expect(await app.fetch(integrationRequest("GET", owner.cookie), env).then((response) => response.json()))
      .toMatchObject({ data: { integrations: [] } });
  });
});
