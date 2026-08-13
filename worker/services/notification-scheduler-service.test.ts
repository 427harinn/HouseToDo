import { describe, expect, it } from "vitest";
import { getLocalDate, getLocalTime } from "../lib/date-time";
import { isIncomplete, isTaskDueToday } from "./notification-scheduler-service";
import type { Task } from "../types/domain";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1", householdId: "house-1", title: "掃除", description: null,
  recurrenceType: "daily", assignmentType: "anyone", assignedUserId: null,
  scheduledTime: null, notificationSlot: "none", notificationTime: "21:00",
  weeklyTargetCount: null, active: true, sortOrder: 1, createdBy: "user-1",
  createdAt: "2026-01-01", updatedAt: "2026-01-01", weekdays: [], ...overrides
});

describe("notification scheduler rules", () => {
  it("selects daily and matching scheduled tasks, excluding weekly", () => {
    expect(isTaskDueToday(task(), "2026-08-13")).toBe(true);
    expect(isTaskDueToday(task({ recurrenceType: "scheduled", weekdays: [4] }), "2026-08-13")).toBe(true);
    expect(isTaskDueToday(task({ recurrenceType: "scheduled", weekdays: [5] }), "2026-08-13")).toBe(false);
    expect(isTaskDueToday(task({ recurrenceType: "weekly" }), "2026-08-13")).toBe(false);
  });

  it("only treats open task records as incomplete", () => {
    expect(isIncomplete(undefined)).toBe(true);
    expect(isIncomplete("in_progress")).toBe(true);
    expect(isIncomplete("completed")).toBe(false);
    expect(isIncomplete("skipped")).toBe(false);
  });

  it("uses the configured IANA timezone for date and time", () => {
    const instant = new Date("2026-08-13T12:00:00.000Z");
    expect(getLocalDate(instant, "Asia/Tokyo")).toBe("2026-08-13");
    expect(getLocalTime(instant, "Asia/Tokyo")).toBe("21:00");
    expect(getLocalDate(instant, "America/Los_Angeles")).toBe("2026-08-13");
    expect(getLocalTime(instant, "America/Los_Angeles")).toBe("05:00");
  });
});
