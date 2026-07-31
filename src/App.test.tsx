import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { APP_NAME } from "./constants";

const user = {
  id: "user-1",
  email: "a@example.com",
  displayName: "さやか"
};

const household = {
  id: "household-1",
  name: "わが家",
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  role: "owner"
};

const members = [
  { userId: "user-1", displayName: "さやか", role: "owner", color: "#d9f2eb", joinedAt: "2026-07-01T00:00:00Z" },
  { userId: "user-2", displayName: "たくや", role: "member", color: "#e4eef8", joinedAt: "2026-07-01T00:00:00Z" }
];

const todayTask = {
  id: "task-1",
  title: "洗濯物をたたむ",
  description: null,
  recurrenceType: "daily",
  assignmentType: "anyone",
  assignment: { type: "anyone", user: null },
  assignedUserId: null,
  scheduledTime: "08:00",
  notificationSlot: "none",
  weekdays: [],
  weeklyTargetCount: null,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  status: "pending",
  actedBy: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  note: null
};

const weeklyTask = {
  ...todayTask,
  id: "task-2",
  title: "トイレ掃除",
  recurrenceType: "weekly",
  scheduledTime: null,
  weeklyTargetCount: 2,
  targetCount: 2,
  completedCount: 1,
  remainingCount: 1,
  latestAction: null
};

const dashboard = {
  date: "2026-07-31",
  household: { id: "household-1", name: "わが家" },
  summary: { total: 1, pending: 1, inProgress: 0, completed: 0, skipped: 0 },
  todayTasks: [todayTask],
  weeklyTasks: [weeklyTask],
  members
};

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ ok: true, data, requestId: "req-1" }), {
    status,
    headers: { "content-type": "application/json" }
  });

const failure = (code: string, status: number) =>
  new Response(
    JSON.stringify({ ok: false, error: { code, message: "error" }, requestId: "req-1" }),
    { status, headers: { "content-type": "application/json" } }
  );

const mockAuthedFetch = () =>
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
    if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
    if (url.endsWith("/api/dashboard/today")) return Promise.resolve(ok(dashboard));
    if (url.endsWith("/api/tasks?includeInactive=true")) {
      return Promise.resolve(ok({ tasks: [todayTask, weeklyTask] }));
    }
    return Promise.resolve(failure("NOT_FOUND", 404));
  });

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows login when the current session is unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(failure("UNAUTHENTICATED", 401));

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("ログイン状態を確認しています");
    expect(await screen.findByRole("heading", { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  }, 15000);

  it("renders dashboard task data for an authenticated household member", async () => {
    mockAuthedFetch();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "ホーム" })).toBeInTheDocument();
    expect(screen.getByText("今日の未完了")).toBeInTheDocument();
    expect(await screen.findByText("1件")).toBeInTheDocument();
    expect(screen.getAllByText("洗濯物をたたむ").length).toBeGreaterThan(0);
    expect(screen.getByText("トイレ掃除")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主要画面" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/home"));
  }, 15000);

  it("opens the task list from bottom navigation", async () => {
    mockAuthedFetch();

    render(<App />);

    await screen.findByRole("heading", { name: "ホーム" });
    fireEvent.click(screen.getByRole("button", { name: "タスク" }));

    expect(await screen.findByRole("heading", { name: "タスク" })).toBeInTheDocument();
    expect(screen.getByText("毎日のタスク")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "＋ タスクを追加" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tasks");
  }, 15000);
});
