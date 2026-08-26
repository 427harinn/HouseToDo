import { INVITE_TTL_SECONDS } from "../lib/constants";
import { generateInviteCode, sha256Hex } from "../lib/crypto";
import { expiresAtFromSeconds, isExpired, nowIso } from "../lib/date";
import {
  alreadyHouseholdMemberError,
  householdLimitReachedError,
  invalidInviteError,
  inviteAlreadyUsedError,
  inviteExpiredError
} from "../lib/errors";
import { HouseholdInviteRepository } from "../repositories/household-invite-repository";
import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { HouseholdRepository } from "../repositories/household-repository";
import type { HouseholdWithRole } from "../types/domain";
import { HouseholdService } from "./household-service";

export type CreatedInvite = {
  code: string;
  expiresAt: string;
};

export class HouseholdInviteService {
  private readonly households: HouseholdRepository;
  private readonly members: HouseholdMemberRepository;
  private readonly invites: HouseholdInviteRepository;
  private readonly householdService: HouseholdService;

  constructor(db: D1Database) {
    this.households = new HouseholdRepository(db);
    this.members = new HouseholdMemberRepository(db);
    this.invites = new HouseholdInviteRepository(db);
    this.householdService = new HouseholdService(db);
  }

  async validateCode(code: string): Promise<boolean> {
    const invite = await this.invites.findByCodeHash(await sha256Hex(code));
    return Boolean(invite && !invite.usedAt && !isExpired(invite.expiresAt));
  }

  async createInvite(userId: string): Promise<CreatedInvite> {
    const household = await this.householdService.requireHouseholdRole(userId, "owner");
    const code = generateInviteCode();
    const createdAt = nowIso();
    const expiresAt = expiresAtFromSeconds(INVITE_TTL_SECONDS, new Date(createdAt));

    await this.invites.create({
      id: crypto.randomUUID(),
      householdId: household.id,
      codeHash: await sha256Hex(code),
      createdBy: userId,
      expiresAt,
      createdAt
    });

    return { code, expiresAt };
  }

  async joinByCode(userId: string, code: string): Promise<HouseholdWithRole> {
    const codeHash = await sha256Hex(code);
    const invite = await this.invites.findByCodeHash(codeHash);
    if (!invite) throw invalidInviteError();
    if (invite.usedAt) throw inviteAlreadyUsedError();
    if (isExpired(invite.expiresAt)) throw inviteExpiredError();

    const existingMembership = await this.members.findMembership(invite.householdId, userId);
    if (existingMembership) throw alreadyHouseholdMemberError();

    const currentCount = await this.members.countByUserId(userId);
    if (currentCount > 0) throw householdLimitReachedError();

    const usedAt = nowIso();
    const marked = await this.invites.markUsed(invite.id, userId, usedAt);
    if (!marked) throw inviteAlreadyUsedError();

    await this.members.add({
      householdId: invite.householdId,
      userId,
      role: "member",
      joinedAt: usedAt
    });

    const household = await this.households.findById(invite.householdId);
    if (!household) throw invalidInviteError();
    return { ...household, role: "member" };
  }
}
