import { describe, expect, it } from "vitest";
import { INVITE_CODE_BYTES, PBKDF2_ITERATIONS, SESSION_TOKEN_BYTES } from "./constants";
import {
  generateInviteCode,
  generateSessionToken,
  hashPassword,
  sha256Hex,
  verifyPassword
} from "./crypto";

describe("crypto helpers", () => {
  it("generates a base64url session token with enough entropy", () => {
    const token = generateSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(SESSION_TOKEN_BYTES);
  });

  it("hashes session tokens with sha256 hex", async () => {
    await expect(sha256Hex("token")).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates url-safe invite codes", () => {
    const code = generateInviteCode();

    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeGreaterThanOrEqual(INVITE_CODE_BYTES);
  });

  it("hashes and verifies passwords with PBKDF2", async () => {
    const passwordHash = await hashPassword("very-long-password");
    const [, iterations] = passwordHash.split("$");

    expect(passwordHash).toMatch(/^pbkdf2-sha256\$/);
    expect(PBKDF2_ITERATIONS).toBe(100_000);
    expect(Number(iterations)).toBe(PBKDF2_ITERATIONS);
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(100_000);
    await expect(verifyPassword("very-long-password", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(false);
  });
});
