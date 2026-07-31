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

describe("worker app task API", () => {
  it("creates tasks, lists today/week scopes, changes state, and aggregates dashboard data", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const owner = await registerUser(env, {
      email: "task-owner@example.com",
      password: "very-long-password",
      displayName: "Owner"
    });
    await app.fetch(postJson("/api/households", { name: "Task House" }, owner.cookie), env);

    const inviteResponse = await app.fetch(
      postJson("/api/households/current/invites", {}, owner.cookie),
      env
    );
    const inviteJson: { data: { invite: { code: string } } } = await inviteResponse.json();
    const member = await registerUser(env, {
      email: "task-member@example.com",
      password: "very-long-password",
      displayName: "Member"
    });
    await app.fetch(postJson("/api/households/join", { code: inviteJson.data.invite.code }, member.cookie), env);

    const memberId = Array.from(db.users.values()).find((user) => user.email === "task-member@example.com")!.id;
    const dailyResponse = await app.fetch(
      postJson(
        "/api/tasks",
        {
          title: "Morning food",
          description: "Check water too",
          recurrenceType: "daily",
          assignmentType: "anyone",
          scheduledTime: "09:00",
          notificationSlot: "morning"
        },
        owner.cookie
      ),
      env
    );
    expect(dailyResponse.status).toBe(201);
    const dailyJson: { data: { task: { id: string } } } = await dailyResponse.json();

    const scheduled = await app.fetch(
      postJson(
        "/api/tasks",
        {
          title: "Sheets",
          recurrenceType: "scheduled",
          assignmentType: "specific",
          assignedUserId: memberId,
          notificationSlot: "none",
          weekdays: [5]
        },
        owner.cookie
      ),
      env
    );
    expect(scheduled.status).toBe(201);

    const weekly = await app.fetch(
      postJson(
        "/api/tasks",
        {
          title: "Cleaning",
          recurrenceType: "weekly",
          assignmentType: "anyone",
          notificationSlot: "none",
          weeklyTargetCount: 2
        },
        owner.cookie
      ),
      env
    );
    expect(weekly.status).toBe(201);

    const today = await app.fetch(
      new Request("https://example.test/api/tasks/today?date=2026-07-31", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(today.json()).resolves.toMatchObject({
      ok: true,
      data: { tasks: [{ title: "Morning food" }, { title: "Sheets" }] }
    });

    const week = await app.fetch(
      new Request("https://example.test/api/tasks/week?weekStart=2026-07-27", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(week.json()).resolves.toMatchObject({
      ok: true,
      data: { tasks: [{ title: "Cleaning", targetCount: 2, completedCount: 0 }] }
    });

    const start = await app.fetch(
      postJson(`/api/tasks/${dailyJson.data.task.id}/start`, { targetDate: "2026-07-31" }, owner.cookie),
      env
    );
    expect(start.status).toBe(200);

    const duplicateStart = await app.fetch(
      postJson(`/api/tasks/${dailyJson.data.task.id}/start`, { targetDate: "2026-07-31" }, member.cookie),
      env
    );
    expect(duplicateStart.status).toBe(409);

    const complete = await app.fetch(
      postJson(`/api/tasks/${dailyJson.data.task.id}/complete`, { targetDate: "2026-07-31" }, owner.cookie),
      env
    );
    expect(complete.status).toBe(200);

    const history = await app.fetch(
      new Request(`https://example.test/api/tasks/${dailyJson.data.task.id}/history`, {
        headers: { cookie: member.cookie }
      }),
      env
    );
    await expect(history.json()).resolves.toMatchObject({
      ok: true,
      data: { records: [{ status: "completed", actedBy: { displayName: "Owner" } }] }
    });

    const dashboard = await app.fetch(
      new Request("https://example.test/api/dashboard/today?date=2026-07-31", {
        headers: { cookie: member.cookie }
      }),
      env
    );
    await expect(dashboard.json()).resolves.toMatchObject({
      ok: true,
      data: {
        summary: { total: 2, completed: 1, pending: 1 },
        weeklyTasks: [{ title: "Cleaning" }],
        members: [{ displayName: "Owner" }, { displayName: "Member" }]
      }
    });
  });

  it("rejects assigning a task to another household member", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, {
      email: "task-a@example.com",
      password: "very-long-password",
      displayName: "Owner A"
    });
    await app.fetch(postJson("/api/households", { name: "A" }, owner.cookie), env);
    const outsider = await registerUser(env, {
      email: "task-b@example.com",
      password: "very-long-password",
      displayName: "Owner B"
    });
    const outsiderId = Array.from((env.DB as unknown as MemoryD1).users.values()).find(
      (user) => user.email === "task-b@example.com"
    )!.id;

    const response = await app.fetch(
      postJson(
        "/api/tasks",
        {
          title: "Specific",
          recurrenceType: "daily",
          assignmentType: "specific",
          assignedUserId: outsiderId,
          notificationSlot: "none"
        },
        owner.cookie
      ),
      env
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ASSIGNEE_NOT_HOUSEHOLD_MEMBER" }
    });
    expect(outsider.cookie).toContain("house_todo_session=");
  });
});
