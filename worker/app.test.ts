import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryD1 } from "./test-utils/memory-d1";
import type { Env } from "./types/env";

const createTestEnv = (db = new MemoryD1()): Env =>
  ({
    DB: db as unknown as D1Database,
    ATTACHMENTS: {},
    ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
    APP_ENV: "test",
    ALLOWED_ORIGINS: "https://example.test,http://localhost:5174"
  }) as unknown as Env;

const postJson = (path: string, body: unknown, cookie?: string, origin = "https://example.test") =>
  new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });

const patchJson = (path: string, body: unknown, cookie?: string) =>
  new Request(`https://example.test${path}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });

const cookieFrom = (response: Response): string => response.headers.get("set-cookie") ?? "";

const registerUser = async (
  env: Env,
  input = {
    email: "user@example.com",
    password: "very-long-password",
    displayName: "Codex Test"
  }
) => {
  const response = await createApp().fetch(postJson("/api/auth/register", input), env);
  return { response, cookie: cookieFrom(response) };
};

describe("worker app auth API", () => {
  it("registers, reads the current user, and logs out", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const register = await app.fetch(
      postJson("/api/auth/register", {
        email: " User@Example.COM ",
        password: "very-long-password",
        displayName: "Codex Test"
      }),
      env
    );
    const cookie = cookieFrom(register);

    expect(register.status).toBe(201);
    expect(cookie).toContain("house_todo_session=");

    const me = await app.fetch(
      new Request("https://example.test/api/auth/me", {
        headers: { cookie }
      }),
      env
    );
    await expect(me.json()).resolves.toMatchObject({
      ok: true,
      data: { user: { email: "user@example.com", displayName: "Codex Test" } }
    });

    const logout = await app.fetch(postJson("/api/auth/logout", {}, cookie), env);
    expect(logout.status).toBe(200);

    const afterLogout = await app.fetch(
      new Request("https://example.test/api/auth/me", {
        headers: { cookie }
      }),
      env
    );
    expect(afterLogout.status).toBe(401);
  });

  it("rejects duplicate emails and wrong passwords", async () => {
    const app = createApp();
    const env = createTestEnv();
    const input = {
      email: "user@example.com",
      password: "very-long-password",
      displayName: "Codex Test"
    };

    expect((await app.fetch(postJson("/api/auth/register", input), env)).status).toBe(201);
    expect((await app.fetch(postJson("/api/auth/register", input), env)).status).toBe(409);
    expect(
      (
        await app.fetch(
          postJson("/api/auth/login", {
            email: "user@example.com",
            password: "wrong-password"
          }),
          env
        )
      ).status
    ).toBe(401);
  });
});

describe("worker app state-changing request protection", () => {
  it("allows configured origins and rejects invalid origins", async () => {
    const env = createTestEnv();
    const allowed = await createApp().fetch(
      postJson("/api/auth/register", {
        email: "origin@example.com",
        password: "very-long-password",
        displayName: "Origin"
      }),
      env
    );
    expect(allowed.status).toBe(201);

    const rejected = await createApp().fetch(
      postJson(
        "/api/auth/register",
        {
          email: "blocked@example.com",
          password: "very-long-password",
          displayName: "Blocked"
        },
        undefined,
        "https://evil.example"
      ),
      env
    );
    await expect(rejected.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_ORIGIN" }
    });
    expect(rejected.status).toBe(403);
  });

  it("allows GET without Origin and rejects non-JSON state changes", async () => {
    const env = createTestEnv();
    const get = await createApp().fetch(new Request("https://example.test/api/health"), env);
    expect(get.status).toBe(200);

    const response = await createApp().fetch(
      new Request("https://example.test/api/auth/register", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "text/plain" },
        body: "nope"
      }),
      env
    );
    expect(response.status).toBe(400);
  });
});

describe("worker app household API", () => {
  it("creates, reads, and updates the current household as owner", async () => {
    const app = createApp();
    const env = createTestEnv();
    const { cookie } = await registerUser(env);

    const empty = await app.fetch(
      new Request("https://example.test/api/households/current", { headers: { cookie } }),
      env
    );
    await expect(empty.json()).resolves.toMatchObject({
      ok: true,
      data: { household: null }
    });

    const created = await app.fetch(postJson("/api/households", { name: " わが家 " }, cookie), env);
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      ok: true,
      data: { household: { name: "わが家", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" } }
    });

    const duplicate = await app.fetch(postJson("/api/households", { name: "別宅" }, cookie), env);
    await expect(duplicate.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "HOUSEHOLD_LIMIT_REACHED" }
    });

    const updated = await app.fetch(
      patchJson("/api/households/current", { name: "新しい家", weekStartsOn: 0 }, cookie),
      env
    );
    await expect(updated.json()).resolves.toMatchObject({
      ok: true,
      data: { household: { name: "新しい家", weekStartsOn: 0, role: "owner" } }
    });
  });

  it("invites another user, lists members, and rejects member-only owner actions", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const owner = await registerUser(env, {
      email: "owner@example.com",
      password: "very-long-password",
      displayName: "Owner"
    });
    await app.fetch(postJson("/api/households", { name: "招待の家" }, owner.cookie), env);

    const inviteResponse = await app.fetch(
      postJson("/api/households/current/invites", {}, owner.cookie),
      env
    );
    expect(inviteResponse.status).toBe(201);
    const inviteJson: {
      data: { invite: { code: string; expiresAt: string } };
    } = await inviteResponse.json();
    expect(Array.from(db.invites.values())[0]?.code_hash).not.toBe(inviteJson.data.invite.code);

    const member = await registerUser(env, {
      email: "member@example.com",
      password: "very-long-password",
      displayName: "Member"
    });
    const joined = await app.fetch(
      postJson("/api/households/join", { code: inviteJson.data.invite.code }, member.cookie),
      env
    );
    await expect(joined.json()).resolves.toMatchObject({
      ok: true,
      data: { household: { name: "招待の家", role: "member" } }
    });

    const members = await app.fetch(
      new Request("https://example.test/api/households/current/members", {
        headers: { cookie: member.cookie }
      }),
      env
    );
    await expect(members.json()).resolves.toMatchObject({
      ok: true,
      data: {
        members: [
          { displayName: "Owner", role: "owner" },
          { displayName: "Member", role: "member" }
        ]
      }
    });

    const memberUpdate = await app.fetch(
      patchJson("/api/households/current", { name: "乗っ取り不可" }, member.cookie),
      env
    );
    expect(memberUpdate.status).toBe(403);

    const usedAgain = await app.fetch(
      postJson("/api/households/join", { code: inviteJson.data.invite.code }, member.cookie),
      env
    );
    expect(usedAgain.status).toBe(409);
  });
});
