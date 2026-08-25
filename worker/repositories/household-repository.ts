import type { Household, HouseholdWithRole } from "../types/domain";

type HouseholdRow = {
  id: string;
  name: string;
  timezone: string;
  week_starts_on: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type HouseholdWithRoleRow = HouseholdRow & {
  role: "owner" | "member";
};

export type CreateHouseholdRecordInput = {
  id: string;
  name: string;
  timezone: string;
  weekStartsOn: number;
  createdBy: string;
  now: string;
};

export type UpdateHouseholdRecordInput = {
  name?: string;
  timezone?: string;
  weekStartsOn?: number;
  now: string;
};

const toHousehold = (row: HouseholdRow | null): Household | null => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const toHouseholdWithRole = (row: HouseholdWithRoleRow | null): HouseholdWithRole | null => {
  const household = toHousehold(row);
  return household && row ? { ...household, role: row.role } : null;
};

export class HouseholdRepository {
  constructor(private readonly db: D1Database) {}

  async findCurrentByUserId(userId: string): Promise<HouseholdWithRole | null> {
    const row = await this.db
      .prepare(
        `SELECT h.id, h.name, h.timezone, h.week_starts_on, h.created_by, h.created_at, h.updated_at, hm.role
         FROM households h
         INNER JOIN household_members hm ON hm.household_id = h.id
         WHERE hm.user_id = ?
         ORDER BY hm.joined_at ASC
         LIMIT 1`
      )
      .bind(userId)
      .first<HouseholdWithRoleRow>();
    return toHouseholdWithRole(row);
  }

  async findById(id: string): Promise<Household | null> {
    const row = await this.db
      .prepare(
        "SELECT id, name, timezone, week_starts_on, created_by, created_at, updated_at FROM households WHERE id = ?"
      )
      .bind(id)
      .first<HouseholdRow>();
    return toHousehold(row);
  }

  async listAll(): Promise<Household[]> {
    const result = await this.db.prepare(
      "SELECT id, name, timezone, week_starts_on, created_by, created_at, updated_at FROM households"
    ).all<HouseholdRow>();
    return (result.results ?? []).map((row) => toHousehold(row)!);
  }

  prepareCreate(input: CreateHouseholdRecordInput): D1PreparedStatement {
    return this.db
      .prepare(
        "INSERT INTO households (id, name, timezone, week_starts_on, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        input.id,
        input.name,
        input.timezone,
        input.weekStartsOn,
        input.createdBy,
        input.now,
        input.now
      );
  }

  async create(input: CreateHouseholdRecordInput): Promise<Household> {
    await this.prepareCreate(input).run();
    return {
      id: input.id,
      name: input.name,
      timezone: input.timezone,
      weekStartsOn: input.weekStartsOn,
      createdBy: input.createdBy,
      createdAt: input.now,
      updatedAt: input.now
    };
  }

  async update(id: string, input: UpdateHouseholdRecordInput): Promise<Household | null> {
    const current = await this.findById(id);
    if (!current) return null;
    const name = input.name ?? current.name;
    const timezone = input.timezone ?? current.timezone;
    const weekStartsOn = input.weekStartsOn ?? current.weekStartsOn;

    await this.db
      .prepare("UPDATE households SET name = ?, timezone = ?, week_starts_on = ?, updated_at = ? WHERE id = ?")
      .bind(name, timezone, weekStartsOn, input.now, id)
      .run();

    return { ...current, name, timezone, weekStartsOn, updatedAt: input.now };
  }
}
