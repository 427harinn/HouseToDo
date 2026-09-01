import { describe, expect, it } from "vitest";
import type { HomeToday } from "./api/home";
import type { HomeHistoryRecord, TodayTask } from "./api/tasks";
import {
  createTemporaryHistoryRecord,
  getRetainedTaskProjection,
  projectHomeData,
  serverMatchesMutation,
  type HomeMutation
} from "./home-local-first";

const task = (id = "task-1", title = "ゴミ出し"): TodayTask => ({
  id,
  title,
  description: "玄関前",
  recurrenceType: "daily",
  modelRecurrenceType: "daily",
  assignmentType: "anyone",
  assignedUserId: null,
  assignment: { type: "anyone", user: null },
  scheduledTime: null,
  notificationSlot: "none",
  weekdays: [],
  weeklyTargetCount: null,
  active: true,
  sortOrder: 0,
  createdBy: "user-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  status: "pending",
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null,
  targetDate: "2026-09-01",
  deadlineDate: "2026-09-01",
  occurrenceKey: `${id}:2026-09-01`
});

const record = (id = "record-1", taskId = "task-1", status: "completed" | "skipped" = "completed"): HomeHistoryRecord => ({
  id,
  taskId,
  status,
  title: "ゴミ出し",
  taskActive: true,
  actualCompleter: { userId: "user-1", displayName: "さや", avatarUrl: null },
  assignedUser: null,
  completedAt: status === "completed" ? "2026-09-01T01:00:00.000Z" : null,
  skippedAt: status === "skipped" ? "2026-09-01T01:00:00.000Z" : null,
  targetDate: "2026-09-01",
  targetWeekStart: null,
  occurrenceKey: "task-1:2026-09-01",
  periodKey: null,
  createdAt: "2026-09-01T01:00:00.000Z",
  updatedAt: "2026-09-01T01:00:00.000Z"
});

const home = (tasks: TodayTask[] = [task()]): HomeToday => ({
  date: "2026-09-01",
  homeTasks: tasks,
  completedRecords: [],
  passedRecords: [],
  shopping: { pendingCount: 1 },
  members: []
});

const mutation = (overrides: Partial<HomeMutation> = {}): HomeMutation => ({
  id: "mutation-1",
  type: "complete",
  phase: "transitioned",
  userId: "user-1",
  householdId: "household-1",
  date: "2026-09-01",
  taskId: "task-1",
  originalTask: task(),
  transientRecord: record("local-record"),
  startedAt: Date.parse("2026-09-01T01:00:00.000Z"),
  postSucceeded: false,
  ...overrides
});

describe("Home local-first projection", () => {
  it("projects complete and pass overlays without changing the server baseline", () => {
    const baseline = home([task("task-1"), task("task-2", "床そうじ")]);
    const complete = mutation();
    const pass = mutation({ id: "mutation-2", type: "pass", taskId: "task-2", originalTask: task("task-2", "床そうじ"), transientRecord: record("local-pass", "task-2", "skipped") });

    const displayed = projectHomeData(baseline, [complete, pass]);

    expect(displayed.homeTasks).toHaveLength(0);
    expect(displayed.completedRecords[0]).toMatchObject({ id: "local-record", status: "completed" });
    expect(displayed.passedRecords[0]).toMatchObject({ id: "local-pass", status: "skipped" });
    expect(baseline.homeTasks).toHaveLength(2);
    expect(baseline.completedRecords).toHaveLength(0);
  });

  it("keeps animating rows in place until the motion boundary", () => {
    const displayed = projectHomeData(home(), [mutation({ phase: "animating" })]);
    expect(displayed.homeTasks).toHaveLength(1);
    expect(displayed.completedRecords).toHaveLength(0);
  });

  it("restores a retained full task projection but never fabricates an old-history task", () => {
    const retained = mutation();
    const currentRestore = mutation({ id: "restore-1", type: "restore", originalRecord: record(), originalTask: task() });
    const oldRestore = mutation({ id: "restore-2", type: "restore", originalRecord: record("old-record"), originalTask: undefined });

    expect(projectHomeData(home(), [retained, currentRestore]).homeTasks[0]).toMatchObject({ id: "task-1", title: "ゴミ出し" });
    expect(projectHomeData({ ...home([]), completedRecords: [record("old-record")] }, [oldRestore]).homeTasks).toHaveLength(0);
    expect(getRetainedTaskProjection([retained], "task-1")).toMatchObject({ id: "task-1" });
  });

  it("removes only the selected overlay and preserves another task mutation", () => {
    const other = mutation({ id: "mutation-2", taskId: "task-2", originalTask: task("task-2", "床そうじ"), transientRecord: record("local-2", "task-2", "skipped"), type: "pass" });
    const displayed = projectHomeData(home([task("task-1"), task("task-2", "床そうじ")]), [mutation(), other]);
    const afterFirstReconcile = projectHomeData(home([task("task-1")]), [other]);
    expect(displayed.completedRecords).toHaveLength(1);
    expect(displayed.passedRecords).toHaveLength(1);
    expect(afterFirstReconcile.passedRecords[0].taskId).toBe("task-2");
  });

  it("recognizes authoritative results and rejects identity/date mismatches", () => {
    const complete = mutation({ postSucceeded: true });
    const confirmed = { ...home([]), completedRecords: [record("server-record")] };
    expect(serverMatchesMutation(confirmed, complete)).toBe(true);
    expect(serverMatchesMutation({ ...confirmed, date: "2026-09-02" }, complete)).toBe(false);
    expect(serverMatchesMutation(home([]), mutation({ type: "restore", originalRecord: record(), originalTask: task(), postSucceeded: true }))).toBe(false);
  });

  it("creates a display-only record with actor, scope, and local timestamp", () => {
    const created = createTemporaryHistoryRecord(task(), "complete", { userId: "user-1", householdId: "household-1", date: "2026-09-01" }, { id: "user-1", displayName: "さや", avatarUrl: null }, Date.parse("2026-09-01T02:00:00.000Z"));
    expect(created.id).toMatch(/^local-complete-/);
    expect(created).toMatchObject({ taskId: "task-1", status: "completed", actualCompleter: { userId: "user-1" }, occurrenceKey: "task-1:2026-09-01" });
    expect(created.completedAt).toBe("2026-09-01T02:00:00.000Z");
  });
});
