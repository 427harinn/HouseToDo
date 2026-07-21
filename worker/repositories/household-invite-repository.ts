import type { HouseholdInvite } from "../types/domain";

type HouseholdInviteRow = {
  id: string;
  household_id: string;
  code_hash: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
};

export type CreateInviteInput = {
  id: string;
  householdId: string;
  codeHash: string;
  createdBy: string;
  expiresAt: string;
  createdAt: string;
};

const toInvite = (row: HouseholdInviteRow | null): HouseholdInvite | null => {
  if (!row) return null;
  return {
    id: row.id,
    householdId: row.household_id,
    codeHash: row.code_hash,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by,
    createdAt: row.created_at
  };
};

export class HouseholdInviteRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateInviteInput): Promise<HouseholdInvite> {
    await this.db
      .prepare(
        "INSERT INTO household_invites (id, household_id, code_hash, created_by, expires_at, used_at, used_by, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)"
      )
      .bind(
        input.id,
        input.householdId,
        input.codeHash,
        input.createdBy,
        input.expiresAt,
        input.createdAt
      )
      .run();

    return {
      id: input.id,
      householdId: input.householdId,
      codeHash: input.codeHash,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      usedAt: null,
      usedBy: null,
      createdAt: input.createdAt
    };
  }

  async findByCodeHash(codeHash: string): Promise<HouseholdInvite | null> {
    const row = await this.db
      .prepare(
        "SELECT id, household_id, code_hash, created_by, expires_at, used_at, used_by, created_at FROM household_invites WHERE code_hash = ?"
      )
      .bind(codeHash)
      .first<HouseholdInviteRow>();
    return toInvite(row);
  }

  async findValidByCodeHash(codeHash: string, now: string): Promise<HouseholdInvite | null> {
    const row = await this.db
      .prepare(
        "SELECT id, household_id, code_hash, created_by, expires_at, used_at, used_by, created_at FROM household_invites WHERE code_hash = ? AND expires_at > ? AND used_at IS NULL"
      )
      .bind(codeHash, now)
      .first<HouseholdInviteRow>();
    return toInvite(row);
  }

  async markUsed(id: string, usedBy: string, usedAt: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        "UPDATE household_invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL"
      )
      .bind(usedAt, usedBy, id)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }
}
