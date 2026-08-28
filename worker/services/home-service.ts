import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { ShoppingItemRepository } from "../repositories/shopping-item-repository";
import { HouseholdService } from "./household-service";
import { TaskService, type HomeHistoryRecord } from "./task-service";
import type { HouseholdMemberProfile } from "../types/domain";

const memberAvatarUrl = (member: HouseholdMemberProfile | undefined): string | null =>
  member?.avatar
    ? `/api/users/${encodeURIComponent(member.userId)}/avatar?v=${encodeURIComponent(member.avatarUpdatedAt ?? "")}`
    : null;

export const homeRecordResponse = (entry: HomeHistoryRecord, members: HouseholdMemberProfile[]) => {
  const record = entry.record;
  const task = entry.task;
  const byId = new Map(members.map((member) => [member.userId, member]));
  const assignedUserId = record.assignedUserIdSnapshot ?? task?.assignedUserId ?? null;
  const assignedMember = assignedUserId ? byId.get(assignedUserId) : undefined;
  const completer = byId.get(record.actedBy);
  return {
    id: record.id,
    taskId: record.taskId,
    targetDate: record.targetDate,
    targetWeekStart: record.targetWeekStart,
    occurrenceKey: record.occurrenceKey,
    periodKey: record.periodKey,
    status: record.status,
    title: record.taskTitleSnapshot ?? task?.title ?? "家事",
    taskActive: entry.taskActive,
    actualCompleter: {
      userId: record.actedBy,
      displayName: record.actedByDisplayName,
      avatarUrl: memberAvatarUrl(completer)
    },
    assignedUser: assignedUserId
      ? {
          userId: assignedUserId,
          displayName: record.assignedUserDisplayNameSnapshot ?? assignedMember?.displayName ?? null,
          color: record.assignedUserColorSnapshot ?? assignedMember?.color ?? null,
          avatarUrl: record.assignedUserAvatarUrlSnapshot ?? memberAvatarUrl(assignedMember)
        }
      : null,
    completedAt: record.completedAt,
    skippedAt: record.skippedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
};

const memberResponse = (member: HouseholdMemberProfile) => ({
  userId: member.userId,
  displayName: member.displayName,
  role: member.role,
  color: member.color,
  avatarUrl: member.avatar
    ? `/api/users/${encodeURIComponent(member.userId)}/avatar?v=${encodeURIComponent(member.avatarUpdatedAt ?? "")}`
    : null
});

export class HomeService {
  private readonly households: HouseholdService;
  private readonly members: HouseholdMemberRepository;
  private readonly shoppingItems: ShoppingItemRepository;
  private readonly tasks: TaskService;

  constructor(db: D1Database) {
    this.households = new HouseholdService(db);
    this.members = new HouseholdMemberRepository(db);
    this.shoppingItems = new ShoppingItemRepository(db);
    this.tasks = new TaskService(db);
  }

  async getToday(userId: string, date?: string | null) {
    const household = await this.households.requireCurrentHousehold(userId);
    const [home, members, shoppingPendingCount] = await Promise.all([
      this.tasks.listHomeForHousehold(household, date),
      this.members.listByHouseholdId(household.id),
      this.shoppingItems.countPending(household.id)
    ]);

    return {
      date: home.date,
      homeTasks: home.tasks,
      completedRecords: home.completed.map((entry) => homeRecordResponse(entry, members)),
      passedRecords: home.passed.map((entry) => homeRecordResponse(entry, members)),
      shopping: { pendingCount: shoppingPendingCount },
      members: members.map(memberResponse)
    };
  }
}
