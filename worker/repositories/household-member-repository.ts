import type { HouseholdMember, HouseholdMemberProfile, HouseholdRole } from "../types/domain";

type HouseholdMemberRow = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  color: string | null;
  joined_at: string;
};

type HouseholdMemberProfileRow = HouseholdMemberRow & {
  display_name: string;
};

export type AddHouseholdMemberInput = {
  householdId: string;
  userId: string;
  role: HouseholdRole;
  color?: string | null;
  joinedAt: string;
};

const toMember = (row: HouseholdMemberRow | null): HouseholdMember | null => {
  if (!row) return null;
  return {
    householdId: row.household_id,
    userId: row.user_id,
    role: row.role,
    color: row.color,
    joinedAt: row.joined_at
  };
};

const toMemberProfile = (row: HouseholdMemberProfileRow): HouseholdMemberProfile => ({
  ...toMember(row)!,
  displayName: row.display_name
});

export class HouseholdMemberRepository {
  constructor(private readonly db: D1Database) {}

  async findMembership(householdId: string, userId: string): Promise<HouseholdMember | null> {
    const row = await this.db
      .prepare(
        "SELECT household_id, user_id, role, color, joined_at FROM household_members WHERE household_id = ? AND user_id = ?"
      )
      .bind(householdId, userId)
      .first<HouseholdMemberRow>();
    return toMember(row);
  }

  async listByHouseholdId(householdId: string): Promise<HouseholdMemberProfile[]> {
    const result = await this.db
      .prepare(
        `SELECT hm.household_id, hm.user_id, hm.role, hm.color, hm.joined_at, u.display_name
         FROM household_members hm
         INNER JOIN users u ON u.id = hm.user_id
         WHERE hm.household_id = ?
         ORDER BY hm.joined_at ASC`
      )
      .bind(householdId)
      .all<HouseholdMemberProfileRow>();
    return (result.results ?? []).map(toMemberProfile);
  }

  prepareAdd(input: AddHouseholdMemberInput): D1PreparedStatement {
    return this.db
      .prepare(
        "INSERT INTO household_members (household_id, user_id, role, color, joined_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(input.householdId, input.userId, input.role, input.color ?? null, input.joinedAt);
  }

  async add(input: AddHouseholdMemberInput): Promise<HouseholdMember> {
    await this.prepareAdd(input).run();
    return {
      householdId: input.householdId,
      userId: input.userId,
      role: input.role,
      color: input.color ?? null,
      joinedAt: input.joinedAt
    };
  }

  async countByUserId(userId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS count FROM household_members WHERE user_id = ?")
      .bind(userId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }
}
