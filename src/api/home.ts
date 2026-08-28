import { apiRequest } from "./client";
import type { HomeHistoryRecord, TodayTask } from "./tasks";
import type { HouseholdMember } from "../types";

export type HomeToday = {
  date: string;
  homeTasks: TodayTask[];
  completedRecords: HomeHistoryRecord[];
  passedRecords: HomeHistoryRecord[];
  shopping: {
    pendingCount: number;
  };
  members: Array<Pick<HouseholdMember, "userId" | "displayName" | "role" | "color" | "avatarUrl">>;
};

export const getHomeToday = (date?: string, signal?: AbortSignal) => {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiRequest<HomeToday>(`/api/home/today${query}`, { signal });
};
