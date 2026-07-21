import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("sends JSON requests with cookies included", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, data: { user: { id: "1" } }, requestId: "req" }),
        { headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      apiRequest("/api/example", {
        method: "POST",
        body: JSON.stringify({ name: "test" })
      })
    ).resolves.toEqual({ user: { id: "1" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("throws typed API errors for failure responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "入力内容を確認してください。",
            details: { email: "メールを確認してください。" }
          },
          requestId: "req"
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      )
    );

    await expect(apiRequest("/api/example")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      details: { email: "メールを確認してください。" }
    } satisfies Partial<ApiError>);
  });
});
