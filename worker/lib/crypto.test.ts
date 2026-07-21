import { describe, expect, it } from "vitest";
import { SESSION_TOKEN_BYTES } from "./constants";
import { generateSessionToken, hashPassword, sha256Hex, verifyPassword } from "./crypto";

describe("crypto helpers", () => {
  it("generates a base64url session token with enough entropy", () => {
    const token = generateSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(SESSION_TOKEN_BYTES);
  });

  it("hashes session tokens with sha256 hex", async () => {
    await expect(sha256Hex("token")).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes and verifies passwords with PBKDF2", async () => {
    const passwordHash = await hashPassword("very-long-password");

    expect(passwordHash).toMatch(/^pbkdf2-sha256\$/);
    await expect(verifyPassword("very-long-password", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(false);
  });
});
