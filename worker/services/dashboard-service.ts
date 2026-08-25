import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { ShoppingItemRepository } from "../repositories/shopping-item-repository";
import { HouseholdService } from "./household-service";
import { TaskService, type HomeHistoryRecord } from "./task-service";
import type { HouseholdMemberProfile } from "../types/domain";

const memberAvatarUrl = (member: HouseholdMemberProfile | undefined): string | null =>
  member?.avatar
    ? `/api/users/${encodeURIComponent(member.userId)}/avatar?v=${encodeURIComponent(member.avatarUpdatedAt ?? "")}`
    : null;

const homeRecordResponse = (entry: HomeHistoryRecord, members: HouseholdMemberProfile[]) => {
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

export class DashboardService {
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
    const [home, today, week, members, shoppingPendingCount, shoppingPreviewItems] = await Promise.all([
      this.tasks.listHome(userId, date),
      this.tasks.listToday(userId, date),
      this.tasks.listWeek(userId),
      this.members.listByHouseholdId(household.id),
      this.shoppingItems.countPending(household.id),
      this.shoppingItems.listPendingPreview(household.id, 3)
    ]);
    const summary = today.tasks.reduce(
      (acc, task) => {
        acc.total += 1;
        if (task.status === "pending") acc.pending += 1;
        if (task.status === "in_progress") acc.inProgress += 1;
        if (task.status === "completed") acc.completed += 1;
        if (task.status === "skipped") acc.skipped += 1;
        return acc;
      },
      { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 }
    );

    return {
      date: home.date,
      household: {
        id: household.id,
        name: household.name,
        timezone: household.timezone
      },
      summary,
      todayTasks: today.tasks,
      homeTasks: home.tasks,
      weeklyTasks: week.tasks,
      completedRecords: home.completed.map((entry) => homeRecordResponse(entry, members)),
      passedRecords: home.passed.map((entry) => homeRecordResponse(entry, members)),
      shopping: {
        pendingCount: shoppingPendingCount,
        previewItems: shoppingPreviewItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity
        }))
      },
      members: members.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
        color: member.color,
        avatarUrl: member.avatar
          ? `/api/users/${encodeURIComponent(member.userId)}/avatar?v=${encodeURIComponent(member.avatarUpdatedAt ?? "")}`
          : null
      }))
    };
  }
}
