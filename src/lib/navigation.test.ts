import { beforeEach, describe, expect, it } from "vitest";
import { formRouteWithReturnTo, isValidDateKey, resolveReturnTo } from "./navigation";

describe("returnTo navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/calendar?date=2026-09-04#selected");
  });

  it("encodes the current app location when opening a form", () => {
    expect(formRouteWithReturnTo("/tasks/new")).toBe(
      "/tasks/new?returnTo=%2Fcalendar%3Fdate%3D2026-09-04%23selected"
    );
  });

  it("adds explicit form parameters without mixing them with returnTo", () => {
    expect(formRouteWithReturnTo("/tasks/new", { date: "2026-09-04", origin: "calendar" })).toBe(
      "/tasks/new?returnTo=%2Fcalendar%3Fdate%3D2026-09-04%23selected&date=2026-09-04&origin=calendar"
    );
  });

  it.each(["2026-09-04", "2000-02-29"])("accepts valid date key %s", (value) => {
    expect(isValidDateKey(value)).toBe(true);
  });

  it.each(["2026-02-29", "2026-09-31", "2026-9-04", "not-a-date", null])(
    "rejects invalid date key %s",
    (value) => {
      expect(isValidDateKey(value)).toBe(false);
    }
  );

  it.each([
    ["/home", "/home"],
    ["/calendar?date=2026-09-04", "/calendar?date=2026-09-04"],
    ["/shopping?item=milk", "/shopping?item=milk"],
    ["/other", "/other"],
    [`${window.location.origin}/calendar?date=2026-09-04`, "/calendar?date=2026-09-04"]
  ])("accepts the internal route %s", (value, expected) => {
    expect(resolveReturnTo(`?returnTo=${encodeURIComponent(value)}`, "/home")).toBe(expected);
  });

  it.each([
    "https://example.com/steal",
    "//example.com/steal",
    "/tasks/new",
    "/does-not-exist"
  ])("falls back for unsafe or unknown route %s", (value) => {
    expect(resolveReturnTo(`?returnTo=${encodeURIComponent(value)}`, "/home")).toBe("/home");
  });

  it("falls back when returnTo is missing", () => {
    expect(resolveReturnTo("", "/shopping")).toBe("/shopping");
  });
});
