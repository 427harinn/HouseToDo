import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryD1 } from "./test-utils/memory-d1";
import type { Env } from "./types/env";
import { MemoryR2 } from "./test-utils/memory-r2";
import { ShoppingItemImageService } from "./services/shopping-item-image-service";

const createTestEnv = (db = new MemoryD1()): Env =>
  ({
    DB: db as unknown as D1Database,
    ATTACHMENTS: new MemoryR2(),
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

describe("worker shopping image API", () => {
  it("uploads, replaces, serves, and deletes a private shopping image", async () => {
    const app = createApp();
    const env = createTestEnv();
    const { cookie } = await registerUser(env, { email: "image@example.com", password: "very-long-password", displayName: "Image" });
    await app.fetch(postJson("/api/households", { name: "Image home" }, cookie), env);
    const created = await app.fetch(postJson("/api/shopping/items", { name: "Milk" }, cookie), env);
    const createdJson: { data: { item: { id: string } } } = await created.json();
    const itemId = createdJson.data.item.id;
    const webp = new Uint8Array([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80, 0, 0, 0, 0]);
    const userId = Array.from((env.DB as unknown as MemoryD1).users.keys())[0];
    const imageService = new ShoppingItemImageService(env.DB, env.ATTACHMENTS);
    await imageService.upload(userId, itemId, { body: new Uint8Array([...webp, 1]).buffer, width: 80, height: 60 });
    const first = (env.ATTACHMENTS as unknown as MemoryR2).objects.size;
    expect(first).toBe(1);
    await imageService.upload(userId, itemId, { body: new Uint8Array([...webp, 2]).buffer, width: 80, height: 60 });
    expect((env.ATTACHMENTS as unknown as MemoryR2).objects.size).toBe(1);
    const image = await app.fetch(new Request(`https://example.test/api/shopping/items/${itemId}/image`, { headers: { cookie } }), env);
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toContain("private");
    expect((await image.arrayBuffer()).byteLength).toBe(17);
    expect((await app.fetch(new Request(`https://example.test/api/shopping/items/${itemId}/image`, { method: "DELETE", headers: { origin: "https://example.test", cookie, "content-type": "application/json" }, body: "{}" }), env)).status).toBe(200);
    expect((await app.fetch(new Request(`https://example.test/api/shopping/items/${itemId}/image`, { headers: { cookie } }), env)).status).toBe(404);
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

describe("worker app shopping API", () => {
  it("shares shopping items, preserves purchaser, clears purchased, and uses templates", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const owner = await registerUser(env, {
      email: "shop-owner@example.com",
      password: "very-long-password",
      displayName: "Shop Owner"
    });
    await app.fetch(postJson("/api/households", { name: "Shopping House" }, owner.cookie), env);
    const inviteResponse = await app.fetch(
      postJson("/api/households/current/invites", {}, owner.cookie),
      env
    );
    const inviteJson: { data: { invite: { code: string } } } = await inviteResponse.json();
    const member = await registerUser(env, {
      email: "shop-member@example.com",
      password: "very-long-password",
      displayName: "Shop Member"
    });
    await app.fetch(postJson("/api/households/join", { code: inviteJson.data.invite.code }, member.cookie), env);

    const milk = await app.fetch(
      postJson(
        "/api/shopping/items",
        { name: " 牛乳 ", quantity: "1本", note: "低脂肪ではないもの" },
        owner.cookie
      ),
      env
    );
    expect(milk.status).toBe(201);
    const milkJson: { data: { item: { id: string } } } = await milk.json();
    await app.fetch(postJson("/api/shopping/items", { name: "卵", quantity: "1パック" }, owner.cookie), env);

    const memberList = await app.fetch(
      new Request("https://example.test/api/shopping/items", { headers: { cookie: member.cookie } }),
      env
    );
    await expect(memberList.json()).resolves.toMatchObject({
      ok: true,
      data: { pending: [{ name: "牛乳", quantity: "1本" }, { name: "卵" }], purchased: [] }
    });

    const purchased = await app.fetch(
      postJson(`/api/shopping/items/${milkJson.data.item.id}/purchase`, {}, owner.cookie),
      env
    );
    await expect(purchased.json()).resolves.toMatchObject({
      ok: true,
      data: { item: { status: "purchased", purchasedBy: { displayName: "Shop Owner" } } }
    });

    const repurchase = await app.fetch(
      postJson(`/api/shopping/items/${milkJson.data.item.id}/purchase`, {}, member.cookie),
      env
    );
    await expect(repurchase.json()).resolves.toMatchObject({
      ok: true,
      data: { item: { status: "purchased", purchasedBy: { displayName: "Shop Owner" } } }
    });

    await app.fetch(postJson(`/api/shopping/items/${milkJson.data.item.id}/unpurchase`, {}, member.cookie), env);
    const pendingAgain = await app.fetch(
      new Request(`https://example.test/api/shopping/items/${milkJson.data.item.id}`, {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(pendingAgain.json()).resolves.toMatchObject({
      ok: true,
      data: { item: { status: "pending", purchasedBy: null, purchasedAt: null } }
    });

    const template = await app.fetch(
      postJson("/api/shopping/templates", { name: "牛乳", quantity: "2本", note: "いつものメーカー" }, owner.cookie),
      env
    );
    expect(template.status).toBe(201);
    const templateJson: { data: { template: { id: string } } } = await template.json();
    const added = await app.fetch(
      postJson(`/api/shopping/templates/${templateJson.data.template.id}/add`, {}, member.cookie),
      env
    );
    const addedJson: { data: { item: { id: string } } } = await added.json();
    expect(addedJson).toMatchObject({
      ok: true,
      data: { item: { name: "牛乳", quantity: "2本", note: "いつものメーカー", status: "pending" } }
    });

    await app.fetch(
      patchJson(
        `/api/shopping/templates/${templateJson.data.template.id}`,
        { quantity: "1本", note: "変更後" },
        owner.cookie
      ),
      env
    );
    const copiedItem = await app.fetch(
      new Request(`https://example.test/api/shopping/items/${addedJson.data.item.id}`, {
        headers: { cookie: member.cookie }
      }),
      env
    );
    await expect(copiedItem.json()).resolves.toMatchObject({
      ok: true,
      data: { item: { quantity: "2本", note: "いつものメーカー" } }
    });

    await app.fetch(
      new Request(`https://example.test/api/shopping/templates/${templateJson.data.template.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json", origin: "https://example.test", cookie: owner.cookie },
        body: "{}"
      }),
      env
    );
    const inactiveAdd = await app.fetch(
      postJson(`/api/shopping/templates/${templateJson.data.template.id}/add`, {}, member.cookie),
      env
    );
    expect(inactiveAdd.status).toBe(409);

    await app.fetch(postJson(`/api/shopping/items/${milkJson.data.item.id}/purchase`, {}, owner.cookie), env);
    const cleared = await app.fetch(postJson("/api/shopping/items/clear-purchased", {}, member.cookie), env);
    await expect(cleared.json()).resolves.toMatchObject({
      ok: true,
      data: { clearedCount: 1 }
    });

    const dashboard = await app.fetch(
      new Request("https://example.test/api/dashboard/today?date=2026-07-31", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    const dashboardJson: { data: { shopping: { pendingCount: number; previewItems: Array<{ name: string }> } } } =
      await dashboard.json();
    expect(dashboardJson.data.shopping.pendingCount).toBe(2);
    expect(dashboardJson.data.shopping.previewItems.map((item) => item.name)).toContain("卵");
  });

  it("rejects validation errors and hides another household shopping data", async () => {
    const app = createApp();
    const env = createTestEnv();
    const ownerA = await registerUser(env, {
      email: "shop-a@example.com",
      password: "very-long-password",
      displayName: "A"
    });
    await app.fetch(postJson("/api/households", { name: "A House" }, ownerA.cookie), env);
    const ownerB = await registerUser(env, {
      email: "shop-b@example.com",
      password: "very-long-password",
      displayName: "B"
    });
    await app.fetch(postJson("/api/households", { name: "B House" }, ownerB.cookie), env);

    const invalid = await app.fetch(postJson("/api/shopping/items", { name: "   " }, ownerA.cookie), env);
    expect(invalid.status).toBe(400);

    const item = await app.fetch(postJson("/api/shopping/items", { name: "別家庭の牛乳" }, ownerA.cookie), env);
    const itemJson: { data: { item: { id: string } } } = await item.json();
    const hidden = await app.fetch(
      new Request(`https://example.test/api/shopping/items/${itemJson.data.item.id}`, {
        headers: { cookie: ownerB.cookie }
      }),
      env
    );
    expect(hidden.status).toBe(404);
  });
});
