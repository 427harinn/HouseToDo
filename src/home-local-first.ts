import type { HomeToday } from "./api/home";
import type { HomeHistoryRecord, TodayTask } from "./api/tasks";

export type HomeMutationType = "complete" | "pass" | "restore";
export type HomeMutationPhase = "animating" | "transitioned" | "reconciled";

export type HomeMutation = {
  id: string;
  type: HomeMutationType;
  phase: HomeMutationPhase;
  userId: string;
  householdId: string;
  date: string;
  taskId: string;
  originalTask?: TodayTask;
  originalRecord?: HomeHistoryRecord;
  transientRecord?: HomeHistoryRecord;
  startedAt: number;
  postSucceeded: boolean;
};

export type HomeIdentity = Pick<HomeMutation, "userId" | "householdId" | "date">;

const sameTask = (task: TodayTask, taskId: string) => task.id === taskId;
const sameRecord = (record: HomeHistoryRecord, mutation: HomeMutation) =>
  mutation.originalRecord?.id ? record.id === mutation.originalRecord.id : record.taskId === mutation.taskId;

const cloneTask = (task: TodayTask): TodayTask => ({ ...task, weekdays: [...(task.weekdays ?? [])] });

const cloneHistoryRecord = (record: HomeHistoryRecord): HomeHistoryRecord => ({
  ...record,
  actualCompleter: { ...record.actualCompleter },
  assignedUser: record.assignedUser ? { ...record.assignedUser } : null
});

export const isHomeMutationForIdentity = (mutation: HomeMutation, identity: HomeIdentity) =>
  mutation.userId === identity.userId &&
  mutation.householdId === identity.householdId &&
  mutation.date === identity.date;

export const removeHomeMutation = (mutations: HomeMutation[], mutationId: string) =>
  mutations.filter((mutation) => mutation.id !== mutationId);

export const getRetainedTaskProjection = (mutations: HomeMutation[], taskId: string) => {
  const mutation = [...mutations].reverse().find((entry) => entry.taskId === taskId && entry.originalTask);
  return mutation?.originalTask ? cloneTask(mutation.originalTask) : null;
};

export const createTemporaryHistoryRecord = (
  task: TodayTask,
  type: "complete" | "pass",
  identity: HomeIdentity,
  user: { id: string; displayName: string | null; avatarUrl?: string | null },
  startedAt: number,
  assignedMember?: { userId: string; displayName: string | null; color: string | null; avatarUrl?: string | null }
): HomeHistoryRecord => ({
  id: `local-${type}-${task.id}-${startedAt}`,
  taskId: task.id,
  status: type === "complete" ? "completed" : "skipped",
  title: task.title,
  taskActive: task.active,
  actualCompleter: {
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null
  },
  assignedUser: task.assignedUserId ? assignedMember ? { ...assignedMember, avatarUrl: assignedMember.avatarUrl ?? null } : {
    userId: task.assignedUserId,
    displayName: null,
    color: null,
    avatarUrl: null
  } : null,
  completedAt: type === "complete" ? new Date(startedAt).toISOString() : null,
  skippedAt: type === "pass" ? new Date(startedAt).toISOString() : null,
  targetDate: task.targetDate ?? (task.scopeKind === "occurrence" ? identity.date : null),
  targetWeekStart: task.modelRecurrenceType === "weekly_flexible" ? task.periodStart ?? null : null,
  occurrenceKey: task.occurrenceKey ?? null,
  periodKey: task.periodKey ?? null,
  createdAt: new Date(startedAt).toISOString(),
  updatedAt: new Date(startedAt).toISOString()
});

const upsertTransientRecord = (records: HomeHistoryRecord[], mutation: HomeMutation) => {
  if (!mutation.transientRecord) return records;
  const withoutTask = records.filter((record) => record.taskId !== mutation.taskId);
  return [...withoutTask, cloneHistoryRecord(mutation.transientRecord)];
};

/** Projects server-confirmed Home data with non-persistent, session-local mutation overlays. */
export const projectHomeData = (baseline: HomeToday, mutations: HomeMutation[]): HomeToday => {
  const relevant = mutations.filter((mutation) => mutation.date === baseline.date);
  let homeTasks = baseline.homeTasks.map(cloneTask);
  let completedRecords = baseline.completedRecords.map(cloneHistoryRecord);
  let passedRecords = baseline.passedRecords.map(cloneHistoryRecord);

  for (const mutation of relevant) {
    if (mutation.phase === "animating" || mutation.phase === "reconciled") continue;
    if (mutation.type === "complete") {
      homeTasks = homeTasks.filter((task) => !sameTask(task, mutation.taskId));
      completedRecords = upsertTransientRecord(completedRecords, mutation);
    } else if (mutation.type === "pass") {
      homeTasks = homeTasks.filter((task) => !sameTask(task, mutation.taskId));
      passedRecords = upsertTransientRecord(passedRecords, mutation);
    } else {
      completedRecords = completedRecords.filter((record) => !sameRecord(record, mutation));
      passedRecords = passedRecords.filter((record) => !sameRecord(record, mutation));
      if (mutation.originalTask) {
        const exists = homeTasks.some((task) => task.id === mutation.originalTask?.id);
        if (!exists) homeTasks = [...homeTasks, cloneTask(mutation.originalTask)];
      }
    }
  }

  return { ...baseline, homeTasks, completedRecords, passedRecords };
};

export const serverMatchesMutation = (data: HomeToday, mutation: HomeMutation) => {
  if (mutation.date !== data.date) return false;
  if (mutation.type === "complete") {
    return !data.homeTasks.some((task) => task.id === mutation.taskId) &&
      data.completedRecords.some((record) => record.taskId === mutation.taskId && record.status === "completed");
  }
  if (mutation.type === "pass") {
    return !data.homeTasks.some((task) => task.id === mutation.taskId) &&
      data.passedRecords.some((record) => record.taskId === mutation.taskId && record.status === "skipped");
  }
  return data.homeTasks.some((task) => task.id === mutation.taskId) &&
    !data.completedRecords.some((record) => sameRecord(record, mutation)) &&
    !data.passedRecords.some((record) => sameRecord(record, mutation));
};
