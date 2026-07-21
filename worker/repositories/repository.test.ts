import { describe, expect, it } from "vitest";
import { sha256Hex } from "../lib/crypto";
import { HouseholdInviteRepository } from "./household-invite-repository";
import { HouseholdMemberRepository } from "./household-member-repository";
import { HouseholdRepository } from "./household-repository";
import { SessionRepository } from "./session-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import { UserRepository } from "./user-repository";

describe("repositories", () => {
  it("creates and finds users by email", async () => {
    const db = new MemoryD1();
    const repository = new UserRepository(db as unknown as D1Database);

    await repository.create({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash",
      displayName: "Rinn",
      now: "2026-07-21T00:00:00.000Z"
    });

    await expect(repository.findByEmail("user@example.com")).resolves.toMatchObject({
      id: "user-1",
      email: "user@example.com"
    });
  });

  it("creates, finds, and deletes valid sessions by token hash", async () => {
    const db = new MemoryD1();
    const repository = new SessionRepository(db as unknown as D1Database);

    await repository.create({
      id: "session-1",
      userId: "user-1",
      tokenHash: "token-hash",
      expiresAt: "2026-07-22T00:00:00.000Z",
      now: "2026-07-21T00:00:00.000Z"
    });

    await expect(
      repository.findValidByTokenHash("token-hash", "2026-07-21T01:00:00.000Z")
    ).resolves.toMatchObject({ id: "session-1" });

    await repository.deleteByTokenHash("token-hash");
    await expect(
      repository.findValidByTokenHash("token-hash", "2026-07-21T01:00:00.000Z")
    ).resolves.toBeNull();
  });

  it("creates households and manages memberships", async () => {
    const db = new MemoryD1();
    const users = new UserRepository(db as unknown as D1Database);
    const households = new HouseholdRepository(db as unknown as D1Database);
    const members = new HouseholdMemberRepository(db as unknown as D1Database);
    const now = "2026-07-21T00:00:00.000Z";

    await users.create({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash",
      displayName: "Rinn",
      now
    });
    await households.create({
      id: "household-1",
      name: "わが家",
      timezone: "Asia/Tokyo",
      weekStartsOn: 1,
      createdBy: "user-1",
      now
    });
    await members.add({
      householdId: "household-1",
      userId: "user-1",
      role: "owner",
      joinedAt: now
    });

    await expect(households.findCurrentByUserId("user-1")).resolves.toMatchObject({
      id: "household-1",
      role: "owner"
    });
    await expect(members.findMembership("household-1", "user-1")).resolves.toMatchObject({
      role: "owner"
    });
    await expect(members.countByUserId("user-1")).resolves.toBe(1);
    await expect(members.listByHouseholdId("household-1")).resolves.toMatchObject([
      { displayName: "Rinn", role: "owner" }
    ]);
  });

  it("creates, finds, and marks household invites as used", async () => {
    const db = new MemoryD1();
    const repository = new HouseholdInviteRepository(db as unknown as D1Database);
    const codeHash = await sha256Hex("invite-code");

    await repository.create({
      id: "invite-1",
      householdId: "household-1",
      codeHash,
      createdBy: "owner-1",
      expiresAt: "2026-07-22T00:00:00.000Z",
      createdAt: "2026-07-21T00:00:00.000Z"
    });

    await expect(
      repository.findValidByCodeHash(codeHash, "2026-07-21T01:00:00.000Z")
    ).resolves.toMatchObject({ id: "invite-1" });
    await expect(
      repository.markUsed("invite-1", "member-1", "2026-07-21T01:00:00.000Z")
    ).resolves.toBe(true);
    await expect(
      repository.markUsed("invite-1", "member-2", "2026-07-21T01:01:00.000Z")
    ).resolves.toBe(false);
  });
});
