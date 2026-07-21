import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { parseJsonBody, validateLoginInput, validateRegisterInput } from "./validation";

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
});
