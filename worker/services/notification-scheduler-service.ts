import {
  addDateKey,
  getLocalDate,
  getLocalTime,
  getWeekday,
  zonedDateTimeToDate
} from "../lib/date-time";
import { projectTaskOnDate, type TaskScope } from "../lib/task-model";
import { createNotificationSchedulerRepositories } from "../repositories/notification-scheduler-repository";
import type { Task } from "../types/domain";
import { WebPushService } from "./web-push-service";

export const isTaskDueToday = (task: Task, dateKey: string): boolean =>
  task.active &&
  task.recurrenceType !== "weekly" &&
  (task.recurrenceType === "daily" || task.weekdays.includes(getWeekday(dateKey)));

export const isIncomplete = (status: string | undefined): boolean =>
  status !== "completed" && status !== "skipped";

export const NOTIFICATION_DELIVERY_WINDOW_MINUTES = 20;

type ScheduledNotification = {
  scheduledDate: string;
  scheduledTime: string;
};

type CanonicalScheduledNotification = ScheduledNotification & {
  scope: TaskScope;
  targetKey: string;
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

export const resolveCanonicalNotifications = (
  task: Task,
  at: Date,
  timezone: string,
  windowMinutes = NOTIFICATION_DELIVERY_WINDOW_MINUTES
): CanonicalScheduledNotification[] => {
  if (
    !task.active ||
    !task.modelRecurrenceType ||
    task.deadlineTime === null ||
    task.deadlineTime === undefined ||
    task.notificationOffsetMinutes === null ||
    task.notificationOffsetMinutes === undefined ||
    windowMinutes <= 0
  )
    return [];
  const localDate = getLocalDate(at, timezone);
  const scopes = [addDateKey(localDate, -1), localDate, addDateKey(localDate, 1)]
    .map((dateKey) => projectTaskOnDate(task, dateKey))
    .filter((scope) => scope.matchesDate && scope.deadlineTime);
  const unique = new Map<string, CanonicalScheduledNotification>();
  for (const scope of scopes) {
    const stableKey = scope.occurrenceKey ?? scope.periodKey;
    if (!stableKey || unique.has(stableKey)) continue;
    const deadlineAt = zonedDateTimeToDate(
      scope.deadlineDate,
      scope.deadlineTime!,
      timezone
    );
    const notificationAt = new Date(
      deadlineAt.getTime() - task.notificationOffsetMinutes * 60_000
    );
    const delta = at.getTime() - notificationAt.getTime();
    if (delta < 0 || delta >= windowMinutes * 60_000) continue;
    unique.set(stableKey, {
      scheduledDate: getLocalDate(notificationAt, timezone),
      scheduledTime: getLocalTime(notificationAt, timezone),
      scope,
      targetKey: `task:${stableKey}`
    });
  }
  return Array.from(unique.values());
};

type SchedulerRepositories = ReturnType<typeof createNotificationSchedulerRepositories>;

type NotificationPushSender = Pick<WebPushService, "sendPayload">;

export class NotificationSchedulerService {
  constructor(
    private readonly db: D1Database,
    private readonly push: NotificationPushSender = new WebPushService(db),
    private readonly repositories: SchedulerRepositories = createNotificationSchedulerRepositories(
      db
    )
  ) {}

  async run(
    env: Parameters<WebPushService["sendTest"]>[2],
    at = new Date()
  ): Promise<void> {
    const now = at.toISOString();
    for (const household of await this.repositories.households.listAll()) {
      const tasks = await this.repositories.tasks.listByHouseholdId(household.id);
      const legacyScheduledTasks = tasks
        .filter((task) => !task.modelRecurrenceType)
        .map((task) => ({
          task,
          schedule: task.notificationTime
            ? resolveScheduledNotification(
                at,
                household.timezone,
                task.notificationTime
              )
            : null
        }))
        .filter(
          (item): item is { task: Task; schedule: ScheduledNotification } =>
            item.schedule !== null &&
            isTaskDueToday(item.task, item.schedule.scheduledDate)
        );
      const canonicalScheduledTasks = tasks
        .filter((task) => Boolean(task.modelRecurrenceType))
        .flatMap((task) =>
          resolveCanonicalNotifications(task, at, household.timezone).map(
            (schedule) => ({ task, schedule })
          )
        );
      const recordsByDate = new Map<string, Map<string, string>>();
      const getIncompleteTasksForDate = async (dateKey: string): Promise<Task[]> => {
        if (!recordsByDate.has(dateKey)) {
          const records = await this.repositories.records.listDailyRecords(
            household.id,
            dateKey
          );
          recordsByDate.set(
            dateKey,
            new Map(records.map((record) => [record.taskId, record.status]))
          );
        }
        const statusByTask = recordsByDate.get(dateKey)!;
        return tasks.filter(
          (task) =>
            isTaskDueToday(task, dateKey) && isIncomplete(statusByTask.get(task.id))
        );
      };
      for (const dateKey of new Set(
        legacyScheduledTasks.map((item) => item.schedule.scheduledDate)
      )) {
        await getIncompleteTasksForDate(dateKey);
      }
      const dueLegacyTasks = legacyScheduledTasks.filter((item) =>
        isIncomplete(recordsByDate.get(item.schedule.scheduledDate)?.get(item.task.id))
      );
      const dueCanonicalTasks: typeof canonicalScheduledTasks = [];
      for (const item of canonicalScheduledTasks) {
        let records = item.schedule.scope.occurrenceKey
          ? [
              await this.repositories.records.findByOccurrenceKey(
                item.task.id,
                item.schedule.scope.occurrenceKey
              )
            ].filter(Boolean)
          : await this.repositories.records.listByPeriodKey(
              item.task.id,
              item.schedule.scope.periodKey!
            );
        if (records.length === 0 && item.schedule.scope.occurrenceKey) {
          records = [
            await this.repositories.records.findDailyRecord(
              item.task.id,
              item.schedule.scope.targetDate
            )
          ].filter(Boolean);
        }
        if (
          records.length === 0 &&
          item.task.modelRecurrenceType === "weekly_flexible"
        ) {
          records = (
            await this.repositories.records.listWeeklyRecords(
              household.id,
              item.schedule.scope.periodStart
            )
          ).filter((record) => record.taskId === item.task.id);
        }
        if (
          records.some(
            (record) => record?.status === "completed" || record?.status === "skipped"
          )
        )
          continue;
        dueCanonicalTasks.push(item);
      }
      const members = await this.repositories.members.listByHouseholdId(household.id);
      for (const member of members) {
        for (const { task, schedule } of dueLegacyTasks) {
          await this.deliver(
            env,
            member.userId,
            household.id,
            "task",
            `${task.id}:${schedule.scheduledDate}:${schedule.scheduledTime}`,
            now,
            {
              title: "家事の時間です",
              body: task.title,
              icon: "/icons/house-todo-192.png",
              data: { url: `/tasks/${task.id}` }
            }
          );
        }
        for (const { task, schedule } of dueCanonicalTasks) {
          await this.deliver(
            env,
            member.userId,
            household.id,
            "task",
            schedule.targetKey,
            now,
            {
              title: "家事の時間です",
              body: task.title,
              icon: "/icons/house-todo-192.png",
              data: { url: `/tasks/${task.id}` }
            }
          );
        }
      }

      const settings = (await this.repositories.settings.listEnabled()).filter(
        (setting) => setting.householdId === household.id
      );
      for (const setting of settings) {
        const summarySchedules = [
          {
            enabled: setting.morningSummaryEnabled,
            time: setting.morningSummaryTime,
            type: "morning_summary",
            title: "今日の家事",
            body: "今日の家事を確認しましょう"
          },
          {
            enabled: setting.eveningSummaryEnabled,
            time: setting.eveningSummaryTime,
            type: "evening_summary",
            title: "今日のやり残し",
            body: "今日のやり残しを確認しましょう"
          }
        ];
        for (const summary of summarySchedules) {
          if (!summary.enabled) continue;
          const schedule = resolveScheduledNotification(
            at,
            setting.timezone,
            summary.time
          );
          if (!schedule) continue;
          const incompleteTasks = await getIncompleteTasksForDate(
            schedule.scheduledDate
          );
          if (incompleteTasks.length === 0) continue;
          await this.deliver(
            env,
            setting.userId,
            household.id,
            summary.type,
            schedule.scheduledDate,
            now,
            {
              title: summary.title,
              body:
                summary.type === "evening_summary"
                  ? `未完了の家事が${incompleteTasks.length}件あります`
                  : `今日の家事が${incompleteTasks.length}件あります`,
              icon: "/icons/house-todo-192.png",
              data: { url: "/" }
            }
          );
        }
      }
    }
  }

  private async deliver(
    env: Parameters<WebPushService["sendTest"]>[2],
    userId: string,
    householdId: string,
    type: string,
    targetKey: string,
    now: string,
    payload: object
  ): Promise<void> {
    const id = crypto.randomUUID();
    if (
      !(await this.repositories.deliveries.claim({
        id,
        userId,
        householdId,
        notificationType: type,
        targetKey,
        now
      }))
    )
      return;
    try {
      const result = await this.push.sendPayload(userId, householdId, payload, env);
      if (result.sent > 0) await this.repositories.deliveries.markSent(id, now);
      else await this.repositories.deliveries.release(id);
    } catch (error) {
      await this.repositories.deliveries.release(id);
      console.error(
        JSON.stringify({
          event: "notification_scheduler_delivery_failed",
          type,
          errorName: error instanceof Error ? error.name : "UnknownError"
        })
      );
    }
  }
}

export const runNotificationScheduler = (
  env: Parameters<WebPushService["sendTest"]>[2] & { DB: D1Database },
  at: Date
) => new NotificationSchedulerService(env.DB).run(env, at);
