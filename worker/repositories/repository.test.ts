import { describe, expect, it } from "vitest";
import { sha256Hex } from "../lib/crypto";
import { HouseholdInviteRepository } from "./household-invite-repository";
import { HouseholdMemberRepository } from "./household-member-repository";
import { HouseholdRepository } from "./household-repository";
import { SessionRepository } from "./session-repository";
import { MemoryD1 } from "../test-utils/memory-d1";
import { UserRepository } from "./user-repository";
import { OrphanR2ObjectRepository } from "./orphan-r2-object-repository";

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

  it("deduplicates orphan R2 keys and lists only due records in order", async () => {
    const db = new MemoryD1();
    const repository = new OrphanR2ObjectRepository(db as unknown as D1Database);
    await repository.enqueue({ id: "orphan-1", r2Key: "key-1", sourceType: "manual_reconciliation", sourceId: "source-1", householdId: "household-1", reason: "first", firstFailedAt: "2026-01-01T00:00:00.000Z", nextAttemptAt: "2026-01-02T00:00:00.000Z", now: "2026-01-01T00:00:00.000Z" });
    await repository.enqueue({ id: "orphan-2", r2Key: "key-1", sourceType: "manual_reconciliation", sourceId: "source-2", householdId: "household-1", reason: "updated", firstFailedAt: "2026-01-03T00:00:00.000Z", nextAttemptAt: "2026-01-04T00:00:00.000Z", now: "2026-01-03T00:00:00.000Z" });
    await repository.enqueue({ id: "orphan-3", r2Key: "key-2", sourceType: "manual_reconciliation", sourceId: "source-3", householdId: "household-2", reason: "second", firstFailedAt: "2026-01-01T01:00:00.000Z", nextAttemptAt: "2026-01-01T02:00:00.000Z", now: "2026-01-01T00:00:00.000Z" });
    const due = await repository.listDue("2026-01-03T00:00:00.000Z", 50);
    expect(db.orphanR2Objects.size).toBe(2); expect(due.map((item) => item.r2Key)).toEqual(["key-2", "key-1"]); expect(due[1]?.firstFailedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
