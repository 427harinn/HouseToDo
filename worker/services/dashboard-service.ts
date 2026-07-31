import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { HouseholdService } from "./household-service";
import { TaskService } from "./task-service";

export class DashboardService {
  private readonly households: HouseholdService;
  private readonly members: HouseholdMemberRepository;
  private readonly tasks: TaskService;

  constructor(db: D1Database) {
    this.households = new HouseholdService(db);
    this.members = new HouseholdMemberRepository(db);
    this.tasks = new TaskService(db);
  }

  async getToday(userId: string, date?: string | null) {
    const household = await this.households.requireCurrentHousehold(userId);
    const today = await this.tasks.listToday(userId, date);
    const week = await this.tasks.listWeek(userId);
    const members = await this.members.listByHouseholdId(household.id);
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
      date: today.date,
      household: {
        id: household.id,
        name: household.name
      },
      summary,
      todayTasks: today.tasks,
      weeklyTasks: week.tasks,
      members: members.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
        color: member.color
      }))
    };
  }
}
