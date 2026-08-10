import { describe, expect, it } from "vitest";
import { isDiagnosticEnvironment } from "./diagnostic-visibility";

describe("diagnostic UI visibility", () => {
  it.each(["development", "test"])("is visible in %s", (mode) => {
    expect(isDiagnosticEnvironment(mode, "app.example.test")).toBe(true);
  });

  it("is visible on the staging hostname", () => {
    expect(
      isDiagnosticEnvironment("production", "house-to-do-staging.427harinn.workers.dev")
    ).toBe(true);
  });

  it("is hidden in production on non-staging hosts", () => {
    expect(isDiagnosticEnvironment("production", "house-to-do.example.com")).toBe(false);
  });
});
