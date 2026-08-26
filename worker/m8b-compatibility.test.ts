import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";

const createTestEnv = (db = new MemoryD1()): Env =>
  ({
    DB: db as unknown as D1Database,
    ATTACHMENTS: new MemoryR2(),
    ASSETS: { fetch: () => Promise.resolve(new Response("asset")) },
    APP_ENV: "test",
    ALLOWED_ORIGINS: "https://example.test,http://localhost:5174"
  }) as unknown as Env;

const jsonRequest = (
  path: string,
  method: "POST" | "PATCH" | "DELETE" = "POST",
  body: unknown = {},
  cookie?: string
) =>
  new Request(`https://example.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      ...(cookie ? { cookie } : {})
    },
    body: method === "DELETE" ? JSON.stringify(body) : JSON.stringify(body)
  });

const getRequest = (path: string, cookie?: string) =>
  new Request(`https://example.test${path}`, {
    headers: { ...(cookie ? { cookie } : {}) }
  });

const cookieFrom = (response: Response): string =>
  response.headers.get("set-cookie") ?? "";

const dataFrom = async <T>(response: Response): Promise<T> => {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new Error("API response did not contain data");
  }
  return body.data as T;
};

const registerWithHousehold = async (
  app: ReturnType<typeof createApp>,
  env: Env,
  suffix: string
) => {
  const registered = await app.fetch(
    jsonRequest("/api/auth/register", "POST", {
      email: `m8b-${suffix}@example.test`,
      password: "very-long-password",
      displayName: `M8B ${suffix}`
    }),
    env
  );
  const cookie = cookieFrom(registered);
  expect(registered.status).toBe(201);
  const household = await app.fetch(
    jsonRequest("/api/households", "POST", { name: `M8B ${suffix} household` }, cookie),
    env
  );
  expect(household.status).toBe(201);
  return { cookie };
};

describe("M8B compatibility contracts", () => {
  it("keeps persisted Task and Shopping Template routes usable", async () => {
    const app = createApp();
    const env = createTestEnv();
    const { cookie } = await registerWithHousehold(app, env, "templates");

    const taskTemplate = await app.fetch(
      jsonRequest(
        "/api/task-templates",
        "POST",
        {
          title: "Legacy task template",
          description: "retained for persisted compatibility",
          modelRecurrenceType: "daily",
          assignmentType: "anyone",
          assignedUserId: null,
          weekdays: [],
          deadlineTime: null,
          notificationOffsetMinutes: null,
          weeklyDeadlineWeekday: null,
          monthlyDayOfMonth: null,
          monthlyDeadlineType: null
        },
        cookie
      ),
      env
    );
    expect(taskTemplate.status).toBe(201);
    const taskTemplateData = await dataFrom<{ template: { id: string } }>(taskTemplate);
    expect(
      (await app.fetch(getRequest("/api/task-templates", cookie), env)).status
    ).toBe(200);
    expect(
      (
        await app.fetch(
          getRequest(`/api/task-templates/${taskTemplateData.template.id}`, cookie),
          env
        )
      ).status
    ).toBe(200);
    expect(
      (
        await app.fetch(
          jsonRequest(
            `/api/task-templates/${taskTemplateData.template.id}`,
            "PATCH",
            { description: "updated" },
            cookie
          ),
          env
        )
      ).status
    ).toBe(200);
    expect(
      (
        await app.fetch(
          jsonRequest(
            `/api/task-templates/${taskTemplateData.template.id}`,
            "DELETE",
            {},
            cookie
          ),
          env
        )
      ).status
    ).toBe(200);

    const shoppingTemplate = await app.fetch(
      jsonRequest(
        "/api/shopping/templates",
        "POST",
        { name: "Existing shopping template", quantity: "1", note: "retained" },
        cookie
      ),
      env
    );
    expect(shoppingTemplate.status).toBe(201);
    const shoppingTemplateData = await dataFrom<{ template: { id: string } }>(
      shoppingTemplate
    );
    const list = await app.fetch(getRequest("/api/shopping/templates", cookie), env);
    expect(list.status).toBe(200);
    expect(await dataFrom<{ templates: Array<{ id: string }> }>(list)).toMatchObject({
      templates: [{ id: shoppingTemplateData.template.id }]
    });
    expect(
      (
        await app.fetch(
          getRequest(
            `/api/shopping/templates/${shoppingTemplateData.template.id}`,
            cookie
          ),
          env
        )
      ).status
    ).toBe(200);
    expect(
      (
        await app.fetch(
          jsonRequest(
            `/api/shopping/templates/${shoppingTemplateData.template.id}`,
            "PATCH",
            { note: "updated" },
            cookie
          ),
          env
        )
      ).status
    ).toBe(200);
    const added = await app.fetch(
      jsonRequest(
        `/api/shopping/templates/${shoppingTemplateData.template.id}/add`,
        "POST",
        {},
        cookie
      ),
      env
    );
    expect(added.status).toBe(201);
    expect(await dataFrom<{ item: { name: string } }>(added)).toMatchObject({
      item: { name: "Existing shopping template" }
    });
    expect(
      (
        await app.fetch(
          jsonRequest(
            `/api/shopping/templates/${shoppingTemplateData.template.id}`,
            "DELETE",
            {},
            cookie
          ),
          env
        )
      ).status
    ).toBe(200);
  });

  it("keeps Dashboard and Calendar compatibility fields while reading legacy records", async () => {
    const app = createApp();
    const db = new MemoryD1();
    const env = createTestEnv(db);
    const { cookie } = await registerWithHousehold(app, env, "legacy");
    const date = "2026-08-26";

    const taskResponse = await app.fetch(
      jsonRequest(
        "/api/tasks",
        "POST",
        {
          title: "Legacy-derived task",
          modelRecurrenceType: "once",
          startDate: date,
          targetDate: date,
          assignmentType: "anyone",
          notificationSlot: "none"
        },
        cookie
      ),
      env
    );
    expect(taskResponse.status).toBe(201);
    const task = await dataFrom<{ task: { id: string } }>(taskResponse);
    const completed = await app.fetch(
      jsonRequest(
        `/api/tasks/${task.task.id}/complete`,
        "POST",
        { targetDate: date },
        cookie
      ),
      env
    );
    expect(completed.status).toBe(200);
    const record = Array.from(db.taskRecords.values()).find(
      (value) => value.task_id === task.task.id
    );
    expect(record).toBeDefined();
    if (!record) throw new Error("completed legacy fixture record was not created");
    record.task_title_snapshot = null;
    record.assigned_user_id_snapshot = null;
    record.assigned_user_display_name_snapshot = null;
    record.assigned_user_color_snapshot = null;
    record.assigned_user_avatar_url_snapshot = null;
    record.calendar_action_date = null;

    const dashboard = await app.fetch(
      getRequest(`/api/dashboard/today?date=${date}`, cookie),
      env
    );
    expect(dashboard.status).toBe(200);
    const dashboardData = await dataFrom<{
      todayTasks: unknown[];
      weeklyTasks: unknown[];
      summary: { total: number };
      completedRecords: Array<{ title: string; actualCompleter: { userId: string } }>;
    }>(dashboard);
    expect(dashboardData.todayTasks).toBeInstanceOf(Array);
    expect(dashboardData.weeklyTasks).toBeInstanceOf(Array);
    expect(typeof dashboardData.summary.total).toBe("number");
    expect(dashboardData.completedRecords[0]?.title).toBe("Legacy-derived task");
    expect(typeof dashboardData.completedRecords[0]?.actualCompleter.userId).toBe(
      "string"
    );

    const calendar = await app.fetch(
      getRequest(
        `/api/tasks/calendar?from=2026-08-01&to=2026-08-31&selectedDate=${date}`,
        cookie
      ),
      env
    );
    expect(calendar.status).toBe(200);
    const calendarData = await dataFrom<{
      dates: Record<
        string,
        {
          fixedCompletedCount: number;
          fixedSkippedCount: number;
          shoppingCount: number;
          purchasedShoppingCount: number;
        }
      >;
      selected: { completed: Array<{ calendarActionDate: string | null }> };
    }>(calendar);
    expect(typeof calendarData.dates[date]?.fixedCompletedCount).toBe("number");
    expect(typeof calendarData.dates[date]?.fixedSkippedCount).toBe("number");
    expect(typeof calendarData.dates[date]?.shoppingCount).toBe("number");
    expect(typeof calendarData.dates[date]?.purchasedShoppingCount).toBe("number");
    expect(calendarData.selected.completed[0]).toMatchObject({
      calendarActionDate: null
    });

    const legacyTaskResponse = await app.fetch(
      jsonRequest(
        "/api/tasks",
        "POST",
        {
          title: "Legacy weekly count task",
          recurrenceType: "weekly",
          weeklyTargetCount: 2,
          assignmentType: "anyone",
          notificationSlot: "none"
        },
        cookie
      ),
      env
    );
    expect(legacyTaskResponse.status).toBe(201);
    const allTasks = await app.fetch(
      getRequest("/api/tasks?includeInactive=true", cookie),
      env
    );
    const legacyTasks = await dataFrom<{
      tasks: Array<{
        title: string;
        recurrenceType: string;
        modelRecurrenceType: string | null;
        weeklyTargetCount: number | null;
      }>;
    }>(allTasks);
    expect(legacyTasks.tasks).toContainEqual(
      expect.objectContaining({
        title: "Legacy weekly count task",
        recurrenceType: "weekly",
        modelRecurrenceType: null,
        weeklyTargetCount: 2
      })
    );

    const restored = await app.fetch(
      jsonRequest(
        `/api/tasks/${task.task.id}/restore`,
        "POST",
        { recordId: record.id },
        cookie
      ),
      env
    );
    expect(restored.status).toBe(200);
    expect(db.taskRecords.has(record.id)).toBe(false);
  });
});
