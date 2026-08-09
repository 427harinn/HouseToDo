import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";

const createTestEnv = (db = new MemoryD1(), publicKey?: string): Env => ({
  DB: db as unknown as D1Database,
  ATTACHMENTS: new MemoryR2(),
  ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
  APP_ENV: "test",
  ALLOWED_ORIGINS: "https://example.test",
  WEB_PUSH_VAPID_PUBLIC_KEY: publicKey
} as unknown as Env);

const request = (path: string, init: RequestInit = {}) => new Request(`https://example.test${path}`, {
  ...init,
  headers: { "content-type": "application/json", origin: "https://example.test", ...(init.headers ?? {}) }
});

const register = async (app: ReturnType<typeof createApp>, env: Env, email: string) => {
  const response = await app.fetch(request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: "very-long-password", displayName: email }) }), env);
  return response.headers.get("set-cookie") ?? "";
};

describe("notification subscription API", () => {
  it("returns only the configured public key for authenticated users", async () => {
    const app = createApp();
    const env = createTestEnv(undefined, "public-key");
    const cookie = await register(app, env, "vapid@example.com");
    expect((await app.fetch(request("/api/notifications/vapid-public-key", { headers: { cookie } }), env)).status).toBe(200);
    await expect(app.fetch(request("/api/notifications/vapid-public-key"), env)).resolves.toMatchObject({ status: 401 });
    const body: unknown = await (await app.fetch(request("/api/notifications/vapid-public-key", { headers: { cookie } }), env)).json();
    expect(body).toMatchObject({ ok: true, data: { publicKey: "public-key" } });
    expect(JSON.stringify(body)).not.toContain("private");
  });

  it("requires config and upserts one endpoint while isolating deletion", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const ownerCookie = await register(app, env, "owner@example.com");
    const memberCookie = await register(app, env, "member@example.com");
    expect((await app.fetch(request("/api/notifications/vapid-public-key", { headers: { cookie: ownerCookie } }), env)).status).toBe(503);
    await app.fetch(request("/api/households", { method: "POST", headers: { cookie: ownerCookie }, body: JSON.stringify({ name: "House" }) }), env);
    const endpoint = "https://push.example.test/send/endpoint-1";
    const body = JSON.stringify({ endpoint, keys: { p256dh: "AQID", auth: "BAUG" } });
    expect((await app.fetch(request("/api/notifications/subscriptions", { method: "POST", headers: { cookie: ownerCookie }, body }), env)).status).toBe(201);
    expect((await app.fetch(request("/api/notifications/subscriptions", { method: "POST", headers: { cookie: ownerCookie }, body: JSON.stringify({ endpoint, keys: { p256dh: "BwgJ", auth: "CgsM" } }) }), env)).status).toBe(201);
    expect(db.pushSubscriptions.size).toBe(1);
    expect((await app.fetch(request("/api/notifications/subscriptions", { method: "DELETE", headers: { cookie: memberCookie }, body: JSON.stringify({ endpoint }) }), env)).status).toBe(404);
    expect((await app.fetch(request("/api/notifications/subscriptions", { method: "DELETE", headers: { cookie: ownerCookie }, body: JSON.stringify({ endpoint }) }), env)).status).toBe(200);
    expect(db.pushSubscriptions.size).toBe(0);
    expect((await app.fetch(request("/api/notifications/subscriptions", { method: "DELETE", headers: { cookie: ownerCookie }, body: JSON.stringify({ endpoint }) }), env)).status).toBe(200);
  });

  it("rejects insecure subscription endpoints", async () => {
    const app = createApp();
    const env = createTestEnv();
    const cookie = await register(app, env, "invalid@example.com");
    await app.fetch(request("/api/households", { method: "POST", headers: { cookie }, body: JSON.stringify({ name: "House" }) }), env);
    const response = await app.fetch(request("/api/notifications/subscriptions", { method: "POST", headers: { cookie }, body: JSON.stringify({ endpoint: "http://push.example.test", keys: { p256dh: "AQID", auth: "BAUG" } }) }), env);
    expect(response.status).toBe(400);
  });
});
