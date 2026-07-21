import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "./constants";
import { createExpiredSessionCookie, createSessionCookie, readCookie } from "./cookies";

describe("cookie helpers", () => {
  it("uses Secure in production", () => {
    const cookie = createSessionCookie("token", "production");

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(cookie).toContain("Secure");
  });

  it("omits Secure in development", () => {
    expect(createSessionCookie("token", "development")).not.toContain("Secure");
  });

  it("creates an expired session cookie", () => {
    expect(createExpiredSessionCookie("production")).toContain("Max-Age=0");
  });

  it("reads a cookie value by name", () => {
    const request = new Request("https://example.test", {
      headers: { cookie: "theme=light; house_todo_session=abc123" }
    });

    expect(readCookie(request, SESSION_COOKIE_NAME)).toBe("abc123");
  });
});
