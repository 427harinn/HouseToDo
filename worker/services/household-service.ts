import {
  DEFAULT_HOUSEHOLD_TIMEZONE,
  DEFAULT_WEEK_STARTS_ON
} from "../lib/constants";
import { forbiddenError, householdLimitReachedError, notFoundError } from "../lib/errors";
import { nowIso } from "../lib/date";
import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { HouseholdRepository } from "../repositories/household-repository";
import type {
  HouseholdMemberProfile,
  HouseholdRole,
  HouseholdWithRole
} from "../types/domain";
import type { CreateHouseholdInput, UpdateHouseholdInput } from "../lib/validation";

export class HouseholdService {
  private readonly households: HouseholdRepository;
  private readonly members: HouseholdMemberRepository;

  constructor(private readonly db: D1Database) {
    this.households = new HouseholdRepository(db);
    this.members = new HouseholdMemberRepository(db);
  }

  async getCurrentHousehold(userId: string): Promise<HouseholdWithRole | null> {
    return this.households.findCurrentByUserId(userId);
  }

  async createHousehold(
    userId: string,
    input: CreateHouseholdInput
  ): Promise<HouseholdWithRole> {
    await this.ensureUserCanJoinHousehold(userId);

    const now = nowIso();
    const id = crypto.randomUUID();
    const householdInput = {
      id,
      name: input.name,
      timezone: DEFAULT_HOUSEHOLD_TIMEZONE,
      weekStartsOn: DEFAULT_WEEK_STARTS_ON,
      createdBy: userId,
      now
    };

    await this.db.batch([
      this.households.prepareCreate(householdInput),
      this.members.prepareAdd({
        householdId: id,
        userId,
        role: "owner",
        joinedAt: now
      })
    ]);

    return {
      id,
      name: input.name,
      timezone: DEFAULT_HOUSEHOLD_TIMEZONE,
      weekStartsOn: DEFAULT_WEEK_STARTS_ON,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      role: "owner"
    };
  }

  async updateCurrentHousehold(
    userId: string,
    input: UpdateHouseholdInput
  ): Promise<HouseholdWithRole> {
    const current = await this.requireCurrentHousehold(userId);
    if (current.role !== "owner") {
      throw forbiddenError("家庭設定を更新できるのはownerだけです。");
    }

    const updated = await this.households.update(current.id, { ...input, now: nowIso() });
    if (!updated) throw notFoundError();
    return { ...updated, role: current.role };
  }

  async listCurrentMembers(userId: string): Promise<HouseholdMemberProfile[]> {
    const current = await this.requireCurrentHousehold(userId);
    return this.members.listByHouseholdId(current.id);
  }

  async requireCurrentHousehold(userId: string): Promise<HouseholdWithRole> {
    const household = await this.households.findCurrentByUserId(userId);
    if (!household) throw notFoundError();

    const membership = await this.members.findMembership(household.id, userId);
    if (!membership) throw forbiddenError();

    return { ...household, role: membership.role };
  }

  async requireHouseholdRole(userId: string, role: HouseholdRole): Promise<HouseholdWithRole> {
    const household = await this.requireCurrentHousehold(userId);
    if (household.role !== role) throw forbiddenError();
    return household;
  }

  async ensureUserCanJoinHousehold(userId: string): Promise<void> {
    const count = await this.members.countByUserId(userId);
    if (count > 0) throw householdLimitReachedError();
  }
}
