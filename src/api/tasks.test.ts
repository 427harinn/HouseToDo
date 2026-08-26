import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeTaskState,
  createTask,
  listTaskHistory,
  updateTask
} from "./tasks";
import { getDashboardToday } from "./dashboard";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data, requestId: "req" }), {
    headers: { "content-type": "application/json" }
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("task api clients", () => {
  it("fetches dashboard data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(ok({ tasks: [] })));
    fetchMock.mockResolvedValueOnce(ok({ date: "2026-07-31", todayTasks: [], weeklyTasks: [] }));
    await getDashboardToday("2026-07-31");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/dashboard/today?date=2026-07-31"
    ]);
  });

  it("sends create, update, state, and history requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(ok({ task: { id: "task-1" } })));
    const input = {
      title: "洗濯物をたたむ",
      description: null,
      recurrenceType: "daily" as const,
      assignmentType: "anyone" as const,
      assignedUserId: null,
      scheduledTime: "08:00",
      notificationSlot: "none" as const,
      weekdays: [],
      weeklyTargetCount: null
    };

    await createTask(input);
    await updateTask("task-1", input);
    fetchMock.mockResolvedValueOnce(ok({ result: { id: "task-1" } }));
    await changeTaskState("task-1", "complete", { targetDate: "2026-07-31" });
    fetchMock.mockResolvedValueOnce(ok({ records: [] }));
    await listTaskHistory("task-1", 10);

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit)?.method ?? "GET"])).toEqual([
      ["/api/tasks", "POST"],
      ["/api/tasks/task-1", "PATCH"],
      ["/api/tasks/task-1/complete", "POST"],
      ["/api/tasks/task-1/history?limit=10", "GET"]
    ]);
  });
});
