import { apiRequest } from "./client";
import type { TodayTask, WeeklyTask } from "./tasks";
import type { HouseholdMember } from "../types";

export type DashboardToday = {
  date: string;
  household: {
    id: string;
    name: string;
  };
  summary: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    skipped: number;
  };
  todayTasks: TodayTask[];
  weeklyTasks: WeeklyTask[];
  members: Array<Pick<HouseholdMember, "userId" | "displayName" | "role" | "color">>;
};

export const getDashboardToday = (date?: string, signal?: AbortSignal) => {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiRequest<DashboardToday>(`/api/dashboard/today${query}`, { signal });
};
