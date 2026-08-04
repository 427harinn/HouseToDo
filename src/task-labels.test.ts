import { describe, expect, it } from "vitest";
import { formatSchedule } from "./task-labels";

describe("task schedule display", () => {
  it("keeps a scheduled time and labels null as unspecified", () => {
    expect(formatSchedule("18:30")).toBe("18:30");
    expect(formatSchedule(null)).toBe("時間指定なし");
  });
});
