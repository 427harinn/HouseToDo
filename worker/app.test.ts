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

const itemIdFrom = async (response: Response): Promise<string> => {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("data" in body) || typeof body.data !== "object" || body.data === null || !("item" in body.data) || typeof body.data.item !== "object" || body.data.item === null || !("id" in body.data.item) || typeof body.data.item.id !== "string") throw new Error("item response was malformed");
  return body.data.item.id;
};

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

describe("household image usage API", () => {
  it("returns current-household usage for owner and member without touching R2", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, { email: "usage-owner@example.com", password: "very-long-password", displayName: "Usage Owner" });
    const member = await registerUser(env, { email: "usage-member@example.com", password: "very-long-password", displayName: "Usage Member" });
    await app.fetch(postJson("/api/households", { name: "Usage House" }, owner.cookie), env);
    const invite = await app.fetch(postJson("/api/households/current/invites", {}, owner.cookie), env);
    const inviteBody: unknown = await invite.json();
    if (typeof inviteBody !== "object" || inviteBody === null || !("data" in inviteBody) || typeof inviteBody.data !== "object" || inviteBody.data === null || !("invite" in inviteBody.data) || typeof inviteBody.data.invite !== "object" || inviteBody.data.invite === null || !("code" in inviteBody.data.invite) || typeof inviteBody.data.invite.code !== "string") throw new Error("invite response was malformed");
    await app.fetch(postJson("/api/households/join", { code: inviteBody.data.invite.code }, member.cookie), env);

    const ownerResponse = await app.fetch(new Request("https://example.test/api/households/current/image-usage", { headers: { cookie: owner.cookie } }), env);
    const memberResponse = await app.fetch(new Request("https://example.test/api/households/current/image-usage", { headers: { cookie: member.cookie } }), env);
    expect(ownerResponse.status).toBe(200);
    expect(memberResponse.status).toBe(200);
    const ownerBody: unknown = await ownerResponse.json();
    const memberBody: unknown = await memberResponse.json();
    expect(ownerBody).toMatchObject({ ok: true, data: { activeCount: 0, activeBytes: 0, reservedCount: 0, reservedBytes: 0, storedBytesKnown: true, activeCountLimit: 50, activeBytesLimit: 52428800, storedBytesLimit: 78643200, dailyUploadLimit: 20 } });
    expect(memberBody).toMatchObject({ ok: true, data: { activeCount: 0, activeBytes: 0 } });
    expect(typeof (ownerBody as { requestId?: unknown }).requestId).toBe("string");
    expect(typeof (memberBody as { requestId?: unknown }).requestId).toBe("string");
    await expect(app.fetch(new Request("https://example.test/api/households/current/image-usage"), env)).resolves.toMatchObject({ status: 401 });
  });
});

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

  it("returns a safe 500 when the users insert fails", async () => {
    const db = new MemoryD1((sql) => {
      if (sql.startsWith("INSERT INTO users")) {
        throw new Error("D1 insert failed for secret-user@example.invalid");
      }
    });
    const response = await createApp().fetch(
      postJson("/api/auth/register", {
        email: "secret-user@example.invalid",
        password: "very-long-password",
        displayName: "Codex Test"
      }),
      createTestEnv(db)
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain('"code":"INTERNAL_ERROR"');
    expect(body).not.toContain("secret-user@example.invalid");
    expect(body).not.toContain("very-long-password");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns a safe 500 when the sessions insert fails", async () => {
    const db = new MemoryD1((sql) => {
      if (sql.startsWith("INSERT INTO sessions")) {
        throw new Error("D1 session insert failed for secret-session@example.invalid");
      }
    });
    const response = await createApp().fetch(
      postJson("/api/auth/register", {
        email: "secret-session@example.invalid",
        password: "very-long-password",
        displayName: "Codex Test"
      }),
      createTestEnv(db)
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain('"code":"INTERNAL_ERROR"');
    expect(body).not.toContain("secret-session@example.invalid");
    expect(body).not.toContain("very-long-password");
    expect(response.headers.get("set-cookie")).toBeNull();
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
    expect((env.DB as unknown as MemoryD1).householdImageUsage.get(Array.from((env.DB as unknown as MemoryD1).households.keys())[0])).toMatchObject({ active_count: 1, active_bytes: 17, reserved_count: 0, reserved_bytes: 0, daily_upload_count: 2 });
    const image = await app.fetch(new Request(`https://example.test/api/shopping/items/${itemId}/image`, { headers: { cookie } }), env);
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toContain("private");
    expect((await image.arrayBuffer()).byteLength).toBe(17);
    expect((await app.fetch(new Request(`https://example.test/api/shopping/items/${itemId}/image`, { method: "DELETE", headers: { origin: "https://example.test", cookie, "content-type": "application/json" }, body: "{}" }), env)).status).toBe(200);
    expect((env.DB as unknown as MemoryD1).householdImageUsage.get(Array.from((env.DB as unknown as MemoryD1).households.keys())[0])).toMatchObject({ active_count: 0, active_bytes: 0, reserved_count: 0, reserved_bytes: 0, daily_upload_count: 2 });
    expect((await app.fetch(new Request(`https://example.test/api/shopping/items/${itemId}/image`, { headers: { cookie } }), env)).status).toBe(404);
  });

  it("updates active usage when an item or purchased batch deletes its images", async () => {
    const app = createApp();
    const env = createTestEnv();
    const { cookie } = await registerUser(env, { email: "image-delete@example.com", password: "very-long-password", displayName: "Image delete" });
    await app.fetch(postJson("/api/households", { name: "Image delete home" }, cookie), env);
    const userId = Array.from((env.DB as unknown as MemoryD1).users.keys())[0];
    const imageService = new ShoppingItemImageService(env.DB, env.ATTACHMENTS);
    const webp = new Uint8Array([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80, 0, 0, 0, 0, 1]);
    const first = await app.fetch(postJson("/api/shopping/items", { name: "Delete me" }, cookie), env);
    const firstId = await itemIdFrom(first);
    await imageService.upload(userId, firstId, { body: webp.buffer, width: 80, height: 60 });
    await app.fetch(new Request(`https://example.test/api/shopping/items/${firstId}`, { method: "DELETE", headers: { origin: "https://example.test", cookie, "content-type": "application/json" }, body: "{}" }), env);
    expect((env.DB as unknown as MemoryD1).householdImageUsage.get(Array.from((env.DB as unknown as MemoryD1).households.keys())[0])).toMatchObject({ active_count: 0, active_bytes: 0 });
    const second = await app.fetch(postJson("/api/shopping/items", { name: "Purchased one" }, cookie), env);
    const secondId = await itemIdFrom(second);
    await imageService.upload(userId, secondId, { body: webp.buffer, width: 80, height: 60 });
    await app.fetch(postJson(`/api/shopping/items/${secondId}/purchase`, {}, cookie), env);
    const third = await app.fetch(postJson("/api/shopping/items", { name: "Purchased two" }, cookie), env);
    const thirdId = await itemIdFrom(third);
    await imageService.upload(userId, thirdId, { body: webp.buffer, width: 80, height: 60 });
    await app.fetch(postJson(`/api/shopping/items/${thirdId}/purchase`, {}, cookie), env);
    const householdId = Array.from((env.DB as unknown as MemoryD1).households.keys())[0];
    expect((env.DB as unknown as MemoryD1).householdImageUsage.get(householdId)).toMatchObject({ active_count: 2, active_bytes: 34 });
    await app.fetch(postJson("/api/shopping/items/clear-purchased", {}, cookie), env);
    expect((env.DB as unknown as MemoryD1).householdImageUsage.get(householdId)).toMatchObject({ active_count: 0, active_bytes: 0 });
    expect((env.ATTACHMENTS as unknown as MemoryR2).objects.size).toBe(0);
  });

  it("queues a failed image delete and still removes it from active usage", async () => {
    const app = createApp();
    const env = createTestEnv();
    const { cookie } = await registerUser(env, { email: "image-delete-failure@example.com", password: "very-long-password", displayName: "Image delete failure" });
    await app.fetch(postJson("/api/households", { name: "Image delete failure home" }, cookie), env);
    const userId = Array.from((env.DB as unknown as MemoryD1).users.keys())[0];
    const itemResponse = await app.fetch(postJson("/api/shopping/items", { name: "Queue delete" }, cookie), env);
    const itemId = await itemIdFrom(itemResponse);
    const image = await new ShoppingItemImageService(env.DB, env.ATTACHMENTS).upload(userId, itemId, { body: new Uint8Array([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80, 0, 0, 0, 0, 1]).buffer, width: 80, height: 60 });
    (env.ATTACHMENTS as unknown as MemoryR2).deleteFailures.set(image.r2Key, new Error("injected delete failure"));
    const response = await app.fetch(new Request(`https://example.test/api/shopping/items/${itemId}/image`, { method: "DELETE", headers: { origin: "https://example.test", cookie, "content-type": "application/json" }, body: "{}" }), env);
    const householdId = Array.from((env.DB as unknown as MemoryD1).households.keys())[0];
    expect(response.status).toBe(200);
    expect((env.DB as unknown as MemoryD1).householdImageUsage.get(householdId)).toMatchObject({ active_count: 0, active_bytes: 0, pending_cleanup_bytes: 17 });
    expect(Array.from((env.DB as unknown as MemoryD1).orphanR2Objects.values())).toHaveLength(1);
    expect(Array.from((env.DB as unknown as MemoryD1).orphanR2Objects.values())[0]).toMatchObject({ byte_size: 17, household_id: householdId });
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
          notificationSlot: "morning",
          notificationTime: "07:30"
        },
        owner.cookie
      ),
      env
    );
    expect(dailyResponse.status).toBe(201);
    const dailyJson: { data: { task: { id: string; scheduledTime: string | null; notificationTime: string | null } } } = await dailyResponse.json();
    expect(dailyJson.data.task.scheduledTime).toBe("09:00");
    expect(dailyJson.data.task.notificationTime).toBe("07:30");
    expect(db.tasks.get(dailyJson.data.task.id)?.scheduled_time).toBe("09:00");
    expect(db.tasks.get(dailyJson.data.task.id)?.notification_time).toBe("07:30");

    const dailyDetail = await app.fetch(
      new Request(`https://example.test/api/tasks/${dailyJson.data.task.id}`, {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(dailyDetail.json()).resolves.toMatchObject({
      ok: true,
      data: { task: { scheduledTime: "09:00", notificationTime: "07:30" } }
    });

    const noTime = {
      title: "Morning food",
      description: "Check water too",
      recurrenceType: "daily",
      assignmentType: "anyone",
      assignedUserId: null,
      scheduledTime: null,
      notificationSlot: "morning",
      notificationTime: null,
      weekdays: [],
      weeklyTargetCount: null
    };
    const changedTime = { ...noTime, scheduledTime: "10:30", notificationTime: "21:00" };
    const updateWithoutTime = await app.fetch(
      patchJson(`/api/tasks/${dailyJson.data.task.id}`, noTime, owner.cookie),
      env
    );
    expect(updateWithoutTime.status).toBe(200);
    await expect(updateWithoutTime.json()).resolves.toMatchObject({
      ok: true,
      data: { task: { scheduledTime: null, notificationTime: null } }
    });
    const updateWithTime = await app.fetch(
      patchJson(`/api/tasks/${dailyJson.data.task.id}`, changedTime, owner.cookie),
      env
    );
    expect(updateWithTime.status).toBe(200);
    await expect(updateWithTime.json()).resolves.toMatchObject({
      ok: true,
      data: { task: { scheduledTime: "10:30", notificationTime: "21:00" } }
    });
    expect(db.tasks.get(dailyJson.data.task.id)?.scheduled_time).toBe("10:30");
    expect(db.tasks.get(dailyJson.data.task.id)?.notification_time).toBe("21:00");

    const clearedNotification = await app.fetch(
      patchJson(`/api/tasks/${dailyJson.data.task.id}`, { ...changedTime, notificationTime: "" }, owner.cookie),
      env
    );
    expect(clearedNotification.status).toBe(200);
    await expect(clearedNotification.json()).resolves.toMatchObject({
      ok: true,
      data: { task: { notificationTime: null } }
    });
    expect(db.tasks.get(dailyJson.data.task.id)?.notification_time).toBeNull();

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
    const weeklyJson: { data: { task: { id: string; scheduledTime: string | null } } } = await weekly.json();
    expect(weeklyJson.data.task.scheduledTime).toBeNull();
    expect(db.tasks.get(weeklyJson.data.task.id)?.scheduled_time).toBeNull();

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

describe("redesigned task model API", () => {
  it("creates all six recurrences and keeps once/monthly tasks out of legacy scopes", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, { email: "model-owner@example.com", password: "very-long-password", displayName: "Model Owner" });
    await app.fetch(postJson("/api/households", { name: "Model House" }, owner.cookie), env);
    const common = { assignmentType: "anyone", notificationSlot: "none" };
    const cases = [
      { modelRecurrenceType: "once", targetDate: "2026-08-20" },
      { modelRecurrenceType: "daily" },
      { modelRecurrenceType: "weekly_fixed", weekdays: [1, 3] },
      { modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: 31 },
      { modelRecurrenceType: "weekly_flexible", weeklyDeadlineWeekday: 5 },
      { modelRecurrenceType: "monthly_flexible", monthlyDeadlineType: "day_of_month", monthlyDeadlineDay: 15 }
    ];
    const ids: string[] = [];
    for (const [index, recurrence] of cases.entries()) {
      const response = await app.fetch(postJson("/api/tasks", { title: `Model ${index}`, ...common, ...recurrence }, owner.cookie), env);
      expect(response.status, `recurrence ${recurrence.modelRecurrenceType}: ${await response.clone().text()}`).toBe(201);
      const body: { data: { task: { id: string; modelRecurrenceType: string; recurrenceType: string; monthlyDeadlineDay?: number | null } } } = await response.json();
      ids.push(body.data.task.id);
      expect(body.data.task.modelRecurrenceType).toBe(recurrence.modelRecurrenceType);
      if (["once", "monthly_fixed", "monthly_flexible"].includes(recurrence.modelRecurrenceType)) expect(body.data.task.recurrenceType).toBe("model_only");
    }
    const list = await app.fetch(new Request("https://example.test/api/tasks", { headers: { cookie: owner.cookie } }), env);
    const listBody: { data: { tasks: Array<{ id: string; modelRecurrenceType: string }> } } = await list.json();
    expect(listBody.data.tasks.filter((task) => ids.includes(task.id))).toHaveLength(6);
    const patch = await app.fetch(patchJson(`/api/tasks/${ids[2]}`, { modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: 30 }, owner.cookie), env);
    expect(patch.status).toBe(200);
    expect((env.DB as unknown as MemoryD1).taskWeekdays.size).toBe(0);
    const invalid = await app.fetch(postJson("/api/tasks", { title: "Invalid", ...common, modelRecurrenceType: "once" }, owner.cookie), env);
    expect(invalid.status).toBe(400);
  });

  it("projects fixed markers and flexible selected-date detail without generating occurrence rows", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, { email: "calendar-owner@example.com", password: "very-long-password", displayName: "Calendar Owner" });
    await app.fetch(postJson("/api/households", { name: "Calendar House" }, owner.cookie), env);
    const create = async (input: Record<string, unknown>) => {
      const response = await app.fetch(postJson("/api/tasks", {
        title: String(input.title),
        assignmentType: "anyone",
        notificationSlot: "none",
        startDate: "2026-08-01",
        ...input
      }, owner.cookie), env);
      expect(response.status).toBe(201);
      const body: { data: { task: { id: string } } } = await response.json();
      return body.data.task.id;
    };
    await create({ title: "once", modelRecurrenceType: "once", targetDate: "2026-08-14" });
    const dailyId = await create({ title: "daily", modelRecurrenceType: "daily" });
    await create({ title: "weekly fixed", modelRecurrenceType: "weekly_fixed", weekdays: [2, 5] });
    await create({ title: "monthly fixed", modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: 31 });
    const weeklyFlexibleId = await create({ title: "weekly flexible", modelRecurrenceType: "weekly_flexible", weeklyDeadlineWeekday: 5 });
    const monthlyFlexibleId = await create({ title: "monthly flexible", modelRecurrenceType: "monthly_flexible", monthlyDeadlineType: "month_end" });

    const calendar = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=2026-08-14", { headers: { cookie: owner.cookie } }), env);
    expect(calendar.status).toBe(200);
    const body: {
      data: {
        dates: Record<string, { fixedCount: number }>;
        selected: { fixed: Array<{ title: string }>; weeklyFlexible: Array<{ title: string; completedCount?: number }>; monthlyFlexible: Array<{ title: string }> };
      };
    } = await calendar.json();
    expect(body.data.dates["2026-08-14"]?.fixedCount).toBe(3);
    expect(body.data.dates["2026-08-15"]?.fixedCount).toBe(0);
    expect(body.data.selected.fixed.map((task) => task.title)).toEqual(expect.arrayContaining(["once", "daily", "weekly fixed"]));
    expect(body.data.selected.weeklyFlexible.map((task) => task.title)).toEqual(["weekly flexible"]);
    expect(body.data.selected.monthlyFlexible.map((task) => task.title)).toEqual(["monthly flexible"]);

    const invalidOccurrenceCalendarDate = await app.fetch(postJson(`/api/tasks/${dailyId}/complete`, { targetDate: "2026-08-14", calendarDate: "2026-08-15" }, owner.cookie), env);
    expect(invalidOccurrenceCalendarDate.status).toBe(400);
    const invalidWeeklyCalendarDate = await app.fetch(postJson(`/api/tasks/${weeklyFlexibleId}/complete`, { targetDate: "2026-08-14", calendarDate: "2026-08-16" }, owner.cookie), env);
    expect(invalidWeeklyCalendarDate.status).toBe(400);
    const invalidMonthlyCalendarDate = await app.fetch(postJson(`/api/tasks/${monthlyFlexibleId}/complete`, { targetDate: "2026-08-14", calendarDate: "2026-09-01" }, owner.cookie), env);
    expect(invalidMonthlyCalendarDate.status).toBe(400);

    await app.fetch(postJson(`/api/tasks/${dailyId}/complete`, { targetDate: "2026-08-14", calendarDate: "2026-08-14" }, owner.cookie), env);
    const completed = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=2026-08-14", { headers: { cookie: owner.cookie } }), env);
    const completedBody: { data: { selected: { fixed: Array<{ title: string; status: string }>; completed: Array<{ title: string }> } } } = await completed.json();
    expect(completedBody.data.selected.fixed.find((task) => task.title === "daily")).toBeUndefined();
    expect(completedBody.data.selected.completed.find((task) => task.title === "daily")).toBeTruthy();
    expect((env.DB as unknown as MemoryD1).taskRecords.size).toBe(1);

    await app.fetch(postJson(`/api/tasks/${weeklyFlexibleId}/complete`, { targetDate: "2026-08-14", calendarDate: "2026-08-14" }, owner.cookie), env);
    const weeklyFlexible = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=2026-08-14", { headers: { cookie: owner.cookie } }), env);
    const weeklyFlexibleBody: { data: { selected: { weeklyFlexible: Array<{ title: string; status: string; completedCount?: number }>; completed: Array<{ title: string }> } } } = await weeklyFlexible.json();
    expect(weeklyFlexibleBody.data.selected.weeklyFlexible).toHaveLength(0);
    expect(weeklyFlexibleBody.data.selected.completed.find((task) => task.title === "weekly flexible")).toBeTruthy();
    const nextWeek = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=2026-08-21", { headers: { cookie: owner.cookie } }), env);
    const nextWeekBody: { data: { selected: { weeklyFlexible: Array<{ title: string; status: string; completedCount?: number }> } } } = await nextWeek.json();
    expect(nextWeekBody.data.selected.weeklyFlexible[0]?.status).toBe("pending");
    expect(nextWeekBody.data.selected.weeklyFlexible[0]?.completedCount).toBe(0);
  });

  it("clamps monthly fixed markers and rejects oversized calendar ranges", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, { email: "calendar-clamp@example.com", password: "very-long-password", displayName: "Calendar Clamp" });
    await app.fetch(postJson("/api/households", { name: "Calendar Clamp House" }, owner.cookie), env);
    await app.fetch(postJson("/api/tasks", { title: "monthly 31", modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: 31, startDate: "2026-01-01", assignmentType: "anyone", notificationSlot: "none" }, owner.cookie), env);
    const february = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-02-01&to=2026-02-28&selectedDate=2026-02-28", { headers: { cookie: owner.cookie } }), env);
    const februaryBody: { data: { dates: Record<string, { fixedCount: number }> } } = await february.json();
    expect(februaryBody.data.dates["2026-02-28"]?.fixedCount).toBe(1);
    const april = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-04-01&to=2026-04-30&selectedDate=2026-04-30", { headers: { cookie: owner.cookie } }), env);
    const aprilBody: { data: { dates: Record<string, { fixedCount: number }> } } = await april.json();
    expect(aprilBody.data.dates["2026-04-30"]?.fixedCount).toBe(1);
    expect(aprilBody.data.dates["2026-04-29"]?.fixedCount).toBe(0);
    const may = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-05-01&to=2026-05-31&selectedDate=2026-05-31", { headers: { cookie: owner.cookie } }), env);
    const mayBody: { data: { dates: Record<string, { fixedCount: number }> } } = await may.json();
    expect(mayBody.data.dates["2026-05-31"]?.fixedCount).toBe(1);
    const oversized = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-01-01&to=2026-03-04", { headers: { cookie: owner.cookie } }), env);
    expect(oversized.status).toBe(400);
  });

  it("keeps inactive legacy flexible Calendar records visible and restoreable", async () => {
    const app = createApp();
    const env = createTestEnv();
    const db = env.DB as unknown as MemoryD1;
    const owner = await registerUser(env, { email: "calendar-legacy@example.com", password: "very-long-password", displayName: "Calendar Legacy" });
    await app.fetch(postJson("/api/households", { name: "Calendar Legacy House" }, owner.cookie), env);
    const created = await app.fetch(postJson("/api/tasks", {
      title: "旧週次家事",
      modelRecurrenceType: "weekly_flexible",
      weeklyDeadlineWeekday: 4,
      startDate: "2026-08-01",
      assignmentType: "anyone",
      notificationSlot: "none"
    }, owner.cookie), env);
    const createdBody: { data: { task: { id: string } } } = await created.json();
    const taskId = createdBody.data.task.id;
    await app.fetch(postJson(`/api/tasks/${taskId}/complete`, { targetDate: "2026-08-20", calendarDate: "2026-08-20" }, owner.cookie), env);
    const record = Array.from(db.taskRecords.values()).find((item) => item.task_id === taskId);
    if (!record) throw new Error("legacy flexible completion did not create a record");
    db.taskRecords.set(record.id, {
      ...record,
      target_date: null,
      calendar_action_date: null,
      completed_at: "2026-08-20T12:00:00.000Z",
      updated_at: "2026-08-20T12:00:00.000Z"
    });
    const deactivated = await app.fetch(new Request(`https://example.test/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: { cookie: owner.cookie, origin: "https://example.test", "content-type": "application/json" },
      body: "{}"
    }), env);
    expect(deactivated.status).toBe(200);

    const calendar = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=2026-08-20", { headers: { cookie: owner.cookie } }), env);
    expect(calendar.status).toBe(200);
    const body: { data: { selected: { completed: Array<{ id: string; periodKey: string | null; title: string; taskActive: boolean }> } } } = await calendar.json();
    expect(body.data.selected.completed).toEqual([expect.objectContaining({ id: record.id, periodKey: record.period_key, title: "旧週次家事", taskActive: false })]);

    const restored = await app.fetch(postJson(`/api/tasks/${taskId}/calendar-restore`, { recordId: record.id, calendarDate: "2026-08-20" }, owner.cookie), env);
    expect(restored.status).toBe(200);
    const afterRestore = await app.fetch(new Request("https://example.test/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=2026-08-20", { headers: { cookie: owner.cookie } }), env);
    const afterBody: { data: { selected: { weeklyFlexible: Array<{ title: string }>; completed: Array<{ title: string }> } } } = await afterRestore.json();
    expect(afterBody.data.selected.weeklyFlexible).toEqual(expect.arrayContaining([expect.objectContaining({ title: "旧週次家事" })]));
    expect(afterBody.data.selected.completed).toHaveLength(0);
  });

  it.each([
    ["weekly_flexible", { weeklyDeadlineWeekday: 5 }],
    ["monthly_flexible", { monthlyDeadlineType: "month_end" }]
  ] as const)("keeps multiple %s completions as separate period history", async (modelRecurrenceType, schedule) => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, {
      email: `${modelRecurrenceType}-repeat@example.com`,
      password: "very-long-password",
      displayName: "Repeat Owner"
    });
    await app.fetch(postJson("/api/households", { name: `${modelRecurrenceType} repeat house` }, owner.cookie), env);
    const targetDate = "2026-08-14";
    const created = await app.fetch(
      postJson(
        "/api/tasks",
        {
          title: `${modelRecurrenceType} repeat`,
          modelRecurrenceType,
          startDate: targetDate,
          assignmentType: "anyone",
          notificationSlot: "none",
          ...schedule
        },
        owner.cookie
      ),
      env
    );
    expect(created.status).toBe(201);
    const createdBody: { data: { task: { id: string } } } = await created.json();
    const taskId = createdBody.data.task.id;

    const complete = async () => {
      const response = await app.fetch(postJson(`/api/tasks/${taskId}/complete`, { targetDate }, owner.cookie), env);
      expect(response.status).toBe(200);
      const body: { data: { result: { completedCount: number; status: string } } } = await response.json();
      return body.data.result;
    };

    expect((await complete()).completedCount).toBe(1);
    const second = await complete();
    expect(second).toMatchObject({ completedCount: 2, status: "completed" });

    const history = await app.fetch(
      new Request(`https://example.test/api/tasks/${taskId}/history`, { headers: { cookie: owner.cookie } }),
      env
    );
    expect(history.status).toBe(200);
    const historyBody: { data: { records: Array<{ status: string; periodKey: string | null; targetDate: string | null }> } } = await history.json();
    expect(historyBody.data.records.filter((record) => record.status === "completed")).toHaveLength(2);
    expect(new Set(historyBody.data.records.map((record) => record.periodKey)).size).toBe(1);
    expect(historyBody.data.records.every((record) => record.targetDate === null)).toBe(true);
  });

  it("transitions a flexible period in progress, then appends the next completion", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, {
      email: "flexible-transition@example.com",
      password: "very-long-password",
      displayName: "Transition Owner"
    });
    await app.fetch(postJson("/api/households", { name: "Flexible transition house" }, owner.cookie), env);
    const targetDate = "2026-08-14";
    const created = await app.fetch(
      postJson(
        "/api/tasks",
        {
          title: "weekly transition",
          modelRecurrenceType: "weekly_flexible",
          startDate: targetDate,
          weeklyDeadlineWeekday: 5,
          assignmentType: "anyone",
          notificationSlot: "none"
        },
        owner.cookie
      ),
      env
    );
    const createdBody: { data: { task: { id: string } } } = await created.json();
    const taskId = createdBody.data.task.id;
    const action = async (name: "start" | "complete") => {
      const response = await app.fetch(postJson(`/api/tasks/${taskId}/${name}`, { targetDate }, owner.cookie), env);
      expect(response.status).toBe(200);
      const body: { data: { result: { completedCount: number; status: string } } } = await response.json();
      return body.data.result;
    };
    expect((await action("start")).status).toBe("in_progress");
    expect((await action("complete")).completedCount).toBe(1);
    expect((await action("complete")).completedCount).toBe(2);
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

  it("lists recent shopping settings with newest-name deduplication, limit, purchased reuse, and household isolation", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const owner = await registerUser(env, { email: "recent-shopping-owner@example.com", password: "very-long-password", displayName: "Recent Owner" });
    const other = await registerUser(env, { email: "recent-shopping-other@example.com", password: "very-long-password", displayName: "Recent Other" });
    await app.fetch(postJson("/api/households", { name: "Recent House" }, owner.cookie), env);
    await app.fetch(postJson("/api/households", { name: "Other Recent House" }, other.cookie), env);

    const createItem = async (name: string, quantity?: string) => {
      const response = await app.fetch(postJson("/api/shopping/items", { name, quantity }, owner.cookie), env);
      const body: { data: { item: { id: string } } } = await response.json();
      return body.data.item.id;
    };
    const ids: string[] = [];
    for (let index = 0; index < 10; index += 1) ids.push(await createItem(`recent-${index}`, `${index + 1}`));
    const oldMilkId = await createItem("Milk", "1L");
    const latestMilkId = await createItem(" milk ", "2L");
    const otherItem = await app.fetch(postJson("/api/shopping/items", { name: "other-household" }, other.cookie), env);
    expect(otherItem.status).toBe(201);

    ids.forEach((id, index) => {
      const row = db.shoppingItems.get(id);
      if (row) row.created_at = `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`;
    });
    const oldMilk = db.shoppingItems.get(oldMilkId);
    if (oldMilk) oldMilk.created_at = "2026-08-12T00:00:00.000Z";
    const latestMilk = db.shoppingItems.get(latestMilkId);
    if (latestMilk) latestMilk.created_at = "2026-08-13T00:00:00.000Z";
    await app.fetch(postJson(`/api/shopping/items/${latestMilkId}/purchase`, {}, owner.cookie), env);

    const response = await app.fetch(
      new Request("https://example.test/api/shopping/recent?limit=8", { headers: { cookie: owner.cookie } }),
      env
    );
    expect(response.status).toBe(200);
    const body: { data: { items: Array<Record<string, unknown>> } } = await response.json();
    const names = body.data.items.map((item) => item.name);
    expect(body.data.items).toHaveLength(8);
    expect(names[0]).toBe("milk");
    expect(new Set(names).size).toBe(8);
    expect(names).not.toContain("other-household");
    expect(body.data.items[0]).toMatchObject({ name: "milk", quantity: "2L", note: null });
    expect(body.data.items[0]).not.toHaveProperty("id");
    expect(body.data.items[0]).not.toHaveProperty("status");
    expect(body.data.items[0]).not.toHaveProperty("purchasedAt");
    expect(body.data.items[0]).not.toHaveProperty("plannedPurchaseDate");
    expect(body.data.items[0]).not.toHaveProperty("image");
  });

  it("keeps planned purchase dates through purchase changes and projects only the household calendar range", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, {
      email: "planned-shopping-owner@example.com",
      password: "very-long-password",
      displayName: "Planned Owner"
    });
    const other = await registerUser(env, {
      email: "planned-shopping-other@example.com",
      password: "very-long-password",
      displayName: "Planned Other"
    });
    await app.fetch(postJson("/api/households", { name: "Planned House" }, owner.cookie), env);
    await app.fetch(postJson("/api/households", { name: "Other Planned House" }, other.cookie), env);

    const create = async (name: string, plannedPurchaseDate?: string | null, cookie = owner.cookie) => {
      const response = await app.fetch(
        postJson("/api/shopping/items", { name, plannedPurchaseDate }, cookie),
        env
      );
      expect(response.status).toBe(201);
      const body: { data: { item: { id: string; plannedPurchaseDate: string | null } } } = await response.json();
      return body.data.item;
    };

    const milk = await create("牛乳", "2026-08-20");
    expect(milk.plannedPurchaseDate).toBe("2026-08-20");
    await create("予定日未定", null);
    const purchasedUnscheduled = await create("購入済み予定日未定", null);
    await app.fetch(postJson(`/api/shopping/items/${purchasedUnscheduled.id}/purchase`, {}, owner.cookie), env);
    await create("範囲外", "2026-09-01");
    await create("別家庭", "2026-08-20", other.cookie);

    const invalid = await app.fetch(
      postJson("/api/shopping/items", { name: "不正", plannedPurchaseDate: "2026-02-30" }, owner.cookie),
      env
    );
    expect(invalid.status).toBe(400);

    const calendarAtFirstDate = await app.fetch(
      new Request("https://example.test/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=2026-08-20", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    const firstBody: {
      data: {
        dates: Record<string, { shoppingCount: number; purchasedShoppingCount: number }>;
        selected: { shopping: Array<{ id: string; name: string; status: string; plannedPurchaseDate: string | null }> };
      };
    } = await calendarAtFirstDate.json();
    expect(firstBody.data.dates["2026-08-20"]).toMatchObject({ shoppingCount: 1, purchasedShoppingCount: 0 });
    expect(firstBody.data.selected.shopping.map((item) => item.id)).toEqual([milk.id]);
    expect(firstBody.data.selected.shopping).toEqual([
      expect.objectContaining({ id: milk.id, name: "牛乳", status: "pending", plannedPurchaseDate: "2026-08-20" })
    ]);

    const otherSelectedDate = await app.fetch(
      new Request("https://example.test/api/tasks/calendar?from=2026-08-21&to=2026-08-21&selectedDate=2026-08-21", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(otherSelectedDate.json()).resolves.toMatchObject({
      data: {
        dates: { "2026-08-21": { shoppingCount: 0, purchasedShoppingCount: 0 } },
        selected: { shopping: [] }
      }
    });

    const septemberSelectedDate = await app.fetch(
      new Request("https://example.test/api/tasks/calendar?from=2026-09-01&to=2026-09-01&selectedDate=2026-09-01", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(septemberSelectedDate.json()).resolves.toMatchObject({
      data: {
        dates: { "2026-09-01": { shoppingCount: 1, purchasedShoppingCount: 0 } },
        selected: { shopping: [{ name: "範囲外", plannedPurchaseDate: "2026-09-01" }] }
      }
    });

    const purchased = await app.fetch(
      postJson(`/api/shopping/items/${milk.id}/purchase`, {}, owner.cookie),
      env
    );
    await expect(purchased.json()).resolves.toMatchObject({
      data: { item: { status: "purchased", plannedPurchaseDate: "2026-08-20" } }
    });
    const purchasedCalendar = await app.fetch(
      new Request("https://example.test/api/tasks/calendar?from=2026-08-20&to=2026-08-20&selectedDate=2026-08-20", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(purchasedCalendar.json()).resolves.toMatchObject({
      data: {
        dates: { "2026-08-20": { shoppingCount: 0, purchasedShoppingCount: 0 } },
        selected: { shopping: [] }
      }
    });

    const unpurchased = await app.fetch(
      postJson(`/api/shopping/items/${milk.id}/unpurchase`, {}, owner.cookie),
      env
    );
    await expect(unpurchased.json()).resolves.toMatchObject({
      data: { item: { status: "pending", plannedPurchaseDate: "2026-08-20" } }
    });

    const moved = await app.fetch(
      patchJson(`/api/shopping/items/${milk.id}`, { plannedPurchaseDate: "2026-08-22" }, owner.cookie),
      env
    );
    await expect(moved.json()).resolves.toMatchObject({
      data: { item: { plannedPurchaseDate: "2026-08-22" } }
    });
    const movedCalendar = await app.fetch(
      new Request("https://example.test/api/tasks/calendar?from=2026-08-20&to=2026-08-22&selectedDate=2026-08-22", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(movedCalendar.json()).resolves.toMatchObject({
      data: {
        dates: {
          "2026-08-20": { shoppingCount: 0 },
          "2026-08-22": { shoppingCount: 1 }
        },
        selected: { shopping: [{ id: milk.id, plannedPurchaseDate: "2026-08-22" }] }
      }
    });

    const cleared = await app.fetch(
      patchJson(`/api/shopping/items/${milk.id}`, { plannedPurchaseDate: null }, owner.cookie),
      env
    );
    await expect(cleared.json()).resolves.toMatchObject({
      data: { item: { id: milk.id, plannedPurchaseDate: null } }
    });
    const clearedCalendar = await app.fetch(
      new Request("https://example.test/api/tasks/calendar?from=2026-08-22&to=2026-08-22&selectedDate=2026-08-22", {
        headers: { cookie: owner.cookie }
      }),
      env
    );
    await expect(clearedCalendar.json()).resolves.toMatchObject({
      data: {
        dates: { "2026-08-22": { shoppingCount: 0 } },
        selected: { shopping: [] }
      }
    });
  });
});

describe("task reuse and template API", () => {
  it("lists recent canonical definitions with household isolation, limit, sorting, and legacy exclusion", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const owner = await registerUser(env, { email: "reuse-owner@example.com", password: "very-long-password", displayName: "Reuse Owner" });
    const other = await registerUser(env, { email: "reuse-other@example.com", password: "very-long-password", displayName: "Reuse Other" });
    await app.fetch(postJson("/api/households", { name: "Reuse House" }, owner.cookie), env);
    await app.fetch(postJson("/api/households", { name: "Other House" }, other.cookie), env);
    const create = async (title: string, extra: Record<string, unknown> = {}) => {
      const response = await app.fetch(postJson("/api/tasks", {
        title, modelRecurrenceType: "daily", assignmentType: "anyone", notificationSlot: "none", ...extra
      }, owner.cookie), env);
      expect(response.status).toBe(201);
      const body: { data: { task: { id: string } } } = await response.json();
      return body.data.task.id;
    };
    const first = await create("first");
    const second = await create("second");
    const third = await create("third");
    db.tasks.get(first)!.created_at = "2026-08-01T00:00:00.000Z";
    db.tasks.get(second)!.created_at = "2026-08-03T00:00:00.000Z";
    db.tasks.get(third)!.created_at = "2026-08-02T00:00:00.000Z";
    const legacy = await app.fetch(postJson("/api/tasks", { title: "legacy weekly", recurrenceType: "weekly", weeklyTargetCount: 3, assignmentType: "anyone", notificationSlot: "none" }, owner.cookie), env);
    expect(legacy.status).toBe(201);
    await app.fetch(new Request(`https://example.test/api/tasks/${first}`, { method: "DELETE", headers: { "content-type": "application/json", origin: "https://example.test", cookie: owner.cookie }, body: "{}" }), env);

    const recent = await app.fetch(new Request("https://example.test/api/tasks/recent?limit=2", { headers: { cookie: owner.cookie } }), env);
    await expect(recent.json()).resolves.toMatchObject({ ok: true, data: { tasks: [{ title: "second" }, { title: "third" }] } });
    const isolated = await app.fetch(new Request("https://example.test/api/tasks/recent", { headers: { cookie: other.cookie } }), env);
    await expect(isolated.json()).resolves.toMatchObject({ ok: true, data: { tasks: [] } });
  });

  it("supports canonical template CRUD, six recurrence types, assignment validation, and household isolation", async () => {
    const app = createApp();
    const env = createTestEnv();
    const owner = await registerUser(env, { email: "template-owner@example.com", password: "very-long-password", displayName: "Template Owner" });
    const other = await registerUser(env, { email: "template-other@example.com", password: "very-long-password", displayName: "Template Other" });
    await app.fetch(postJson("/api/households", { name: "Template House" }, owner.cookie), env);
    await app.fetch(postJson("/api/households", { name: "Other Template House" }, other.cookie), env);
    const cases = [
      { modelRecurrenceType: "once" },
      { modelRecurrenceType: "daily" },
      { modelRecurrenceType: "weekly_fixed", weekdays: [2, 5] },
      { modelRecurrenceType: "monthly_fixed", monthlyDayOfMonth: 31 },
      { modelRecurrenceType: "weekly_flexible", weeklyDeadlineWeekday: 5 },
      { modelRecurrenceType: "monthly_flexible", monthlyDeadlineType: "month_end" }
    ];
    for (const [index, schedule] of cases.entries()) {
      const response = await app.fetch(postJson("/api/task-templates", {
        title: `Template ${index}`, description: "reusable", assignmentType: "anyone", ...schedule
      }, owner.cookie), env);
      expect(response.status, JSON.stringify(schedule)).toBe(201);
    }
    const created = await app.fetch(postJson("/api/task-templates", {
      title: "Editable template", modelRecurrenceType: "daily", assignmentType: "anyone", deadlineTime: "21:00", notificationOffsetMinutes: 30
    }, owner.cookie), env);
    expect(created.status).toBe(201);
    const createdBody: { data: { template: { id: string; deadlineTime: string; notificationOffsetMinutes: number } } } = await created.json();
    expect(createdBody.data.template).toMatchObject({ deadlineTime: "21:00", notificationOffsetMinutes: 30 });
    const listed = await app.fetch(new Request("https://example.test/api/task-templates", { headers: { cookie: owner.cookie } }), env);
    const listedBody: { data: { templates: Array<{ title: string }> } } = await listed.json();
    expect(listedBody.data.templates.map((template) => template.title)).toContain("Template 0");
    const updated = await app.fetch(patchJson(`/api/task-templates/${createdBody.data.template.id}`, { title: "Edited template", deadlineTime: null, notificationOffsetMinutes: null }, owner.cookie), env);
    await expect(updated.json()).resolves.toMatchObject({ ok: true, data: { template: { title: "Edited template", deadlineTime: null, notificationOffsetMinutes: null } } });
    const hidden = await app.fetch(new Request(`https://example.test/api/task-templates/${createdBody.data.template.id}`, { headers: { cookie: other.cookie } }), env);
    expect(hidden.status).toBe(404);
    const deleted = await app.fetch(new Request(`https://example.test/api/task-templates/${createdBody.data.template.id}`, { method: "DELETE", headers: { "content-type": "application/json", origin: "https://example.test", cookie: owner.cookie }, body: "{}" }), env);
    expect(deleted.status).toBe(200);
    const afterDelete = await app.fetch(new Request("https://example.test/api/task-templates", { headers: { cookie: owner.cookie } }), env);
    const afterDeleteBody: { data: { templates: Array<{ title: string }> } } = await afterDelete.json();
    expect(afterDeleteBody.data.templates.some((template) => template.title === "Edited template")).toBe(false);
    const invalidAssignee = await app.fetch(postJson("/api/task-templates", { title: "Invalid assignee", modelRecurrenceType: "daily", assignmentType: "specific", assignedUserId: "missing", }, owner.cookie), env);
    expect(invalidAssignee.status).toBe(400);
  });
});

describe("M2 Home contract", () => {
  it("keeps action snapshots and restores an inactive task without deleting other history", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const owner = await registerUser(env, {
      email: "m2-home-owner@example.com",
      password: "very-long-password",
      displayName: "M2 Owner"
    });
    await app.fetch(postJson("/api/households", { name: "M2 Home" }, owner.cookie), env);
    const today = "2026-08-25";
    const created = await app.fetch(
      postJson(
        "/api/tasks",
        {
          title: "ゴミ出し",
          modelRecurrenceType: "daily",
          assignmentType: "anyone",
          startDate: today,
          deadlineTime: "09:00",
          notificationOffsetMinutes: null,
          notificationSlot: "none"
        },
        owner.cookie
      ),
      env
    );
    const createdBody: { data: { task: { id: string } } } = await created.json();
    const taskId = createdBody.data.task.id;
    const complete = await app.fetch(
      postJson(`/api/tasks/${taskId}/complete`, { targetDate: today }, owner.cookie),
      env
    );
    expect(complete.status).toBe(200);
    const record = Array.from(db.taskRecords.values()).find((item) => item.task_id === taskId);
    if (!record) throw new Error("complete did not create a task record");
    expect(record).toMatchObject({ task_title_snapshot: "ゴミ出し", assigned_user_id_snapshot: null });
    const ownerId = Array.from(db.users.values()).find((item) => item.email === "m2-home-owner@example.com")?.id;
    if (!ownerId) throw new Error("owner was not created");
    const passedTaskResponse = await app.fetch(
      postJson(
        "/api/tasks",
        { title: "窓ふき", modelRecurrenceType: "daily", assignmentType: "specific", assignedUserId: ownerId, startDate: today, notificationSlot: "none" },
        owner.cookie
      ),
      env
    );
    const passedTaskBody: { data: { task: { id: string } } } = await passedTaskResponse.json();
    const passedTaskId = passedTaskBody.data.task.id;
    await app.fetch(postJson(`/api/tasks/${passedTaskId}/skip`, { targetDate: today }, owner.cookie), env);
    const passedRecord = Array.from(db.taskRecords.values()).find((item) => item.task_id === passedTaskId);
    if (!passedRecord) throw new Error("skip did not create a task record");
    expect(passedRecord).toMatchObject({ task_title_snapshot: "窓ふき", assigned_user_id_snapshot: ownerId, assigned_user_display_name_snapshot: "M2 Owner" });

    const edited = await app.fetch(
      patchJson(`/api/tasks/${taskId}`, { title: "燃えるゴミ出し" }, owner.cookie),
      env
    );
    expect(edited.status).toBe(200);
    const dashboardAfterEdit = await app.fetch(
      new Request(`https://example.test/api/dashboard/today?date=${today}`, { headers: { cookie: owner.cookie } }),
      env
    );
    await expect(dashboardAfterEdit.json()).resolves.toMatchObject({
      ok: true,
      data: { completedRecords: [{ title: "ゴミ出し", taskActive: true }] }
    });

    const deactivate = await app.fetch(
      new Request(`https://example.test/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: { cookie: owner.cookie, origin: "https://example.test", "content-type": "application/json" },
        body: "{}"
      }),
      env
    );
    expect(deactivate.status).toBe(200);
    const dashboardInactive = await app.fetch(
      new Request(`https://example.test/api/dashboard/today?date=${today}`, { headers: { cookie: owner.cookie } }),
      env
    );
    await expect(dashboardInactive.json()).resolves.toMatchObject({
      ok: true,
      data: { completedRecords: [{ title: "ゴミ出し", taskActive: false }], homeTasks: [] }
    });

    const restored = await app.fetch(
      postJson(`/api/tasks/${taskId}/restore`, { recordId: record.id }, owner.cookie),
      env
    );
    expect(restored.status).toBe(200);
    const dashboardRestored = await app.fetch(
      new Request(`https://example.test/api/dashboard/today?date=${today}`, { headers: { cookie: owner.cookie } }),
      env
    );
    await expect(dashboardRestored.json()).resolves.toMatchObject({
      ok: true,
      data: { completedRecords: [], passedRecords: [{ title: "窓ふき" }], homeTasks: [{ id: taskId, title: "燃えるゴミ出し" }] }
    });
    const inProgressResponse = await app.fetch(
      postJson(
        "/api/tasks",
        { title: "進行中の家事", modelRecurrenceType: "daily", assignmentType: "anyone", startDate: today, notificationSlot: "none" },
        owner.cookie
      ),
      env
    );
    const inProgressBody: { data: { task: { id: string } } } = await inProgressResponse.json();
    const inProgressTaskId = inProgressBody.data.task.id;
    const started = await app.fetch(postJson(`/api/tasks/${inProgressTaskId}/start`, { targetDate: today }, owner.cookie), env);
    expect(started.status).toBe(200);
    const inProgressRecord = Array.from(db.taskRecords.values()).find((item) => item.task_id === inProgressTaskId);
    if (!inProgressRecord) throw new Error("start did not create a task record");
    const invalidRestore = await app.fetch(
      postJson(`/api/tasks/${inProgressTaskId}/restore`, { recordId: inProgressRecord.id }, owner.cookie),
      env
    );
    expect(invalidRestore.status).toBe(400);
    expect(db.taskRecords.get(inProgressRecord.id)?.status).toBe("in_progress");
  });
});
