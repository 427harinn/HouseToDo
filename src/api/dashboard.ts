import { apiRequest } from "./client";
import type { HomeHistoryRecord, TodayTask, WeeklyTask } from "./tasks";
import type { HouseholdMember } from "../types";

export type DashboardToday = {
  date: string;
  household: {
    id: string;
    name: string;
    timezone?: string;
  };
  summary: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    skipped: number;
  };
  todayTasks: TodayTask[];
  /** M2 Home projection: active rows only, sorted by canonical deadline semantics. */
  homeTasks: TodayTask[];
  weeklyTasks: WeeklyTask[];
  completedRecords: HomeHistoryRecord[];
  passedRecords: HomeHistoryRecord[];
  shopping: {
    pendingCount: number;
    previewItems: Array<{
      id: string;
      name: string;
      quantity: string | null;
    }>;
  };
  members: Array<Pick<HouseholdMember, "userId" | "displayName" | "role" | "color" | "avatarUrl">>;
};

export const getDashboardToday = (date?: string, signal?: AbortSignal) => {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiRequest<DashboardToday>(`/api/dashboard/today${query}`, { signal });
};
