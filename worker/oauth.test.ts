import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { encodeClientCredentials, OAuthService, OAUTH_SCOPES, OAUTH_TRANSACTION_TTL_SECONDS } from "./services/oauth-service";
import { sha256Hex } from "./lib/crypto";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";
import { getLocalDate } from "./lib/date-time";
import { JSDOM } from "jsdom";

const CLIENT_ID = "housetodo-muse-staging";
const CLIENT_SECRET = "oauth-client-secret-for-tests";
const REDIRECT_URI = "https://muse.example/callback";
const ORIGIN = "https://example.test";
const STAGING_ORIGIN = "https://house-to-do-staging.427harinn.workers.dev";

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
  const memory = db as unknown as MemoryD1;
  const hash = await sha256Hex(CLIENT_SECRET);
  memory.oauthClients.set(CLIENT_ID, {
    client_id: CLIENT_ID,
    client_name: "Muse",
    client_secret_hash: hash,
    allowed_scopes: JSON.stringify(OAUTH_SCOPES),
    token_endpoint_auth_method: "client_secret_basic",
    enabled: 1
  });
  memory.oauthRedirectUris.set(`${CLIENT_ID}:${REDIRECT_URI}`, {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    created_at: new Date().toISOString()
  });
  return env;
};

const memoryOf = (env: Env) => env.DB as unknown as MemoryD1;
const jsonAs = async <T>(response: Response): Promise<T> => {
  const value: unknown = await response.json();
  return value as T;
};
const postJson = (path: string, body: unknown, cookie?: string) => new Request(`${ORIGIN}${path}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: ORIGIN,
    ...(cookie ? { cookie } : {})
  },
  body: JSON.stringify(body)
});

const registerAndHousehold = async (env: Env, email: string) => {
  const app = createApp();
  const registered = await app.fetch(postJson("/api/auth/register", {
    email, password: "very-long-password", displayName: "OAuth test"
  }), env);
  const cookie = registered.headers.get("set-cookie") ?? "";
  const household = await app.fetch(postJson("/api/households", { name: "OAuth household" }, cookie), env);
  expect(household.status).toBe(201);
  return cookie;
};

const authorize = async (env: Env, cookie: string | null, scopes: string) => {
  const url = new URL("/oauth/authorize", ORIGIN);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", "muse-state+value/keep");
  return createApp().fetch(new Request(url, { headers: cookie ? { cookie } : {} }), env);
};

const consentForm = (html: string, decision: "allow" | "deny") => {
  const transactionId = /name="transaction_id" value="([^"]+)"/.exec(html)?.[1] ?? "";
  const csrfToken = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1] ?? "";
  const clientId = /name="client_id" value="([^"]+)"/.exec(html)?.[1] ?? "";
  const redirectUri = /name="redirect_uri" value="([^"]+)"/.exec(html)?.[1] ?? "";
  const scope = /name="scope" value="([^"]+)"/.exec(html)?.[1] ?? "";
  return new URLSearchParams({ transaction_id: transactionId, csrf_token: csrfToken, client_id: clientId, redirect_uri: redirectUri, scope, decision });
};

const consentFormSubmittedByBrowser = (html: string, decision: "allow" | "deny") => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: `${ORIGIN}/oauth/authorize` });
  const form = dom.window.document.querySelector("form");
  if (!form) throw new Error("Consent form not rendered");
  const button = form.querySelector<HTMLButtonElement>(`button[name="decision"][value="${decision}"]`);
  if (!button) throw new Error(`Consent ${decision} button not rendered`);
  let submitEvents = 0;
  form.addEventListener("submit", () => { submitEvents += 1; });
  form.dispatchEvent(new dom.window.SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
    submitter: button
  }));
  const formData = new dom.window.FormData(form);
  const params = new URLSearchParams();
  formData.forEach((value: unknown, name: string) => {
    if (typeof value === "string") params.append(name, value);
  });
  button.click();
  return { dom, params, button, submitEvents };
};

const tokenRequest = (env: Env, form: URLSearchParams, secret = CLIENT_SECRET) =>
  createApp().fetch(new Request(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: {
      authorization: encodeClientCredentials(CLIENT_ID, secret),
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  }), env);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const completeConsent = async (
  env: Env,
  cookie: string,
  scopes: string,
  origin: string | null = ORIGIN,
  referer?: string
) => {
  const authorizeResponse = await authorize(env, cookie, scopes);
  const html = await authorizeResponse.text();
  const form = consentForm(html, "allow");
  const headers = new Headers({ cookie, "content-type": "application/x-www-form-urlencoded" });
  if (origin !== null) headers.set("origin", origin);
  if (referer !== undefined) headers.set("referer", referer);
  const response = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
    method: "POST",
    headers,
    body: form.toString()
  }), env);
  const location = new URL(response.headers.get("location") ?? "", ORIGIN);
  if (response.status === 303 && location.pathname === "/oauth/complete") {
    const completionPage = await createApp().fetch(new Request(location), env);
    const html = await completionPage.text();
    const continueHref = /<a class="continue" href="([^"]+)"/.exec(html)?.[1];
    if (!continueHref) throw new Error("OAuth continue link was not rendered");
    return createApp().fetch(new Request(new URL(continueHref, ORIGIN)), env);
  }
  return response;
};

const openCompletionPage = async (env: Env, handoff: URL) => {
  const page = await createApp().fetch(new Request(handoff), env);
  const html = await page.text();
  const continueHref = /<a class="continue" href="([^"]+)"/.exec(html)?.[1];
  return { page, html, continueUrl: continueHref ? new URL(continueHref, ORIGIN) : null };
};

const exchangeRedirectCode = async (env: Env, response: Response) => {
  const callback = new URL(response.headers.get("location") ?? "");
  const code = callback.searchParams.get("code") ?? "";
  const state = callback.searchParams.get("state");
  const tokenResponse = await tokenRequest(env, new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI
  }));
  return { callback, code, state, tokenResponse };
};

const requestWithBearer = (path: string, token: string, method = "GET", body?: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

describe("OAuth Authorization Code for staging Agent API", () => {
  it("emits staging-only OAuth diagnostics without credential or token values", async () => {
    const env = await envFor();
    env.APP_ENV = "staging";
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await tokenRequest(env, new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code: "must-never-be-logged"
    }), "wrong-secret-value");
    expect(response.status).toBe(401);
    expect(log).toHaveBeenCalledTimes(1);
    const serialized = String(log.mock.calls[0]?.[0] ?? "");
    const record = JSON.parse(serialized) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: "oauth_debug",
      path: "/oauth/token",
      method: "POST",
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      failure: "client_secret_mismatch",
      status: 401,
      oauthError: "invalid_client"
    });
    expect(Object.keys(record).sort()).toEqual([
      "clientId", "event", "failure", "method", "oauthError", "path", "pkcePresent",
      "redirectUri", "responseType", "scopePresent", "statePresent", "status"
    ]);
    expect(serialized).not.toContain("wrong-secret-value");
    expect(serialized).not.toContain(CLIENT_SECRET);
    expect(serialized).not.toContain("must-never-be-logged");

    log.mockClear();
    env.APP_ENV = "production";
    const productionMetadata = await createApp().fetch(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), env);
    const productionConsent = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" }, body: ""
    }), env);
    expect(productionMetadata.status).toBe(200);
    expect(productionConsent.status).toBe(400);
    expect(log).toHaveBeenCalledTimes(2);
    const productionRecords = log.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
    for (const record of productionRecords) {
      expect(Object.keys(record).sort()).toEqual(["endpoint", "errorCategory", "event", "requestId", "status"]);
      expect(record.event).toBe("oauth_request");
      expect(typeof record.requestId).toBe("string");
      expect(record).not.toHaveProperty("clientId");
      expect(record).not.toHaveProperty("redirectUri");
    }
    expect(JSON.stringify(productionRecords)).not.toContain(CLIENT_SECRET);
    expect(JSON.stringify(productionRecords)).not.toContain("csrf_token");
  });

  it("records metadata and authorize endpoint access without logging query secrets", async () => {
    const env = await envFor();
    env.APP_ENV = "staging";
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const metadata = await createApp().fetch(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), env);
    expect(metadata.status).toBe(200);
    const metadataRecord = JSON.parse(String(log.mock.calls[0]?.[0] ?? "")) as Record<string, unknown>;
    expect(metadataRecord).toMatchObject({
      event: "oauth_debug", path: "/.well-known/oauth-authorization-server", method: "GET", status: 200, oauthError: null
    });

    const url = new URL("/oauth/authorize", ORIGIN);
    url.search = new URLSearchParams({
      response_type: "code", client_id: "unknown-client", redirect_uri: REDIRECT_URI,
      scope: "tasks:read", state: "secret-state-value"
    }).toString();
    const response = await createApp().fetch(new Request(url), env);
    expect(response.status).toBe(400);
    const serialized = String(log.mock.calls[1]?.[0] ?? "");
    expect(JSON.parse(serialized)).toMatchObject({
      event: "oauth_debug", path: "/oauth/authorize", method: "GET", clientId: "unknown-client",
      redirectUri: REDIRECT_URI, scopePresent: true, statePresent: true,
      responseType: "code", pkcePresent: false, failure: "client_not_found", status: 400,
      oauthError: "unauthorized_client"
    });
    expect(serialized).not.toContain("secret-state-value");
    expect(serialized).not.toContain("tasks:read");

    log.mockClear();
    const missingStateAndScope = new URL("/oauth/authorize", ORIGIN);
    missingStateAndScope.search = new URLSearchParams({
      response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI
    }).toString();
    const invalid = await createApp().fetch(new Request(missingStateAndScope), env);
    expect(invalid.status).toBe(400);
    const invalidRecord = JSON.parse(String(log.mock.calls[0]?.[0] ?? "")) as Record<string, unknown>;
    expect(invalidRecord).toMatchObject({
      path: "/oauth/authorize", statePresent: false, scopePresent: false, responseType: "code",
      pkcePresent: false, failure: "state_validation", status: 400, oauthError: "invalid_request"
    });
    expect(Object.keys(invalidRecord).sort()).toEqual([
      "clientId", "event", "failure", "method", "oauthError", "path", "pkcePresent",
      "redirectUri", "responseType", "scopePresent", "statePresent", "status"
    ]);
  });

  it("redirects unauthenticated users to existing login and shows only requested consent scopes", async () => {
    const env = await envFor();
    const unauthenticated = await authorize(env, null, "tasks:read");
    expect(unauthenticated.status).toBe(302);
    const loginUrl = new URL(unauthenticated.headers.get("location") ?? "", ORIGIN);
    expect(loginUrl.pathname).toBe("/login");
    expect(loginUrl.searchParams.get("oauth_tx")).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const cookie = await registerAndHousehold(env, "oauth-login@example.com");
    const loginResponse = await createApp().fetch(postJson("/api/auth/login", {
      email: "oauth-login@example.com", password: "very-long-password"
    }), env);
    const loginCookie = loginResponse.headers.get("set-cookie") ?? cookie;
    const resumed = await createApp().fetch(new Request(
      `${ORIGIN}/oauth/authorize?transaction_id=${encodeURIComponent(loginUrl.searchParams.get("oauth_tx")!)}`,
      { headers: { cookie: loginCookie } }
    ), env);
    expect(resumed.status).toBe(200);
    expect(await resumed.text()).toContain("MuseがHouseToDoへのアクセスを求めています");

    const response = await authorize(env, cookie, "tasks:read shopping:write");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("MuseがHouseToDoへのアクセスを求めています");
    expect(html).toContain("タスクを見る");
    expect(html).toContain("買い物を追加・購入済みにする");
    expect(html).not.toContain("タスクを追加・完了する");
    expect(html).not.toContain("買い物リストを見る");
  });

  it.each([["allow", "allow"], ["deny", "deny"]] as const)(
    "preserves decision=%s in native top-level form submission before disabling buttons",
    async (decision, expected) => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, `oauth-native-consent-${decision}@example.com`);
    const response = await authorize(env, cookie, "tasks:read");
    const html = await response.text();
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = /<script nonce="([A-Za-z0-9_-]+)">/.exec(html)?.[1];

    expect(html).toContain('<form method="post" action="/oauth/consent" target="_top">');
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`script-src 'nonce-${nonce}'`);
    expect(html).toContain("addEventListener('submit'");
    expect(html).toContain("event.submitter");
    expect(html).not.toMatch(/\b(fetch|XMLHttpRequest|preventDefault)\b/);
    expect(html).not.toContain("window.location");

    const submitted = consentFormSubmittedByBrowser(html, decision);
    try {
      expect(submitted.params.getAll("decision")).toEqual([expected]);
      expect(submitted.button.disabled).toBe(true);
      expect(submitted.submitEvents).toBe(1);
      const consent = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
        method: "POST",
        headers: { origin: ORIGIN, cookie, "content-type": "application/x-www-form-urlencoded" },
        body: submitted.params.toString()
      }), env);
      if (decision === "allow") {
        expect(consent.status).toBe(303);
        const handoff = new URL(consent.headers.get("location") ?? "", ORIGIN);
        expect(handoff.origin).toBe(ORIGIN);
        expect(handoff.pathname).toBe("/oauth/complete");
        const { page, html: completionHtml, continueUrl } = await openCompletionPage(env, handoff);
        expect(page.status).toBe(200);
        expect(completionHtml).toContain("HouseToDoの認証が完了しました。");
        expect(completionHtml).toContain("Museへの接続を続ける");
        expect(completionHtml).not.toContain("code=");
        expect(completionHtml).not.toContain("state=");
        expect(continueUrl?.pathname).toBe("/oauth/continue");
        const continued = await createApp().fetch(new Request(continueUrl!), env);
        expect(continued.status).toBe(303);
        const callback = new URL(continued.headers.get("location") ?? "");
        expect(callback.searchParams.get("code")).toBeTruthy();
        expect(callback.searchParams.get("state")).toBe("muse-state+value/keep");
      } else {
        expect(consent.status).toBe(302);
        const callback = new URL(consent.headers.get("location") ?? "");
        expect(callback.searchParams.get("error")).toBe("access_denied");
      }
    } finally {
      submitted.dom.window.close();
    }
  });

  it("keeps an authorization transaction valid for 15 minutes and allows consent after several minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T15:00:00.000Z"));
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-transaction-delay@example.com");
    const authorizeResponse = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await authorizeResponse.text(), "allow");
    const transactionHash = await sha256Hex(form.get("transaction_id") ?? "");
    const transaction = memoryOf(env).oauthTransactions.get(transactionHash);
    expect(transaction?.expires_at).toBe("2026-10-23T15:15:00.000Z");
    expect(OAUTH_TRANSACTION_TTL_SECONDS).toBe(15 * 60);

    vi.setSystemTime(new Date("2026-10-23T15:04:00.000Z"));
    const consent = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST",
      headers: { origin: "null", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(consent.status).toBe(303);
    const location = consent.headers.get("location");
    expect(location).not.toBeNull();
    const handoff = new URL(location ?? "", ORIGIN);
    expect(handoff.pathname).toBe("/oauth/complete");
    const { page, continueUrl } = await openCompletionPage(env, handoff);
    expect(page.status).toBe(200);
    expect(continueUrl?.pathname).toBe("/oauth/continue");
    const continued = await createApp().fetch(new Request(continueUrl!), env);
    expect(continued.status).toBe(303);
    const callback = new URL(continued.headers.get("location") ?? "");
    expect(callback.origin).toBe(new URL(REDIRECT_URI).origin);
    expect(callback.pathname).toBe(new URL(REDIRECT_URI).pathname);
    expect(callback.searchParams.get("code")).toBeTruthy();
    expect(callback.searchParams.get("state")).toBe("muse-state+value/keep");
    expect(await consent.text()).toBe("");
    expect(transaction?.consumed_at).not.toBeNull();
  });

  it("keeps the transaction through a delayed existing login round trip", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T16:00:00.000Z"));
    const env = await envFor();
    await registerAndHousehold(env, "oauth-delayed-login@example.com");
    const firstResponse = await authorize(env, null, "tasks:read");
    const loginUrl = new URL(firstResponse.headers.get("location") ?? "", ORIGIN);
    const transactionId = loginUrl.searchParams.get("oauth_tx") ?? "";
    expect(transactionId).toMatch(/^[A-Za-z0-9_-]{43}$/);

    vi.setSystemTime(new Date("2026-10-23T16:06:00.000Z"));
    const loginResponse = await createApp().fetch(postJson("/api/auth/login", {
      email: "oauth-delayed-login@example.com", password: "very-long-password"
    }), env);
    const cookie = loginResponse.headers.get("set-cookie") ?? "";
    expect(cookie).not.toBe("");
    const resumed = await createApp().fetch(new Request(
      `${ORIGIN}/oauth/authorize?transaction_id=${encodeURIComponent(transactionId)}`,
      { headers: { cookie } }
    ), env);
    expect(resumed.status).toBe(200);
    const form = consentForm(await resumed.text(), "allow");

    vi.setSystemTime(new Date("2026-10-23T16:07:00.000Z"));
    const consent = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST",
      headers: { origin: "null", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(consent.status).toBe(303);
    const handoff = new URL(consent.headers.get("location") ?? "", ORIGIN);
    expect(handoff.pathname).toBe("/oauth/complete");
    const { page, continueUrl } = await openCompletionPage(env, handoff);
    expect(page.status).toBe(200);
    expect(continueUrl?.pathname).toBe("/oauth/continue");
    expect((await createApp().fetch(new Request(continueUrl!), env)).status).toBe(303);
  });

  it("preserves state, rejects redirect/client errors, denies consent, and enforces CSRF", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-consent@example.com");
    const invalidClientUrl = new URL("/oauth/authorize", ORIGIN);
    invalidClientUrl.search = new URLSearchParams({
      response_type: "code", client_id: "invalid", redirect_uri: REDIRECT_URI,
      scope: "tasks:read", state: "opaque-state"
    }).toString();
    expect((await createApp().fetch(new Request(invalidClientUrl), env)).status).toBe(400);

    const mismatch = new URL("/oauth/authorize", ORIGIN);
    mismatch.search = new URLSearchParams({
      response_type: "code", client_id: CLIENT_ID,
      redirect_uri: "https://attacker.example/callback", scope: "tasks:read", state: "opaque-state"
    }).toString();
    expect((await createApp().fetch(new Request(mismatch), env)).status).toBe(400);

    const response = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await response.text(), "deny");
    const badCsrf = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "https://evil.example", cookie, "content-type": "application/x-www-form-urlencoded" }, body: form.toString()
    }), env);
    expect(badCsrf.status).toBe(403);

    const denied = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: ORIGIN, cookie, "content-type": "application/x-www-form-urlencoded" }, body: form.toString()
    }), env);
    const callback = new URL(denied.headers.get("location") ?? "");
    expect(callback.origin).toBe("https://muse.example");
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBe("muse-state+value/keep");
  });

  it.each([
    ["configured Origin", STAGING_ORIGIN],
    ["opaque null Origin", "null"],
    ["missing Origin", null]
  ] as const)("accepts consent with %s only after transaction, CSRF, and session checks", async (_label, origin) => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, `consent-origin-${String(origin)}@example.com`);
    env.ALLOWED_ORIGINS = STAGING_ORIGIN;
    const response = await completeConsent(env, cookie, "tasks:read", origin);
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").searchParams.has("code")).toBe(true);
  });

  it("rejects null Origin consent when the CSRF token, session, or transaction is invalid", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "consent-null-invalid@example.com");
    const authorizeResponse = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await authorizeResponse.text(), "allow");

    const badCsrfForm = new URLSearchParams(form);
    badCsrfForm.set("csrf_token", "invalid-csrf-value");
    const badCsrf = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "null", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: badCsrfForm.toString()
    }), env);
    expect(badCsrf.status).toBe(400);

    const invalidSession = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "null", cookie: "session=not-a-valid-session", "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(invalidSession.status).toBe(403);

    const transactionHash = await sha256Hex(form.get("transaction_id") ?? "");
    const transaction = memoryOf(env).oauthTransactions.get(transactionHash);
    expect(transaction).toBeDefined();
    if (transaction) transaction.expires_at = "2000-01-01T00:00:00.000Z";
    const expiredTransaction = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "null", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(expiredTransaction.status).toBe(400);
  });

  it("rejects a mismatched transaction user, client, redirect URI, and requested scope", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "consent-bound-user@example.com");
    const otherCookie = await registerAndHousehold(env, "consent-other-user@example.com");
    const authorizeResponse = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await authorizeResponse.text(), "allow");

    const mismatch = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "null", cookie: otherCookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(mismatch.status).toBe(400);

    const transactionHash = await sha256Hex(form.get("transaction_id") ?? "");
    const transaction = memoryOf(env).oauthTransactions.get(transactionHash);
    expect(transaction).toBeDefined();
    if (!transaction) return;

    for (const [field, value] of [["client_id", "unknown-client"], ["redirect_uri", "https://attacker.example/callback"], ["scope", "tasks:write"]] as const) {
      const tamperedForm = new URLSearchParams(form);
      tamperedForm.set(field, value);
      const response = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
        method: "POST", headers: { origin: "null", cookie, "content-type": "application/x-www-form-urlencoded" },
        body: tamperedForm.toString()
      }), env);
      expect(response.status).toBe(400);
    }
  });

  it("rejects malicious Origins and a non-staging Referer even for an opaque Origin", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "consent-host-check@example.com");
    const authorizeResponse = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await authorizeResponse.text(), "allow");
    const maliciousOrigin = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "https://evil.example", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(maliciousOrigin.status).toBe(403);

    const maliciousReferer = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "null", referer: "https://evil.example/", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(maliciousReferer.status).toBe(403);
  });

  it("does not accept a previously consumed authorization transaction", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "consent-consumed@example.com");
    const authorizeResponse = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await authorizeResponse.text(), "allow");
    const request = () => createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST", headers: { origin: "null", cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect((await request()).status).toBe(303);
    expect((await request()).status).toBe(400);
  });

  it("requires an explicit one-time continue navigation before issuing the authorization code", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-completion-handoff@example.com");
    const authorizeResponse = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await authorizeResponse.text(), "allow");
    const post = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    expect(post.status).toBe(303);
    const handoff = new URL(post.headers.get("location") ?? "", ORIGIN);
    expect(handoff.origin).toBe(ORIGIN);
    expect(handoff.pathname).toBe("/oauth/complete");
    expect(handoff.searchParams.has("code")).toBe(false);
    expect(handoff.searchParams.has("state")).toBe(false);
    expect(memoryOf(env).oauthCodes.size).toBe(0);
    expect(memoryOf(env).oauthCompletions.size).toBe(1);

    handoff.searchParams.set("redirect_uri", "https://attacker.example/steal");
    const { page, html, continueUrl } = await openCompletionPage(env, handoff);
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain('<a class="continue"');
    expect(html).toContain('target="_top"');
    expect(html).not.toMatch(/[?&](code|state)=/);
    expect(continueUrl?.pathname).toBe("/oauth/continue");
    expect(continueUrl?.searchParams.has("h")).toBe(true);
    expect(continueUrl?.searchParams.has("redirect_uri")).toBe(false);
    expect(memoryOf(env).oauthCodes.size).toBe(0);

    const continued = await createApp().fetch(new Request(continueUrl!), env);
    expect(continued.status).toBe(303);
    const callback = new URL(continued.headers.get("location") ?? "");
    expect(callback.origin).toBe(new URL(REDIRECT_URI).origin);
    expect(callback.pathname).toBe(new URL(REDIRECT_URI).pathname);
    expect(callback.searchParams.get("code")).toBeTruthy();
    expect(callback.searchParams.get("state")).toBe("muse-state+value/keep");
    expect(memoryOf(env).oauthCodes.size).toBe(1);

    const replay = await createApp().fetch(new Request(continueUrl!), env);
    expect(replay.status).toBe(400);
    expect(memoryOf(env).oauthCodes.size).toBe(1);
  });

  it("exchanges one-time codes using client_secret_basic and rejects code/secret reuse", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-exchange@example.com");
    const consent = await completeConsent(env, cookie, "tasks:read");
    expect(consent.status).toBe(303);
    const { callback, code, state, tokenResponse } = await exchangeRedirectCode(env, consent);
    expect(callback.searchParams.get("state")).toBe("muse-state+value/keep");
    expect(state).toBe("muse-state+value/keep");
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.headers.get("cache-control")).toBe("no-store");
    const tokens = await jsonAs<{ access_token: string; refresh_token: string; expires_in: number }>(tokenResponse);
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    const memory = memoryOf(env);
    expect(memory.oauthClients.get(CLIENT_ID)?.client_secret_hash).toBe(await sha256Hex(CLIENT_SECRET));
    expect(memory.oauthClients.get(CLIENT_ID)?.client_secret_hash).not.toBe(CLIENT_SECRET);
    expect(memory.oauthAccessTokens.has(await sha256Hex(tokens.access_token))).toBe(true);
    expect(memory.oauthAccessTokens.has(tokens.access_token)).toBe(false);
    expect(memory.oauthRefreshTokens.has(await sha256Hex(tokens.refresh_token))).toBe(true);
    expect(memory.oauthRefreshTokens.has(tokens.refresh_token)).toBe(false);

    const reused = await tokenRequest(env, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }));
    expect(reused.status).toBe(400);
    const badSecret = await tokenRequest(env, new URLSearchParams({ grant_type: "authorization_code", code: "invalid", redirect_uri: REDIRECT_URI }), "wrong-secret");
    expect(badSecret.status).toBe(401);
    expect(await badSecret.json()).toMatchObject({ error: "invalid_client" });
  });

  it("enforces access scopes, expiry, revoke, refresh rotation and replay revocation", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-tokens@example.com");
    const consent = await completeConsent(env, cookie, "tasks:read");
    const { tokenResponse } = await exchangeRedirectCode(env, consent);
    const tokens = await jsonAs<{ access_token: string; refresh_token: string }>(tokenResponse);
    const today = getLocalDate(new Date(), "Asia/Tokyo");
    expect((await createApp().fetch(requestWithBearer(`/api/agent/tasks/today?date=${today}`, tokens.access_token), env)).status).toBe(200);
    expect((await createApp().fetch(requestWithBearer("/api/agent/shopping", tokens.access_token), env)).status).toBe(403);

    const refreshed = await tokenRequest(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }));
    expect(refreshed.status).toBe(200);
    const next = await jsonAs<{ access_token: string; refresh_token: string }>(refreshed);
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    const replay = await tokenRequest(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }));
    expect(replay.status).toBe(400);
    expect((await createApp().fetch(requestWithBearer("/api/agent/tasks/today", next.access_token), env)).status).toBe(401);

    const secondConsent = await completeConsent(env, cookie, "tasks:read");
    const secondTokens = await exchangeRedirectCode(env, secondConsent);
    const second = await jsonAs<{ access_token: string; refresh_token: string }>(secondTokens.tokenResponse);
    const secondAccessRow = memoryOf(env).oauthAccessTokens.get(await sha256Hex(second.access_token));
    if (secondAccessRow) secondAccessRow.expires_at = "2000-01-01T00:00:00.000Z";
    expect((await createApp().fetch(requestWithBearer("/api/agent/tasks/today", second.access_token), env)).status).toBe(401);
    const revoke = await createApp().fetch(new Request(`${ORIGIN}/oauth/revoke`, {
      method: "POST",
      headers: { authorization: encodeClientCredentials(CLIENT_ID, CLIENT_SECRET), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: second.access_token, token_type_hint: "access_token" }).toString()
    }), env);
    expect(revoke.status).toBe(200);
    expect(revoke.headers.get("cache-control")).toBe("no-store");
    expect((await createApp().fetch(requestWithBearer("/api/agent/tasks/today", second.access_token), env)).status).toBe(401);

    const thirdConsent = await completeConsent(env, cookie, "tasks:read");
    const { tokenResponse: thirdResponse } = await exchangeRedirectCode(env, thirdConsent);
    const third = await jsonAs<{ access_token: string; refresh_token: string }>(thirdResponse);
    const refreshRevoke = await createApp().fetch(new Request(`${ORIGIN}/oauth/revoke`, {
      method: "POST",
      headers: { authorization: encodeClientCredentials(CLIENT_ID, CLIENT_SECRET), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: third.refresh_token, token_type_hint: "refresh_token" }).toString()
    }), env);
    expect(refreshRevoke.status).toBe(200);
    expect((await createApp().fetch(requestWithBearer("/api/agent/tasks/today", third.access_token), env)).status).toBe(401);
  });

  it("keeps household isolation, Phase 1 coexistence, and enables production OAuth", async () => {
    const env = await envFor();
    const firstCookie = await registerAndHousehold(env, "oauth-owner@example.com");
    const otherCookie = await registerAndHousehold(env, "oauth-other@example.com");
    const taskDate = getLocalDate(new Date(), "Asia/Tokyo");
    const otherTaskResponse = await createApp().fetch(postJson("/api/agent/tasks", {
      title: "Other household", date: taskDate
    }, otherCookie), env);
    expect(otherTaskResponse.status).toBe(401);
    const otherCreate = await createApp().fetch(postJson("/api/tasks", {
      title: "Other household", modelRecurrenceType: "once", startDate: taskDate,
      targetDate: taskDate, assignmentType: "anyone", notificationSlot: "none"
    }, otherCookie), env);
    expect(otherCreate.status).toBe(201);
    const otherCreateBody = await jsonAs<{ data: { task: { id: string } } }>(otherCreate);
    const otherTaskId = otherCreateBody.data.task.id;

    const consent = await completeConsent(env, firstCookie, "tasks:write");
    const { tokenResponse } = await exchangeRedirectCode(env, consent);
    const tokens = await jsonAs<{ access_token: string }>(tokenResponse);
    const crossHousehold = await createApp().fetch(requestWithBearer(`/api/agent/tasks/${otherTaskId}/complete`, tokens.access_token, "POST", { targetDate: taskDate }), env);
    expect(crossHousehold.status).toBe(404);

    env.AGENT_API_TOKEN = "phase-one-static-token";
    env.AGENT_API_USER_ID = "";
    const ownerMe = await createApp().fetch(new Request(`${ORIGIN}/api/auth/me`, { headers: { cookie: firstCookie } }), env);
    const ownerBody = await jsonAs<{ data: { user: { id: string } } }>(ownerMe);
    const owner = ownerBody.data.user;
    env.AGENT_API_USER_ID = owner.id;
    expect((await createApp().fetch(requestWithBearer("/api/agent/shopping", "phase-one-static-token"), env)).status).toBe(200);

    const metadata = await createApp().fetch(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), env);
    expect(await metadata.json()).toMatchObject({
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      grant_types_supported: ["authorization_code", "refresh_token"]
    });
    env.APP_ENV = "production";
    expect((await createApp().fetch(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), env)).status).toBe(200);
    expect((await createApp().fetch(new Request(`${ORIGIN}/oauth/complete?ticket=opaque`), env)).status).toBe(400);
    expect((await createApp().fetch(new Request(`${ORIGIN}/oauth/continue?h=opaque`), env)).status).toBe(400);
    expect((await createApp().fetch(requestWithBearer("/api/agent/tasks/today", tokens.access_token), env)).status).toBe(401);
    env.APP_ENV = "development";
    expect((await createApp().fetch(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), env)).status).toBe(404);
    expect(OAuthService.isEnabled({ APP_ENV: "production" } as Env)).toBe(true);
    expect(OAuthService.isEnabled({ APP_ENV: "staging" } as Env)).toBe(true);
    expect(OAuthService.isEnabled({ APP_ENV: "test" } as Env)).toBe(true);
    expect(OAuthService.isEnabled({ APP_ENV: "development" } as Env)).toBe(false);
  });

  it("supports production authorization, token, refresh, and revocation with minimal logs", async () => {
    const env = await envFor();
    env.APP_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const cookie = await registerAndHousehold(env, "production-oauth@example.com");
    const metadata = await createApp().fetch(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), env);
    expect(metadata.status).toBe(200);
    const consent = await completeConsent(env, cookie, "tasks:read");
    const { callback, tokenResponse } = await exchangeRedirectCode(env, consent);
    expect(callback.searchParams.get("state")).toBe("muse-state+value/keep");
    expect(tokenResponse.status).toBe(200);
    const tokens = await jsonAs<{ access_token: string; refresh_token: string }>(tokenResponse);

    const refreshedResponse = await tokenRequest(env, new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token
    }));
    expect(refreshedResponse.status).toBe(200);
    const refreshed = await jsonAs<{ access_token: string; refresh_token: string }>(refreshedResponse);
    expect(refreshed.access_token).not.toBe(tokens.access_token);

    const revoked = await createApp().fetch(new Request(`${ORIGIN}/oauth/revoke`, {
      method: "POST",
      headers: {
        authorization: encodeClientCredentials(CLIENT_ID, CLIENT_SECRET),
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ token: refreshed.refresh_token, token_type_hint: "refresh_token" }).toString()
    }), env);
    expect(revoked.status).toBe(200);

    const records = info.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
    expect(records.map((record) => record.endpoint)).toEqual(expect.arrayContaining([
      "/.well-known/oauth-authorization-server", "/oauth/authorize", "/oauth/consent",
      "/oauth/complete", "/oauth/continue", "/oauth/token", "/oauth/revoke"
    ]));
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(["endpoint", "errorCategory", "event", "requestId", "status"]);
      expect(record.event).toBe("oauth_request");
    }
    const serializedLogs = JSON.stringify(records);
    expect(serializedLogs).not.toContain(CLIENT_SECRET);
    expect(serializedLogs).not.toContain(tokens.access_token);
    expect(serializedLogs).not.toContain(tokens.refresh_token);
    expect(serializedLogs).not.toContain(refreshed.access_token);
    expect(serializedLogs).not.toContain("muse-state+value/keep");
    expect(serializedLogs).not.toContain(cookie);
  });

  it("expires the one-time completion handoff and does not create a code for arbitrary targets", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-completion-expiry@example.com");
    const authorizeResponse = await authorize(env, cookie, "tasks:read");
    const form = consentForm(await authorizeResponse.text(), "allow");
    const post = await createApp().fetch(new Request(`${ORIGIN}/oauth/consent`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    }), env);
    const handoff = new URL(post.headers.get("location") ?? "", ORIGIN);
    const ticket = handoff.searchParams.get("ticket") ?? "";
    const row = memoryOf(env).oauthCompletions.get(await sha256Hex(ticket));
    if (!row) throw new Error("OAuth completion was not persisted");
    row.expires_at = "2000-01-01T00:00:00.000Z";
    const expired = await createApp().fetch(new Request(handoff), env);
    expect(expired.status).toBe(400);
    expect(memoryOf(env).oauthCodes.size).toBe(0);
    const continueExpired = await createApp().fetch(new Request(`${ORIGIN}/oauth/continue?h=${encodeURIComponent(ticket)}`), env);
    expect(continueExpired.status).toBe(400);
    expect(memoryOf(env).oauthCodes.size).toBe(0);
  });

  it("rejects expired authorization codes", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-expired@example.com");
    const consent = await completeConsent(env, cookie, "tasks:read");
    const callback = new URL(consent.headers.get("location") ?? "");
    const code = callback.searchParams.get("code") ?? "";
    const row = memoryOf(env).oauthCodes.get(await sha256Hex(code));
    if (!row) throw new Error("OAuth code was not persisted");
    row.expires_at = "2000-01-01T00:00:00.000Z";
    const response = await tokenRequest(env, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("does not require resource and validates it as the exact MCP URL when supplied", async () => {
    const env = await envFor();
    const cookie = await registerAndHousehold(env, "oauth-resource@example.com");
    const wrongAuthorize = new URL("/oauth/authorize", ORIGIN);
    wrongAuthorize.searchParams.set("response_type", "code");
    wrongAuthorize.searchParams.set("client_id", CLIENT_ID);
    wrongAuthorize.searchParams.set("redirect_uri", REDIRECT_URI);
    wrongAuthorize.searchParams.set("scope", "tasks:read");
    wrongAuthorize.searchParams.set("state", "resource-test-state");
    wrongAuthorize.searchParams.set("resource", "https://wrong.example/mcp");
    const badAuthorize = await createApp().fetch(new Request(wrongAuthorize, { headers: { cookie } }), env);
    expect(badAuthorize.status).toBe(400);
    expect(await badAuthorize.json()).toMatchObject({ error: "invalid_target" });

    const consent = await completeConsent(env, cookie, "tasks:read");
    const callback = new URL(consent.headers.get("location") ?? "");
    const code = callback.searchParams.get("code") ?? "";
    const wrongTokenResource = await tokenRequest(env, new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI,
      resource: "https://wrong.example/mcp"
    }));
    expect(wrongTokenResource.status).toBe(400);
    expect(await wrongTokenResource.json()).toMatchObject({ error: "invalid_target" });

    const correctTokenResource = await tokenRequest(env, new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI,
      resource: `${ORIGIN}/mcp`
    }));
    expect(correctTokenResource.status).toBe(200);
    const token = await jsonAs<{ access_token: string }>(correctTokenResource);
    const row = memoryOf(env).oauthAccessTokens.get(await sha256Hex(token.access_token));
    expect(row?.resource).toBe(`${ORIGIN}/mcp`);
  });
});
