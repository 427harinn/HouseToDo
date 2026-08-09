import { describe, expect, it } from "vitest";
import { resolveNotificationUrl } from "./notification-url";

describe("resolveNotificationUrl", () => {
  it.each([
    ["/tasks/123", "/tasks/123"],
    ["/shopping", "/shopping"],
    ["https://housetodo.invalid/tasks/123?from=push#top", "/tasks/123?from=push#top"],
    ["https://evil.example.com/", "/"],
    ["javascript:alert(1)", "/"],
    ["data:text/html,unsafe", "/"],
    ["//evil.example.com/", "/"],
    ["%invalid", "/"],
    ["", "/"],
    [undefined, "/"]
  ])("resolves %s safely", (value, expected) => {
    expect(resolveNotificationUrl(value)).toBe(expected);
  });
});
