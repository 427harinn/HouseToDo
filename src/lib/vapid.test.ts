import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./vapid";

describe("urlBase64ToUint8Array", () => {
  it("converts URL-safe base64 without padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4]);
  });

  it("rejects malformed values", () => {
    expect(() => urlBase64ToUint8Array("not valid!")) .toThrow("invalid-vapid-public-key");
  });
});
