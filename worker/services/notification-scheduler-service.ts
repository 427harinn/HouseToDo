import { addDateKey, getLocalDate, getLocalTime, getWeekday } from "../lib/date-time";
import { createNotificationSchedulerRepositories } from "../repositories/notification-scheduler-repository";
import type { Task } from "../types/domain";
import { WebPushService } from "./web-push-service";

export const isTaskDueToday = (task: Task, dateKey: string): boolean =>
  task.active && task.recurrenceType !== "weekly" &&
  (task.recurrenceType === "daily" || task.weekdays.includes(getWeekday(dateKey)));

export const isIncomplete = (status: string | undefined): boolean =>
  status !== "completed" && status !== "skipped";

export const NOTIFICATION_DELIVERY_WINDOW_MINUTES = 20;

type ScheduledNotification = {
  scheduledDate: string;
  scheduledTime: string;
};

const minutesFromTime = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
};

export const resolveScheduledNotification = (
  at: Date,
  timezone: string,
  scheduledTime: string,
  windowMinutes = NOTIFICATION_DELIVERY_WINDOW_MINUTES
): ScheduledNotification | null => {
  const targetMinutes = minutesFromTime(scheduledTime);
  if (targetMinutes === null || windowMinutes <= 0) return null;
  const currentDate = getLocalDate(at, timezone);
  const currentMinutes = minutesFromTime(getLocalTime(at, timezone));
  if (currentMinutes === null) return null;
  const delta = currentMinutes - targetMinutes;
  if (delta >= 0 && delta < windowMinutes) {
    return { scheduledDate: currentDate, scheduledTime };
  }
  if (delta < 0 && delta + 24 * 60 < windowMinutes) {
    return { scheduledDate: addDateKey(currentDate, -1), scheduledTime };
  }
  return null;
};

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
      const tasks = await this.repositories.tasks.listByHouseholdId(household.id);
      const scheduledTasks = tasks
        .map((task) => ({
          task,
          schedule: task.notificationTime
            ? resolveScheduledNotification(at, household.timezone, task.notificationTime)
            : null
        }))
        .filter((item): item is { task: Task; schedule: ScheduledNotification } =>
          item.schedule !== null && isTaskDueToday(item.task, item.schedule.scheduledDate)
        );
      const recordsByDate = new Map<string, Map<string, string>>();
      const getIncompleteTasksForDate = async (dateKey: string): Promise<Task[]> => {
        if (!recordsByDate.has(dateKey)) {
          const records = await this.repositories.records.listDailyRecords(household.id, dateKey);
          recordsByDate.set(dateKey, new Map(records.map((record) => [record.taskId, record.status])));
        }
        const statusByTask = recordsByDate.get(dateKey)!;
        return tasks.filter((task) =>
          isTaskDueToday(task, dateKey) && isIncomplete(statusByTask.get(task.id))
        );
      };
      for (const dateKey of new Set(scheduledTasks.map((item) => item.schedule.scheduledDate))) {
        await getIncompleteTasksForDate(dateKey);
      }
      const dueTasks = scheduledTasks.filter((item) =>
        isIncomplete(recordsByDate.get(item.schedule.scheduledDate)?.get(item.task.id))
      );
      const members = await this.repositories.members.listByHouseholdId(household.id);
      for (const member of members) {
        for (const { task, schedule } of dueTasks) {
          await this.deliver(env, member.userId, household.id, "task", `${task.id}:${schedule.scheduledDate}:${schedule.scheduledTime}`, now, {
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
        const schedule = resolveScheduledNotification(at, setting.timezone, setting.eveningSummaryTime);
        if (!schedule) continue;
        const incompleteTasks = await getIncompleteTasksForDate(schedule.scheduledDate);
        if (incompleteTasks.length === 0) continue;
        await this.deliver(env, setting.userId, household.id, "evening_summary", schedule.scheduledDate, now, {
          title: "今日のやり残し",
          body: `未完了の家事が${incompleteTasks.length}件あります`,
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
