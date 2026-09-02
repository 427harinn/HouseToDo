import { describe, expect, it } from "vitest";
import { homeTaskNotificationUrl, parseHomeTaskQuery, resolveNotificationUrl } from "./notification-url";

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

describe("home task notification links", () => {
  it("encodes task IDs for Home", () => {
    expect(homeTaskNotificationUrl("task/with spaces")).toBe("/home?task=task%2Fwith%20spaces");
  });

  it.each([
    ["?task=123", { requested: true, taskId: "123" }],
    ["?task=task%2F123", { requested: true, taskId: "task/123" }],
    ["", { requested: false, taskId: null }],
    ["?task=", { requested: true, taskId: null }],
    [`?task=${"x".repeat(129)}`, { requested: true, taskId: null }]
  ])("parses %s safely", (search, expected) => {
    expect(parseHomeTaskQuery(search)).toEqual(expected);
  });
});
