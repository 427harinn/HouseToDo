import { describe, expect, it } from "vitest";
import {
  getMonthlyFlexiblePeriod,
  getStableTaskScopeKey,
  getWeeklyFlexiblePeriod,
  isTaskModelOccurrenceOnDate,
  resolveMonthlyDate
} from "./task-model";

describe("task model domain helpers", () => {
  it("clamps monthly fixed dates to the last day of the month", () => {
    expect(resolveMonthlyDate(2026, 1, 31)).toBe("2026-01-31");
    expect(resolveMonthlyDate(2026, 2, 31)).toBe("2026-02-28");
    expect(resolveMonthlyDate(2028, 2, 31)).toBe("2028-02-29");
    expect(resolveMonthlyDate(2026, 4, 31)).toBe("2026-04-30");
  });

  it("resolves weekly flexible periods from the selected deadline weekday", () => {
    expect(getWeeklyFlexiblePeriod("2026-08-19", 0, "2026-01-01")).toEqual({
      startDate: "2026-08-17",
      endDate: "2026-08-23",
      deadlineDate: "2026-08-23"
    });
    expect(getWeeklyFlexiblePeriod("2026-08-19", 5, "2026-01-01")).toEqual({
      startDate: "2026-08-15",
      endDate: "2026-08-21",
      deadlineDate: "2026-08-21"
    });
  });

  it("shortens the first weekly flexible period at start_date", () => {
    expect(getWeeklyFlexiblePeriod("2026-08-19", 0, "2026-08-20")).toEqual({
      startDate: "2026-08-20",
      endDate: "2026-08-23",
      deadlineDate: "2026-08-23"
    });
  });

  it("supports month-end and day-of-month flexible periods", () => {
    expect(getMonthlyFlexiblePeriod("2026-02-10", "month_end", null, "2026-01-01")).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      deadlineDate: "2026-02-28"
    });
    expect(getMonthlyFlexiblePeriod("2026-04-10", "day_of_month", 31, "2026-01-01")).toEqual({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      deadlineDate: "2026-04-30"
    });
  });

  it("excludes dates before start_date and creates stable scope keys", () => {
    expect(isTaskModelOccurrenceOnDate({
      recurrenceType: "daily",
      dateKey: "2026-08-19",
      startDate: "2026-08-20"
    })).toBe(false);
    expect(getStableTaskScopeKey({
      taskId: "task-1",
      recurrenceType: "weekly_flexible",
      periodStart: "2026-08-17",
      periodEnd: "2026-08-23"
    })).toBe("period:task-1:week:2026-08-17:2026-08-23");
  });
});
