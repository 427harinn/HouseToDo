import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadProfileImage } from "./account";

describe("profile image API client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses a JPEG filename when the browser fallback returns JPEG", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: { avatarUrl: "/api/users/u1/avatar?v=1" }, requestId: "request-1" }),
      { headers: { "content-type": "application/json" } }
    ));
    await uploadProfileImage({
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      width: 512,
      height: 512,
      contentType: "image/jpeg",
      size: 4
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("image")).toMatchObject({ name: "profile-avatar.jpg" });
  });
});
