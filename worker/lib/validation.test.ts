import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import {
  parseJsonBody,
  validateCreateHouseholdInput,
  validateJoinHouseholdInput,
  validateLoginInput,
  validateRegisterInput,
  validateTaskWriteInput,
  validateUpdateHouseholdInput
} from "./validation";

describe("validation helpers", () => {
  it("normalizes valid register input", () => {
    expect(
      validateRegisterInput({
        email: " User@Example.COM ",
        password: "long-password",
        displayName: "  Rinn  ",
        unused: true
      })
    ).toEqual({
      email: "user@example.com",
      password: "long-password",
      displayName: "Rinn"
    });
  });

  it("rejects missing required fields", () => {
    expect(() => validateLoginInput({ email: "user@example.com" })).toThrow(AppError);
  });

  it("rejects invalid email and short password", () => {
    expect(() =>
      validateRegisterInput({ email: "invalid", password: "short", displayName: "Rinn" })
    ).toThrow(AppError);
  });

  it("rejects too long input", () => {
    expect(() =>
      validateLoginInput({ email: `${"a".repeat(250)}@example.com`, password: "password" })
    ).toThrow(AppError);
  });

  it("rejects non-json body", async () => {
    const request = new Request("https://example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello"
    });

    await expect(parseJsonBody(request)).rejects.toThrow(AppError);
  });

  it("validates household create input", () => {
    expect(validateCreateHouseholdInput({ name: " わが家 " })).toEqual({ name: "わが家" });
    expect(() => validateCreateHouseholdInput({ name: " ".repeat(2) })).toThrow(AppError);
    expect(() => validateCreateHouseholdInput({ name: "あ".repeat(51) })).toThrow(AppError);
  });

  it("validates household update input", () => {
    expect(validateUpdateHouseholdInput({ name: " 新しい家 ", weekStartsOn: 6 })).toEqual({
      name: "新しい家",
      weekStartsOn: 6
    });
    expect(() => validateUpdateHouseholdInput({})).toThrow(AppError);
    expect(() => validateUpdateHouseholdInput({ weekStartsOn: 7 })).toThrow(AppError);
  });

  it("validates household join input", () => {
    expect(validateJoinHouseholdInput({ code: " invite " })).toEqual({ code: "invite" });
    expect(() => validateJoinHouseholdInput({ code: "" })).toThrow(AppError);
    expect(() => validateJoinHouseholdInput({ code: "a".repeat(129) })).toThrow(AppError);
  });

  it("normalizes and validates task notification times", () => {
    expect(validateTaskWriteInput({ title: "Task", recurrenceType: "daily", notificationTime: " 07:30 " })).toMatchObject({
      notificationTime: "07:30"
    });
    expect(validateTaskWriteInput({ title: "Task", recurrenceType: "daily", notificationTime: "" })).toMatchObject({
      notificationTime: null
    });
    for (const value of ["24:00", "7:30", "invalid"]) {
      expect(() => validateTaskWriteInput({ title: "Task", recurrenceType: "daily", notificationTime: value })).toThrow(AppError);
    }
  });

  it("validates the Phase 1 recurrence configuration without changing legacy inputs", () => {
    expect(validateTaskWriteInput({
      title: "Monthly cleanup",
      recurrenceType: "monthly_flexible",
      deadlineTime: "21:00",
      notificationOffsetMinutes: 30
    })).toMatchObject({
      monthlyDeadlineType: "month_end",
      monthlyDayOfMonth: null,
      notificationOffsetMinutes: 30
    });
    expect(validateTaskWriteInput({
      title: "One-off task",
      recurrenceType: "once",
      targetDate: "2026-08-20",
      startDate: "2026-08-14",
      deadlineTime: "18:00",
      notificationOffsetMinutes: 0
    })).toMatchObject({ targetDate: "2026-08-20", startDate: "2026-08-14" });
    expect(() => validateTaskWriteInput({
      title: "Invalid reminder",
      recurrenceType: "daily",
      notificationOffsetMinutes: 15
    })).toThrow(AppError);
    expect(() => validateTaskWriteInput({
      title: "Invalid reminder",
      recurrenceType: "daily",
      notificationOffsetMinutes: 5
    })).toThrow(AppError);
    expect(() => validateTaskWriteInput({
      title: "Legacy weekly",
      recurrenceType: "weekly",
      weeklyTargetCount: 2
    })).not.toThrow();
  });
});
