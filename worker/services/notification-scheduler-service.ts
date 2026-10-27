import {
  addDateKey,
  getLocalDate,
  getLocalTime,
  getWeekday,
  zonedDateTimeToDate
} from "../lib/date-time";
import { projectTaskOnDate, type TaskScope } from "../lib/task-model";
import { createNotificationSchedulerRepositories } from "../repositories/notification-scheduler-repository";
import type { Household, Task } from "../types/domain";
import { TaskService } from "./task-service";
import { WebPushService, type WebPushFailure } from "./web-push-service";

const classifyPushFailure = (failure: WebPushFailure): string => {
  if (failure.errorCategory === "push_service_stale") return "expired_subscription";
  if (failure.errorCategory === "push_service_auth_failed") return "auth_error";
  if (failure.errorCategory === "network_failed") return "network_error";
  if (failure.stage === "vapid") return "signing_error";
  return "unknown_error";
};

export const isTaskDueToday = (task: Task, dateKey: string): boolean =>
  task.active &&
  task.recurrenceType !== "weekly" &&
  (task.recurrenceType === "daily" || task.weekdays.includes(getWeekday(dateKey)));

export const isIncomplete = (status: string | undefined): boolean =>
  status !== "completed" && status !== "skipped";

export const NOTIFICATION_DELIVERY_WINDOW_MINUTES = 20;

export type SummaryPeriod = "morning" | "evening";

const normalizeTaskTitle = (title: string): string =>
  title.replace(/\s+/gu, " ").trim() || "家事";

export const formatRemainingTaskTitles = (
  tasks: Array<Pick<Task, "title">>
): string => {
  const titles = tasks.map((task) => normalizeTaskTitle(task.title));
  if (titles.length <= 3) return titles.join("・");
  return `${titles.slice(0, 3).join("・")}・ほか${titles.length - 3}件`;
};

export const summaryTitle = (period: SummaryPeriod, count: number): string =>
  period === "morning"
    ? `朝の家事が${count}件残っています`
    : `今日の家事が${count}件残っています`;

type ScheduledNotification = {
  scheduledDate: string;
  scheduledTime: string;
};

type CanonicalScheduledNotification = ScheduledNotification & {
  scope: TaskScope;
  targetKey: string;
};

export type TaskFollowup = {
  targetDate: string;
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

const resolveTaskFollowupWindow = (
  taskDate: string,
  taskTime: string,
  at: Date,
  timezone: string,
  windowMinutes: number
): boolean => {
  const taskMinutes = minutesFromTime(taskTime);
  if (taskMinutes === null || windowMinutes <= 0) return false;
  const taskAt = zonedDateTimeToDate(taskDate, taskTime, timezone);
  const followupAt = taskAt.getTime() + 30 * 60_000;
  const delta = at.getTime() - followupAt;
  return delta >= 0 && delta < windowMinutes * 60_000;
};

export const resolveLegacyTaskFollowups = (
  task: Task,
  at: Date,
  timezone: string,
  windowMinutes = NOTIFICATION_DELIVERY_WINDOW_MINUTES
): TaskFollowup[] => {
  if (
    !task.active ||
    task.modelRecurrenceType ||
    !task.scheduledTime ||
    !task.notificationTime
  )
    return [];
  const localDate = getLocalDate(at, timezone);
  return [addDateKey(localDate, -1), localDate, addDateKey(localDate, 1)]
    .filter((dateKey) => isTaskDueToday(task, dateKey))
    .filter((dateKey) =>
      resolveTaskFollowupWindow(dateKey, task.scheduledTime!, at, timezone, windowMinutes)
    )
    .map((dateKey) => ({
      targetDate: dateKey,
      targetKey: `task:occurrence:${task.id}:${dateKey}`
    }));
};

export const resolveCanonicalTaskFollowups = (
  task: Task,
  at: Date,
  timezone: string,
  windowMinutes = NOTIFICATION_DELIVERY_WINDOW_MINUTES
): TaskFollowup[] => {
  if (
    !task.active ||
    !task.modelRecurrenceType ||
    task.notificationOffsetMinutes === null ||
    task.notificationOffsetMinutes === undefined ||
    windowMinutes <= 0
  )
    return [];
  const localDate = getLocalDate(at, timezone);
  const unique = new Map<string, TaskFollowup>();
  for (const dateKey of [addDateKey(localDate, -1), localDate, addDateKey(localDate, 1)]) {
    const scope = projectTaskOnDate(task, dateKey);
    const stableKey = scope.occurrenceKey ?? scope.periodKey;
    if (
      !scope.matchesDate ||
      !stableKey ||
      !scope.deadlineTime ||
      unique.has(stableKey) ||
      !resolveTaskFollowupWindow(
        scope.deadlineDate,
        scope.deadlineTime,
        at,
        timezone,
        windowMinutes
      )
    )
      continue;
    unique.set(stableKey, {
      targetDate: scope.targetDate,
      targetKey: `task:${stableKey}`
    });
  }
  return Array.from(unique.values());
};

type SchedulerRepositories = ReturnType<typeof createNotificationSchedulerRepositories>;

type NotificationPushSender = Pick<WebPushService, "sendPayload">;
type HomeProjector = Pick<TaskService, "listHomeForHousehold">;

export class NotificationSchedulerService {
  private deliveryCounts = { sent: 0, failed: 0 };

  constructor(
    private readonly db: D1Database,
    private readonly push: NotificationPushSender = new WebPushService(db),
    private readonly repositories: SchedulerRepositories = createNotificationSchedulerRepositories(db),
    private readonly home: HomeProjector = new TaskService(db)
  ) {}

  async run(
    env: Parameters<WebPushService["sendTest"]>[2],
    at = new Date()
  ): Promise<void> {
    const now = at.toISOString();
    this.deliveryCounts = { sent: 0, failed: 0 };
    console.log(JSON.stringify({ event: "notification_scheduler_started", scheduledAt: now }));
    for (const household of await this.repositories.households.listAll()) {
      try {
        await this.runForHousehold(env, household, at, now);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "notification_scheduler_household_failed",
            errorName: error instanceof Error ? error.name : "UnknownError"
          })
        );
      }
    }
    console.log(JSON.stringify({
      event: "notification_scheduler_completed",
      sentCount: this.deliveryCounts.sent,
      failedCount: this.deliveryCounts.failed
    }));
  }

  private async runForHousehold(
    env: Parameters<WebPushService["sendTest"]>[2],
    household: Household,
    at: Date,
    now: string
  ): Promise<void> {
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
      const legacyFollowups = tasks.flatMap((task) =>
        resolveLegacyTaskFollowups(task, at, household.timezone).map((followup) => ({ task, followup }))
      );
      const canonicalFollowups = tasks.flatMap((task) =>
        resolveCanonicalTaskFollowups(task, at, household.timezone).map((followup) => ({ task, followup }))
      );
      const recordsByDate = new Map<string, Map<string, string>>();
      const getLegacyIncompleteTasksForDate = async (dateKey: string): Promise<Task[]> => {
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
        await getLegacyIncompleteTasksForDate(dateKey);
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
        for (const { task, followup } of legacyFollowups) {
          if (!(await this.isFollowupIncomplete(task, followup.targetDate))) continue;
          await this.deliver(
            env,
            member.userId,
            household.id,
            "task_followup",
            followup.targetKey,
            now,
            {
              title: "家事を忘れていませんか？",
              body: `「${task.title}」がまだ完了していません`,
              icon: "/icons/house-todo-v4-192.png",
              data: {
                kind: "task_followup",
                taskId: task.id,
                url: `/home?task=${encodeURIComponent(task.id)}`
              }
            }
          );
        }
        for (const { task, followup } of canonicalFollowups) {
          if (!(await this.isFollowupIncomplete(task, followup.targetDate))) continue;
          await this.deliver(
            env,
            member.userId,
            household.id,
            "task_followup",
            followup.targetKey,
            now,
            {
              title: "家事を忘れていませんか？",
              body: `「${task.title}」がまだ完了していません`,
              icon: "/icons/house-todo-v4-192.png",
              data: {
                kind: "task_followup",
                taskId: task.id,
                url: `/home?task=${encodeURIComponent(task.id)}`
              }
            }
          );
        }
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
              icon: "/icons/house-todo-v4-192.png",
              data: {
                kind: "task",
                taskId: task.id,
                url: `/home?task=${encodeURIComponent(task.id)}`
              }
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
              icon: "/icons/house-todo-v4-192.png",
              data: {
                kind: "task",
                taskId: task.id,
                url: `/home?task=${encodeURIComponent(task.id)}`
              }
            }
          );
        }
      }

      const settings = (await this.repositories.settings.listEnabled()).filter(
        (setting) => setting.householdId === household.id
      );
      const homeByDate = new Map<
        string,
        ReturnType<HomeProjector["listHomeForHousehold"]>
      >();
      const getHomeForDate = (dateKey: string) => {
        const cached = homeByDate.get(dateKey);
        if (cached) return cached;
        const home = this.home.listHomeForHousehold(
          { ...household, role: "owner" },
          dateKey
        );
        homeByDate.set(dateKey, home);
        return home;
      };
      for (const setting of settings) {
        const summarySchedules = [
          {
            enabled: setting.morningSummaryEnabled,
            time: setting.morningSummaryTime,
            period: "morning" as const,
            type: "morning_summary" as const
          },
          {
            enabled: setting.eveningSummaryEnabled,
            time: setting.eveningSummaryTime,
            period: "evening" as const,
            type: "evening_summary" as const
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
          const home = await getHomeForDate(schedule.scheduledDate);
          const remainingTasks = home.tasks;
          if (remainingTasks.length === 0) continue;
          await this.deliver(
            env,
            setting.userId,
            household.id,
            summary.type,
            `${schedule.scheduledDate}:${schedule.scheduledTime}`,
            now,
            {
              title: summaryTitle(summary.period, remainingTasks.length),
              body: formatRemainingTaskTitles(remainingTasks),
              icon: "/icons/house-todo-v4-192.png",
              data: {
                kind: "summary",
                period: summary.period,
                localDate: schedule.scheduledDate,
                url: "/home"
              }
            }
          );
        }
      }
  }

  private async isFollowupIncomplete(task: Task, targetDate: string): Promise<boolean> {
    if (!task.active) return false;
    if (!task.modelRecurrenceType) {
      const record = await this.repositories.records.findDailyRecord(task.id, targetDate);
      return isIncomplete(record?.status);
    }

    const scope = projectTaskOnDate(task, targetDate);
    if (!scope.matchesDate) return false;
    let records = scope.occurrenceKey
      ? [await this.repositories.records.findByOccurrenceKey(task.id, scope.occurrenceKey)].filter(Boolean)
      : await this.repositories.records.listByPeriodKey(task.id, scope.periodKey!);
    if (records.length === 0 && scope.occurrenceKey) {
      records = [await this.repositories.records.findDailyRecord(task.id, scope.targetDate)].filter(Boolean);
    }
    if (records.length === 0 && task.modelRecurrenceType === "weekly_flexible") {
      records = (await this.repositories.records.listWeeklyRecords(task.householdId, scope.periodStart))
        .filter((record) => record.taskId === task.id);
    }
    return !records.some((record) => record?.status === "completed" || record?.status === "skipped");
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
      if (result.sent > 0) {
        await this.repositories.deliveries.markSent(id, now);
        this.deliveryCounts.sent += result.sent;
        this.deliveryCounts.failed += result.failed;
        console.log(JSON.stringify({
          event: "notification_delivery_result",
          result: "success",
          sentCount: result.sent,
          failedCount: result.failed
        }));
      } else {
        await this.repositories.deliveries.release(id);
        console.log(JSON.stringify({
          event: "notification_delivery_result",
          result: result.failure ? classifyPushFailure(result.failure) : "unknown_error",
          errorCategory: result.failure?.errorCategory ?? "no_successful_subscription",
          failedCount: result.failed
        }));
        this.deliveryCounts.failed += Math.max(result.failed, 1);
      }
    } catch (error) {
      await this.repositories.deliveries.release(id);
      console.error(
        JSON.stringify({
          event: "notification_delivery_result",
          result: "unknown_error",
          errorName: error instanceof Error ? error.name : "UnknownError"
        })
      );
      this.deliveryCounts.failed += 1;
    }
  }
}

export const runNotificationScheduler = (
  env: Parameters<WebPushService["sendTest"]>[2] & { DB: D1Database },
  at: Date
) => new NotificationSchedulerService(env.DB).run(env, at);
