import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { ShoppingItemRepository } from "../repositories/shopping-item-repository";
import { HouseholdService } from "./household-service";
import { TaskService } from "./task-service";
import { homeRecordResponse } from "./home-service";

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
