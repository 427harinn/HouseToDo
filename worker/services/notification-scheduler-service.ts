import { getLocalDate, getLocalTime, getWeekday } from "../lib/date-time";
import { createNotificationSchedulerRepositories } from "../repositories/notification-scheduler-repository";
import type { Task } from "../types/domain";
import { WebPushService } from "./web-push-service";

export const isTaskDueToday = (task: Task, dateKey: string): boolean =>
  task.active && task.recurrenceType !== "weekly" &&
  (task.recurrenceType === "daily" || task.weekdays.includes(getWeekday(dateKey)));

export const isIncomplete = (status: string | undefined): boolean =>
  status !== "completed" && status !== "skipped";

type SchedulerRepositories = ReturnType<typeof createNotificationSchedulerRepositories>;

type NotificationPushSender = Pick<WebPushService, "sendPayload">;

export class NotificationSchedulerService {
  constructor(
    private readonly db: D1Database,
    private readonly push: NotificationPushSender = new WebPushService(db),
    private readonly repositories: SchedulerRepositories = createNotificationSchedulerRepositories(db)
  ) {}

  async run(env: Parameters<WebPushService["sendTest"]>[2], at = new Date()): Promise<void> {
    const now = at.toISOString();
    for (const household of await this.repositories.households.listAll()) {
      const dateKey = getLocalDate(at, household.timezone);
      const records = await this.repositories.records.listDailyRecords(household.id, dateKey);
      const statusByTask = new Map(records.map((record) => [record.taskId, record.status]));
      const tasks = (await this.repositories.tasks.listByHouseholdId(household.id))
        .filter((task) => isTaskDueToday(task, dateKey) && isIncomplete(statusByTask.get(task.id)));
      if (tasks.length === 0) continue;

      const members = await this.repositories.members.listByHouseholdId(household.id);
      const currentTime = getLocalTime(at, household.timezone);
      for (const member of members) {
        for (const task of tasks) {
          if (!task.notificationTime || task.notificationTime !== currentTime) continue;
          await this.deliver(env, member.userId, household.id, "task", `${task.id}:${dateKey}:${task.notificationTime}`, now, {
            title: "家事の時間です",
            body: task.title,
            icon: "/icons/house-todo-192.png",
            data: { url: `/tasks/${task.id}` }
          });
        }
      }

      const settings = (await this.repositories.settings.listEnabled())
        .filter((setting) => setting.householdId === household.id);
      for (const setting of settings) {
        if (getLocalDate(at, setting.timezone) !== dateKey || getLocalTime(at, setting.timezone) !== setting.eveningSummaryTime) continue;
        await this.deliver(env, setting.userId, household.id, "evening_summary", dateKey, now, {
          title: "今日のやり残し",
          body: `未完了の家事が${tasks.length}件あります`,
          icon: "/icons/house-todo-192.png",
          data: { url: "/" }
        });
      }
    }
  }

  private async deliver(
    env: Parameters<WebPushService["sendTest"]>[2], userId: string, householdId: string,
    type: string, targetKey: string, now: string, payload: object
  ): Promise<void> {
    const id = crypto.randomUUID();
    if (!(await this.repositories.deliveries.claim({ id, userId, householdId, notificationType: type, targetKey, now }))) return;
    try {
      const result = await this.push.sendPayload(userId, householdId, payload, env);
      if (result.sent > 0) await this.repositories.deliveries.markSent(id, now);
      else await this.repositories.deliveries.release(id);
    } catch (error) {
      await this.repositories.deliveries.release(id);
      console.error(JSON.stringify({ event: "notification_scheduler_delivery_failed", type, errorName: error instanceof Error ? error.name : "UnknownError" }));
    }
  }
}

export const runNotificationScheduler = (env: Parameters<WebPushService["sendTest"]>[2] & { DB: D1Database }, at: Date) =>
  new NotificationSchedulerService(env.DB).run(env, at);
