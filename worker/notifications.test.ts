import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { bytesToBase64Url } from "./lib/crypto";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";
import { vi } from "vitest";

const createTestEnv = (db = new MemoryD1(), publicKey?: string): Env =>
  ({
    DB: db as unknown as D1Database,
    ATTACHMENTS: new MemoryR2(),
    ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
    APP_ENV: "test",
    ALLOWED_ORIGINS: "https://example.test",
    WEB_PUSH_VAPID_PUBLIC_KEY: publicKey
  }) as unknown as Env;

const request = (path: string, init: RequestInit = {}) =>
  new Request(`https://example.test${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      ...(init.headers ?? {})
    }
  });

const register = async (app: ReturnType<typeof createApp>, env: Env, email: string) => {
  const response = await app.fetch(
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: "very-long-password",
        displayName: email
      })
    }),
    env
  );
  return response.headers.get("set-cookie") ?? "";
};

describe("notification subscription API", () => {
  it.each([
    ["get", { method: "GET" }],
    ["post-empty", { method: "POST" }],
    [
      "post-basic-headers",
      { method: "POST", headers: { TTL: "60", "Content-Type": "application/octet-stream" } }
    ],
    [
      "post-body",
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3])
      }
    ],
    [
      "post-content-encoding",
      {
        method: "POST",
        headers: {
          TTL: "60",
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm"
        },
        body: new Uint8Array([1, 2, 3])
      }
    ]
  ] as const)("reports an Apple host HTTP response as a successful %s probe", async (mode, init) => {
    const app = createApp();
    const env = createTestEnv();
    const cookie = await register(app, env, `probe-${mode}@example.com`);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 405 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.fetch(
      request(`/api/notifications/network-probe?mode=${mode}&url=https://attacker.example`, {
        headers: { cookie }
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { ok: true, mode, status: 405 }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://web.push.apple.com/", init);
    vi.restoreAllMocks();
  });

  it("rejects unsupported probe mode", async () => {
    const app = createApp();
    const env = createTestEnv();
    const cookie = await register(app, env, "probe-invalid@example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.fetch(
      request("/api/notifications/network-probe?mode=evil", { headers: { cookie } }),
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", details: { mode: "Unsupported probe mode." } }
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it.each(["staging", "development", "test"])("is enabled in %s", async (appEnv) => {
    const app = createApp();
    const env = createTestEnv();
    env.APP_ENV = appEnv as Env["APP_ENV"];
    const cookie = await register(app, env, `probe-${appEnv}@example.com`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 405 })));

    const response = await app.fetch(
      request("/api/notifications/network-probe?mode=post-content-encoding", {
        headers: { cookie }
      }),
      env
    );

    expect(response.status).toBe(200);
    vi.restoreAllMocks();
  });

  it("requires authentication and is disabled in production", async () => {
    const app = createApp();
    const production = createTestEnv();
    production.APP_ENV = "production";
    const cookie = await register(app, production, "probe-production@example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      app.fetch(request("/api/notifications/network-probe"), production)
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      app.fetch(
        request("/api/notifications/network-probe", { headers: { cookie } }),
        production
      )
    ).resolves.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("returns only safe failure diagnostics when the probe fetch throws", async () => {
    const app = createApp();
    const env = createTestEnv();
    const cookie = await register(app, env, "probe-failure@example.com");
    const error = new TypeError("https://secret.example/path?token=secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await app.fetch(
      request("/api/notifications/network-probe?mode=post-content-encoding", {
        headers: { cookie }
      }),
      env
    );
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain('"errorName":"TypeError"');
    expect(body).toContain('"causeCode":"null"');
    expect(body).toContain('"mode":"post-content-encoding"');
    expect(body).not.toContain("secret.example");
    expect(body).not.toContain("token");
    expect(body).not.toContain("stack");
    expect(log).toHaveBeenCalledWith("network_probe_failed", {
      mode: "post-content-encoding",
      errorName: "TypeError",
      causeCode: null
    });
    vi.restoreAllMocks();
  });

  it("probes only the authenticated user's active Apple HTTPS subscriptions with an empty POST", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const ownerCookie = await register(app, env, "subscription-probe-owner@example.com");
    const otherCookie = await register(app, env, "subscription-probe-other@example.com");
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie: ownerCookie },
        body: JSON.stringify({ name: "Owner household" })
      }),
      env
    );
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie: otherCookie },
        body: JSON.stringify({ name: "Other household" })
      }),
      env
    );
    const owner = Array.from(db.users.values()).find((user) => user.email === "subscription-probe-owner@example.com");
    const other = Array.from(db.users.values()).find((user) => user.email === "subscription-probe-other@example.com");
    const ownerHousehold = owner && Array.from(db.members.values()).find((member) => member.user_id === owner.id);
    const otherHousehold = other && Array.from(db.members.values()).find((member) => member.user_id === other.id);
    expect(ownerHousehold).toBeDefined();
    expect(otherHousehold).toBeDefined();
    db.pushSubscriptions.set("active-1", {
      id: "active-1", user_id: owner!.id, household_id: ownerHousehold!.household_id,
      endpoint: "https://web.push.apple.com/active-1", endpoint_hash: "secret-hash-1",
      p256dh: "secret-p256dh-1", auth: "secret-auth-1", user_agent_summary: null,
      enabled: 1, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: null
    });
    db.pushSubscriptions.set("active-2", {
      id: "active-2", user_id: owner!.id, household_id: ownerHousehold!.household_id,
      endpoint: "https://sub.push.apple.com/active-2", endpoint_hash: "secret-hash-2",
      p256dh: "secret-p256dh-2", auth: "secret-auth-2", user_agent_summary: null,
      enabled: 1, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: null
    });
    db.pushSubscriptions.set("disabled", {
      id: "disabled", user_id: owner!.id, household_id: ownerHousehold!.household_id,
      endpoint: "https://web.push.apple.com/disabled", endpoint_hash: null,
      p256dh: "p256dh", auth: "auth", user_agent_summary: null,
      enabled: 0, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: "now"
    });
    db.pushSubscriptions.set("other-user", {
      id: "other-user", user_id: other!.id, household_id: otherHousehold!.household_id,
      endpoint: "https://web.push.apple.com/other-user", endpoint_hash: null,
      p256dh: "p256dh", auth: "auth", user_agent_summary: null,
      enabled: 1, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: null
    });
    db.pushSubscriptions.set("other-household", {
      id: "other-household", user_id: owner!.id, household_id: otherHousehold!.household_id,
      endpoint: "https://web.push.apple.com/other-household", endpoint_hash: null,
      p256dh: "p256dh", auth: "auth", user_agent_summary: null,
      enabled: 1, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: null
    });
    db.pushSubscriptions.set("non-apple", {
      id: "non-apple", user_id: owner!.id, household_id: ownerHousehold!.household_id,
      endpoint: "https://push.example.test/non-apple", endpoint_hash: null,
      p256dh: "p256dh", auth: "auth", user_agent_summary: null,
      enabled: 1, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: null
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await app.fetch(
      request("/api/notifications/network-probe?mode=subscription-post-empty&endpoint=https://attacker.example", {
        headers: { cookie: ownerCookie }
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        results: [
          { index: 1, ok: true, status: 403 },
          { index: 2, ok: true, status: 400 }
        ]
      }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://web.push.apple.com/active-1", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://sub.push.apple.com/active-2", { method: "POST" });
    vi.restoreAllMocks();
  });

  it("reports a safe failure for a thrown fetch or non-response and remains disabled in production", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const cookie = await register(app, env, "subscription-probe-failure@example.com");
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ name: "Probe household" })
      }),
      env
    );
    const user = Array.from(db.users.values()).find((item) => item.email === "subscription-probe-failure@example.com");
    const household = user && Array.from(db.members.values()).find((member) => member.user_id === user.id);
    db.pushSubscriptions.set("failure", {
      id: "failure", user_id: user!.id, household_id: household!.household_id,
      endpoint: "https://web.push.apple.com/failure", endpoint_hash: null,
      p256dh: "p256dh", auth: "auth", user_agent_summary: null,
      enabled: 1, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: null
    });
    db.pushSubscriptions.set("non-response", {
      id: "non-response", user_id: user!.id, household_id: household!.household_id,
      endpoint: "https://web.push.apple.com/non-response", endpoint_hash: null,
      p256dh: "p256dh", auth: "auth", user_agent_summary: null,
      enabled: 1, created_at: "now", updated_at: null, last_seen_at: null, disabled_at: null
    });
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(new TypeError("secret endpoint"))
        .mockResolvedValueOnce(undefined)
    );
    const failure = await app.fetch(
      request("/api/notifications/network-probe?mode=subscription-post-empty", { headers: { cookie } }),
      env
    );
    expect(failure.status).toBe(200);
    await expect(failure.json()).resolves.toMatchObject({
      ok: true,
      data: {
        results: [
          { index: 1, ok: false, errorName: "TypeError", causeCode: null },
          { index: 2, ok: false, errorName: "TypeError", causeCode: null }
        ]
      }
    });
    const production = { ...env, APP_ENV: "production" as const };
    await expect(
      app.fetch(
        request("/api/notifications/network-probe?mode=subscription-post-empty", { headers: { cookie } }),
        production
      )
    ).resolves.toMatchObject({ status: 404 });
    vi.restoreAllMocks();
  });

  it("returns only the configured public key for authenticated users", async () => {
    const app = createApp();
    const env = createTestEnv(undefined, "public-key");
    const cookie = await register(app, env, "vapid@example.com");
    expect(
      (
        await app.fetch(
          request("/api/notifications/vapid-public-key", { headers: { cookie } }),
          env
        )
      ).status
    ).toBe(200);
    await expect(
      app.fetch(request("/api/notifications/vapid-public-key"), env)
    ).resolves.toMatchObject({ status: 401 });
    const body: unknown = await (
      await app.fetch(
        request("/api/notifications/vapid-public-key", { headers: { cookie } }),
        env
      )
    ).json();
    expect(body).toMatchObject({ ok: true, data: { publicKey: "public-key" } });
    expect(JSON.stringify(body)).not.toContain("private");
  });

  it("requires config and upserts one endpoint while isolating deletion", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const ownerCookie = await register(app, env, "owner@example.com");
    const memberCookie = await register(app, env, "member@example.com");
    expect(
      (
        await app.fetch(
          request("/api/notifications/vapid-public-key", {
            headers: { cookie: ownerCookie }
          }),
          env
        )
      ).status
    ).toBe(503);
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie: ownerCookie },
        body: JSON.stringify({ name: "House" })
      }),
      env
    );
    const endpoint = "https://push.example.test/send/endpoint-1";
    const body = JSON.stringify({ endpoint, keys: { p256dh: "AQID", auth: "BAUG" } });
    expect(
      (
        await app.fetch(
          request("/api/notifications/subscriptions", {
            method: "POST",
            headers: { cookie: ownerCookie },
            body
          }),
          env
        )
      ).status
    ).toBe(201);
    expect(
      (
        await app.fetch(
          request("/api/notifications/subscriptions", {
            method: "POST",
            headers: { cookie: ownerCookie },
            body: JSON.stringify({ endpoint, keys: { p256dh: "BwgJ", auth: "CgsM" } })
          }),
          env
        )
      ).status
    ).toBe(201);
    expect(db.pushSubscriptions.size).toBe(1);
    expect(
      (
        await app.fetch(
          request("/api/notifications/subscriptions", {
            method: "DELETE",
            headers: { cookie: memberCookie },
            body: JSON.stringify({ endpoint })
          }),
          env
        )
      ).status
    ).toBe(404);
    expect(
      (
        await app.fetch(
          request("/api/notifications/subscriptions", {
            method: "DELETE",
            headers: { cookie: ownerCookie },
            body: JSON.stringify({ endpoint })
          }),
          env
        )
      ).status
    ).toBe(200);
    expect(db.pushSubscriptions.size).toBe(0);
    expect(
      (
        await app.fetch(
          request("/api/notifications/subscriptions", {
            method: "DELETE",
            headers: { cookie: ownerCookie },
            body: JSON.stringify({ endpoint })
          }),
          env
        )
      ).status
    ).toBe(200);
  });

  it("rejects insecure subscription endpoints", async () => {
    const app = createApp();
    const env = createTestEnv();
    const cookie = await register(app, env, "invalid@example.com");
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ name: "House" })
      }),
      env
    );
    const response = await app.fetch(
      request("/api/notifications/subscriptions", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({
          endpoint: "http://push.example.test",
          keys: { p256dh: "AQID", auth: "BAUG" }
        })
      }),
      env
    );
    expect(response.status).toBe(400);
  });

  it("enables the test endpoint only outside production", async () => {
    const app = createApp();
    const staging = createTestEnv(new MemoryD1(), "public-key");
    staging.APP_ENV = "staging";
    staging.WEB_PUSH_VAPID_PRIVATE_KEY = "private";
    staging.WEB_PUSH_SUBJECT = "mailto:test@example.com";
    const stagingCookie = await register(app, staging, "staging@example.com");
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie: stagingCookie },
        body: JSON.stringify({ name: "Staging" })
      }),
      staging
    );
    expect(
      (
        await app.fetch(
          request("/api/notifications/test", {
            method: "POST",
            headers: { cookie: stagingCookie },
            body: "{}"
          }),
          staging
        )
      ).status
    ).toBe(409);

    const production = createTestEnv(new MemoryD1(), "public-key");
    production.APP_ENV = "production";
    const productionCookie = await register(app, production, "production@example.com");
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie: productionCookie },
        body: JSON.stringify({ name: "Production" })
      }),
      production
    );
    expect(
      (
        await app.fetch(
          request("/api/notifications/test", {
            method: "POST",
            headers: { cookie: productionCookie },
            body: "{}"
          }),
          production
        )
      ).status
    ).toBe(404);
  });

  it("returns safe web push failure diagnostics without sensitive fields", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const user = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );
    const vapid = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    env.WEB_PUSH_VAPID_PUBLIC_KEY = bytesToBase64Url(
      new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey))
    );
    env.WEB_PUSH_VAPID_PRIVATE_KEY = JSON.stringify(
      await crypto.subtle.exportKey("jwk", vapid.privateKey)
    );
    env.WEB_PUSH_SUBJECT = "mailto:test@example.com";
    const cookie = await register(app, env, "diagnostics@example.com");
    await app.fetch(
      request("/api/households", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ name: "Diagnostics" })
      }),
      env
    );
    await app.fetch(
      request("/api/notifications/subscriptions", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({
          endpoint: "https://127.0.0.1:1/push",
          keys: {
            p256dh: bytesToBase64Url(
              new Uint8Array(await crypto.subtle.exportKey("raw", user.publicKey))
            ),
            auth: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))
          }
        })
      }),
      env
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const response = await app.fetch(
      request("/api/notifications/test", {
        method: "POST",
        headers: { cookie },
        body: "{}"
      }),
      env
    );
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "WEB_PUSH_SEND_FAILED",
        details: {
          stage: "network",
          category: "network_failed",
          requestPhase: "fetch_call",
          errorName: "Error",
          pushService: "unknown"
        }
      }
    });
    expect(JSON.stringify(body)).not.toMatch(/endpoint|p256dh|auth|vapid|authorization|secret/i);
    vi.restoreAllMocks();
  });
});
