import { describe, expect, it } from "vitest";
import { safeErrorMessage, safeErrorStack } from "./safe-logging";

describe("safe logging", () => {
  it("redacts credentials and identifiers from error details", () => {
    const error = new Error(
      "password=very-long-password email=secret@example.invalid token=abcdefghijklmnopqrstuvwxyz0123456789"
    );

    expect(safeErrorMessage(error)).not.toContain("very-long-password");
    expect(safeErrorMessage(error)).not.toContain("secret@example.invalid");
    expect(safeErrorMessage(error)).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(safeErrorStack(error)).not.toContain("very-long-password");
  });
});
