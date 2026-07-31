import { describe, expect, it } from "vitest";
import {
  getLocalDate,
  getWeekEndDate,
  getWeekStartDate,
  getWeekday,
  isTaskScheduledForDate,
  isValidDateKey
} from "./date-time";

describe("date-time helpers", () => {
  it("calculates Asia/Tokyo local dates without relying on runtime timezone", () => {
    expect(getLocalDate("2026-07-30T15:00:00.000Z", "Asia/Tokyo")).toBe("2026-07-31");
    expect(getLocalDate("2026-07-31T14:59:59.000Z", "Asia/Tokyo")).toBe("2026-07-31");
    expect(getLocalDate("2026-07-31T15:00:00.000Z", "Asia/Tokyo")).toBe("2026-08-01");
  });

  it("calculates week ranges for Monday and Sunday starts", () => {
    expect(getWeekStartDate("2026-07-31", 1)).toBe("2026-07-27");
    expect(getWeekEndDate("2026-07-31", 1)).toBe("2026-08-02");
    expect(getWeekStartDate("2026-07-31", 0)).toBe("2026-07-26");
    expect(getWeekEndDate("2026-07-31", 0)).toBe("2026-08-01");
  });

  it("handles year boundaries and leap days", () => {
    expect(getWeekStartDate("2027-01-01", 1)).toBe("2026-12-28");
    expect(getWeekEndDate("2027-01-01", 1)).toBe("2027-01-03");
    expect(getWeekday("2028-02-29")).toBe(2);
  });

  it("validates date keys and scheduled weekdays", () => {
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isTaskScheduledForDate([1, 4], "2026-07-30")).toBe(true);
    expect(isTaskScheduledForDate([1, 4], "2026-07-31")).toBe(false);
  });
});
