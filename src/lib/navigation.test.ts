import { beforeEach, describe, expect, it } from "vitest";
import { formRouteWithReturnTo, resolveReturnTo } from "./navigation";

describe("returnTo navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/calendar?date=2026-09-04#selected");
  });

  it("encodes the current app location when opening a form", () => {
    expect(formRouteWithReturnTo("/tasks/new")).toBe(
      "/tasks/new?returnTo=%2Fcalendar%3Fdate%3D2026-09-04%23selected"
    );
  });

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
