import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { errorJson, okJson } from "./response";
import { withErrorHandling } from "../middleware/error-handler";
import type { RequestContext } from "../middleware/request-context";

const context = {
  request: new Request("https://example.test/api/test"),
  env: {},
  requestId: "request-1"
} as RequestContext;

describe("api response helpers", () => {
  it("returns the common success response shape", async () => {
    const response = okJson({ status: "ok" }, "request-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { status: "ok" },
      requestId: "request-1"
    });
  });

  it("converts AppError to the common error response shape", async () => {
    const response = errorJson(
      new AppError({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "入力内容を確認してください。",
        details: { email: "メールアドレスの形式が正しくありません。" }
      }),
      "request-1"
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "入力内容を確認してください。",
        details: { email: "メールアドレスの形式が正しくありません。" }
      },
      requestId: "request-1"
    });
  });

  it("converts unexpected exceptions to 500 without leaking internals", async () => {
    const handler = withErrorHandling(() => {
      throw new Error("secret database detail");
    });

    const response = await handler(context);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "サーバー内部でエラーが発生しました。"
      },
      requestId: "request-1"
    });
  });
});
