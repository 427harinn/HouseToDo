import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryD1 } from "./test-utils/memory-d1";
import type { Env } from "./types/env";
import { MemoryR2 } from "./test-utils/memory-r2";
import { TaskRepository } from "./repositories/task-repository";

const envFor = (db = new MemoryD1()): Env => ({
  DB: db as unknown as D1Database,
  ATTACHMENTS: new MemoryR2(),
  ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
  APP_ENV: "test",
  ALLOWED_ORIGINS: "https://example.test,http://localhost:5174"
}) as unknown as Env;

const postJson = (path: string, body: unknown, cookie?: string) => new Request(`https://example.test${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://example.test", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body)
});

const cookieFrom = (response: Response) => response.headers.get("set-cookie") ?? "";

const register = async (app: ReturnType<typeof createApp>, env: Env, email: string) => {
  const response = await app.fetch(postJson("/api/auth/register", {
    email,
    password: "very-long-password",
    displayName: email.split("@")[0]
  }), env);
  return cookieFrom(response);
};

describe("Calendar performance data paths", () => {
  it("separates marker and selected-day responses while preserving household scope", async () => {
    const app = createApp();
    const env = envFor();
    const owner = await register(app, env, "calendar-path-owner@example.com");
    const other = await register(app, env, "calendar-path-other@example.com");
    await app.fetch(postJson("/api/households", { name: "Calendar path owner" }, owner), env);
    await app.fetch(postJson("/api/households", { name: "Calendar path other" }, other), env);
    const created = await app.fetch(postJson("/api/tasks", {
      title: "owner-only calendar task",
      modelRecurrenceType: "weekly_fixed",
      weekdays: [4],
      assignmentType: "anyone",
      notificationSlot: "none",
      startDate: "2026-08-01"
    }, owner), env);
    expect(created.status).toBe(201);
    const shopping = await app.fetch(postJson("/api/shopping/items", {
      name: "calendar milk",
      quantity: "1本",
      plannedPurchaseDate: "2026-08-20"
    }, owner), env);
    expect(shopping.status).toBe(201);

    const range = await app.fetch(new Request("https://example.test/api/tasks/calendar/range?from=2026-08-01&to=2026-08-31", { headers: { cookie: owner } }), env);
    expect(range.status).toBe(200);
    const rangeBody = await range.json();
    expect(rangeBody).toMatchObject({ data: { dates: { "2026-08-20": { fixedCount: 1, shoppingCount: 1 } } } });
    expect(JSON.stringify(rangeBody)).not.toContain('"selected"');

    const day = await app.fetch(new Request("https://example.test/api/tasks/calendar/day?date=2026-08-20", { headers: { cookie: owner } }), env);
    expect(day.status).toBe(200);
    const dayBody = await day.json();
    expect(dayBody).toMatchObject({ data: { selected: { fixed: [{ title: "owner-only calendar task" }], shopping: [{ name: "calendar milk", plannedPurchaseDate: "2026-08-20" }] } } });
    expect(JSON.stringify(dayBody)).not.toContain('"dates"');

    const otherDay = await app.fetch(new Request("https://example.test/api/tasks/calendar/day?date=2026-08-20", { headers: { cookie: other } }), env);
    expect(otherDay.status).toBe(200);
    const otherBody = await otherDay.json();
    expect(otherBody).not.toMatchObject({ data: { selected: { fixed: [{ title: "owner-only calendar task" }] } } });
  });

  it("loads every task weekday through one batch repository query", async () => {
    const db = new MemoryD1();
    const now = "2026-08-01T00:00:00.000Z";
    for (const [index, weekdays] of [[0, [1, 3]], [1, [2]], [2, [0, 6]]] as const) {
      const id = `task-${index}`;
      db.tasks.set(id, {
        id,
        household_id: "house-1",
        title: id,
        description: null,
        recurrence_type: "scheduled",
        model_recurrence_type: "weekly_fixed",
        assignment_type: "anyone",
        assigned_user_id: null,
        scheduled_time: null,
        notification_slot: "none",
        notification_time: null,
        weekly_target_count: null,
        start_date: "2026-08-01",
        target_date: null,
        deadline_time: null,
        notification_offset_minutes: null,
        weekly_deadline_weekday: null,
        monthly_day_of_month: null,
        monthly_deadline_type: null,
        active: 1,
        sort_order: index,
        created_by: "user-1",
        created_at: now,
        updated_at: now
      });
      weekdays.forEach((weekday) => db.taskWeekdays.set(`${id}:${weekday}`, { task_id: id, weekday }));
    }
    let weekdayQueries = 0;
    const tracedDb = {
      prepare: (sql: string) => {
        if (sql.includes("FROM task_weekdays")) weekdayQueries += 1;
        return db.prepare(sql);
      },
      batch: db.batch.bind(db)
    } as unknown as D1Database;
    const tasks = await new TaskRepository(tracedDb).listByHouseholdId("house-1", { includeInactive: true });
    expect(weekdayQueries).toBe(1);
    expect(tasks.map((task) => task.weekdays)).toEqual([[1, 3], [2], [0, 6]]);
  });
});
