import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { HomeToday } from "./api/home";
import type { TodayTask } from "./api/tasks";
import { clearMemoryHomeSnapshots, writeMemoryHomeSnapshot } from "./cache/home-snapshot";
import { processShoppingImage } from "./lib/image-processing";

vi.mock("./lib/image-processing", () => ({
  AVATAR_CROP_VIEWPORT: 320,
  createCropSource: vi.fn((file: File) => Promise.resolve({
    file,
    url: "blob:crop-source",
    width: 640,
    height: 640
  })),
  processCroppedAvatar: vi.fn(() => Promise.resolve({
    blob: new Blob(["avatar"], { type: "image/jpeg" }),
    width: 320,
    height: 320,
    contentType: "image/jpeg",
    size: 6
  })),
  processShoppingImage: vi.fn()
}));

const user = {
  id: "user-1",
  email: "a@example.com",
  displayName: "さや"
};

const household = {
  id: "household-1",
  name: "わが家",
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  role: "owner"
};

const members = [
  { userId: "user-1", displayName: "さや", role: "owner", color: "#d9f2eb", joinedAt: "2026-07-01T00:00:00Z" },
  { userId: "user-2", displayName: "たくや", role: "member", color: "#e4eef8", joinedAt: "2026-07-01T00:00:00Z" }
];

const imageUsage = {
  activeCount: 3,
  activeCountLimit: 50,
  activeBytes: 12.4 * 1024 * 1024,
  activeBytesLimit: 50 * 1024 * 1024,
  reservedCount: 0,
  reservedBytes: 0,
  pendingCleanupBytes: 0,
  pendingCleanupUnknownCount: 0,
  storedBytes: 15.2 * 1024 * 1024,
  storedBytesKnown: true,
  storedBytesLimit: 75 * 1024 * 1024,
  dailyUploadDate: "2026-08-09",
  dailyUploadCount: 4,
  dailyUploadLimit: 20
};

const shoppingItem = {
  id: "shop-1",
  name: "牛乳",
  quantity: "1本",
  note: "低脂肪ではないもの",
  status: "pending",
  addedBy: "user-1",
  purchasedBy: null,
  purchasedAt: null,
  sortOrder: 1,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
};

const purchasedItem = {
  ...shoppingItem,
  id: "shop-2",
  name: "卵",
  status: "purchased",
  purchasedBy: { userId: "user-2", displayName: "たくや" },
  purchasedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
};

const template = {
  id: "template-1",
  name: "キッチンペーパー",
  quantity: "1個",
  note: null,
  active: true,
  sortOrder: 1,
  createdBy: "user-1",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z"
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

const mockFetch = (
  householdData: typeof household | null = household,
  imageUsageData: typeof imageUsage | null = imageUsage,
  historyData: unknown = { records: [], nextCursor: null }
) =>
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
    if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household: householdData }));
    if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
    if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(imageUsageData ? ok(imageUsageData) : failure("INTERNAL_ERROR", 500));
    if (url.endsWith("/api/shopping/items/shop-2")) return Promise.resolve(ok({ item: purchasedItem }));
    if (url.endsWith("/api/shopping/items")) return Promise.resolve(ok({ pending: [shoppingItem], purchased: [purchasedItem] }));
    if (url.startsWith("/api/shopping/recent")) return Promise.resolve(ok({ items: [{ name: "牛乳", quantity: "2本", note: "低脂肪ではないもの", createdAt: "2026-08-02T00:00:00Z" }] }));
    if (url.endsWith("/api/shopping/templates")) return Promise.resolve(ok({ templates: [template] }));
    if (url.endsWith("/api/home/today")) {
      return Promise.resolve(ok({
        date: "2026-08-01",
        homeTasks: [],
        completedRecords: [],
        passedRecords: [],
        shopping: { pendingCount: 1 },
        members
      }));
    }
    if (url.startsWith("/api/history/tasks")) return Promise.resolve(ok(historyData));
    return Promise.resolve(failure("NOT_FOUND", 404));
  });

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("App task form payload", () => {
  it("ignores the StrictMode abort from the first edit load", async () => {
    const task = {
      id: "task-1",
      title: "Daily task",
      description: null,
      recurrenceType: "daily",
      assignmentType: "anyone",
      assignedUserId: null,
      assignment: { type: "anyone", user: null },
      scheduledTime: "09:00",
      modelRecurrenceType: "daily",
      startDate: "2026-08-01",
      deadlineTime: "09:00",
      notificationOffsetMinutes: 0,
      notificationSlot: "none",
      weekdays: [],
      weeklyTargetCount: null,
      active: true,
      sortOrder: 1,
      createdBy: user.id,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z"
    };
    let taskLoads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/tasks/task-1")) {
        taskLoads += 1;
        return taskLoads === 1
          ? Promise.reject(new DOMException("The operation was aborted.", "AbortError"))
          : Promise.resolve(ok({ task }));
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/tasks/task-1/edit");

    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    await waitFor(() => expect(container.querySelector("#m2-task-time")).toHaveValue("09:00"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }, 15000);

  it("sends the canonical daily deadline from the time input", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00+09:00"), toFake: ["Date"] });
    let capturedPayload: Record<string, unknown> | null = null;
    const task = {
      id: "task-1",
      title: "Daily task",
      description: null,
      recurrenceType: "daily",
      assignmentType: "anyone",
      assignedUserId: null,
      assignment: { type: "anyone", user: null },
      scheduledTime: "09:00",
      modelRecurrenceType: "daily",
      startDate: "2026-08-01",
      deadlineTime: "09:00",
      notificationOffsetMinutes: 0,
      notificationSlot: "none",
      weekdays: [],
      weeklyTargetCount: null,
      active: true,
      sortOrder: 1,
      createdBy: user.id,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z"
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/tasks") && init?.method === "POST") {
        capturedPayload = JSON.parse(init.body as string) as Record<string, unknown>;
        return Promise.resolve(ok({ task }, 201));
      }
      if (url.endsWith("/api/tasks/task-1")) return Promise.resolve(ok({ task }));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/tasks/new");

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByLabelText("終日")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("終日"));
    await waitFor(() => expect(container.querySelector("#m2-task-time")).toBeInTheDocument());
    fireEvent.change(container.querySelector("#m2-task-title")!, { target: { value: "Daily task" } });
    fireEvent.change(container.querySelector("#m2-task-time")!, { target: { value: "09:00" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(capturedPayload).not.toBeNull());
    expect(capturedPayload).toMatchObject({
      recurrenceType: "once",
      modelRecurrenceType: "once",
      startDate: "2026-09-01",
      targetDate: "2026-09-01",
      scheduledTime: null,
      deadlineTime: "09:00"
    });
  }, 15000);

  it("sends edited and cleared canonical deadline times", async () => {
    const task = {
      id: "task-1",
      title: "Daily task",
      description: null,
      recurrenceType: "daily",
      assignmentType: "anyone",
      assignedUserId: null,
      assignment: { type: "anyone", user: null },
      scheduledTime: "09:00",
      modelRecurrenceType: "daily",
      startDate: "2026-08-01",
      deadlineTime: "09:00",
      notificationOffsetMinutes: 0,
      notificationSlot: "none",
      weekdays: [],
      weeklyTargetCount: null,
      active: true,
      sortOrder: 1,
      createdBy: user.id,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z"
    };
    const patchPayloads: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/tasks/task-1") && init?.method === "PATCH") {
        patchPayloads.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return Promise.resolve(ok({ task: { ...task, deadlineTime: patchPayloads.at(-1)?.deadlineTime ?? null } }));
      }
      if (url.endsWith("/api/tasks/task-1")) return Promise.resolve(ok({ task }));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/tasks/task-1/edit");

    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector("#m2-task-time")).toHaveValue("09:00"));
    fireEvent.change(container.querySelector("#m2-task-time")!, { target: { value: "10:30" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(patchPayloads).toHaveLength(1));
    expect(patchPayloads[0].deadlineTime).toBe("10:30");

    act(() => {
      window.history.pushState({}, "", "/tasks/task-1/edit");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(container.querySelector("#m2-task-time")).toHaveValue("09:00"));
    fireEvent.change(container.querySelector("#m2-task-time")!, { target: { value: "" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(patchPayloads).toHaveLength(2));
    expect(patchPayloads[1]).toMatchObject({ deadlineTime: null, notificationOffsetMinutes: null });
  }, 15000);

  it("sends a notification preset from create and clears it with the deadline from edit", async () => {
    let capturedCreate: Record<string, unknown> | null = null;
    const task = {
      id: "task-1",
      title: "Daily task",
      description: null,
      recurrenceType: "daily",
      assignmentType: "anyone",
      assignedUserId: null,
      scheduledTime: null,
      notificationSlot: "none",
      notificationTime: "07:30",
      modelRecurrenceType: "daily",
      startDate: "2026-08-01",
      deadlineTime: "07:30",
      notificationOffsetMinutes: 30,
      weekdays: [],
      weeklyTargetCount: null,
      active: true,
      sortOrder: 1,
      createdBy: user.id,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z"
    };
    const patchPayloads: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/tasks") && init?.method === "POST") {
        capturedCreate = JSON.parse(init.body as string) as Record<string, unknown>;
        return Promise.resolve(ok({ task }, 201));
      }
      if (url.endsWith("/api/tasks/task-1") && init?.method === "PATCH") {
        patchPayloads.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return Promise.resolve(ok({ task: { ...task, deadlineTime: patchPayloads.at(-1)?.deadlineTime ?? null, notificationOffsetMinutes: patchPayloads.at(-1)?.notificationOffsetMinutes ?? null } }));
      }
      if (url.endsWith("/api/tasks/task-1")) return Promise.resolve(ok({ task }));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });

    window.history.replaceState({}, "", "/tasks/new");
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByLabelText("終日")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("終日"));
    await waitFor(() => expect(container.querySelector("#m2-task-time")).toBeInTheDocument());
    fireEvent.change(container.querySelector("#m2-task-title")!, { target: { value: "Daily task" } });
    fireEvent.change(container.querySelector("#m2-task-time")!, { target: { value: "07:30" } });
    fireEvent.change(container.querySelector("#m2-task-notification")!, { target: { value: "30" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(capturedCreate).not.toBeNull());
    expect(capturedCreate).toMatchObject({ deadlineTime: "07:30", notificationOffsetMinutes: 30, notificationTime: null });

    act(() => {
      window.history.pushState({}, "", "/tasks/task-1/edit");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(container.querySelector("#m2-task-time")).toHaveValue("07:30"));
    fireEvent.change(container.querySelector("#m2-task-time")!, { target: { value: "" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(patchPayloads).toHaveLength(1));
    expect(patchPayloads[0]).toMatchObject({ deadlineTime: null, notificationOffsetMinutes: null });
  }, 15000);

  it("renders one canonical start date and only shows time when all-day is off", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00+09:00"), toFake: ["Date"] });
    mockFetch();
    window.history.replaceState({}, "", "/tasks/new");
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "終日" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "繰り返し: 今回だけ" })).toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>("#m2-task-start-date")).toHaveValue("2026-09-01");
    expect(container.querySelectorAll("input[type=\"date\"]")).toHaveLength(1);
    expect(container.querySelector("#m2-task-start-date")).toBeInTheDocument();
    expect(container.querySelector("#m2-task-date")).not.toBeInTheDocument();
    expect(container.querySelector("#m2-task-time")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "終日" }));
    await waitFor(() => expect(container.querySelector("#m2-task-time")).toBeInTheDocument());
    expect(container.querySelectorAll("input[type=\"date\"]")).toHaveLength(1);
    expect(container.querySelector("#m2-task-date")).not.toBeInTheDocument();
  });

  it("places the date certainty toggle before the fixed date input", async () => {
    mockFetch();
    window.history.replaceState({}, "", "/tasks/new");
    const { container } = render(<App />);

    await waitFor(() => expect(screen.getByLabelText("日にちを決めない")).toBeInTheDocument());
    const toggle = screen.getByLabelText("日にちを決めない");
    const date = container.querySelector("#m2-task-start-date");
    expect(date).not.toBeNull();
    expect(toggle.compareDocumentPosition(date!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe("M5 Other / Settings routes", () => {
  it("uses /other as the selected Bottom Navigation route and hides it on detail screens", async () => {
    mockFetch();
    window.history.replaceState({}, "", "/other");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "その他" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "その他" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "メンバー" }));
    await waitFor(() => expect(window.location.pathname).toBe("/other/members"));
    expect(await screen.findByRole("heading", { name: "メンバー" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "主要画面" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    await waitFor(() => expect(window.location.pathname).toBe("/other"));
    expect(screen.getByRole("navigation", { name: "主要画面" })).toBeInTheDocument();
  });

  it("opens household completed history and renders timezone-aware grouped records", async () => {
    mockFetch(household, imageUsage, {
      records: [
        { id: "history-1", taskId: "task-1", title: "ゴミ出し", description: "玄関の横に置いてあります", completedAt: "2026-09-03T23:31:00.000Z", actualCompleter: { userId: "user-1", displayName: "さや", avatarUrl: null }, taskActive: true },
        { id: "history-2", taskId: "task-2", title: "お風呂掃除", description: null, completedAt: "2026-09-02T00:15:00.000Z", actualCompleter: { userId: "user-2", displayName: "たくや", avatarUrl: null }, taskActive: false }
      ],
      nextCursor: null
    });
    window.history.replaceState({}, "", "/other");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: "履歴" }));
    expect(await screen.findByRole("heading", { name: "履歴" })).toBeInTheDocument();
    expect(await screen.findByText("ゴミ出し")).toBeInTheDocument();
    expect(screen.getByText("お風呂掃除")).toBeInTheDocument();
    expect(screen.getByText("さや")).toBeInTheDocument();
    expect(screen.getByText("たくや")).toBeInTheDocument();
    expect(screen.getByText("8:31")).toBeInTheDocument();
    expect(screen.getByText("9:15")).toBeInTheDocument();
    expect(document.querySelectorAll(".calendar-history-row__check")).toHaveLength(2);
    expect(screen.getAllByRole("heading").filter((heading) => heading.textContent?.match(/月/))).toHaveLength(2);
    const firstHistoryTitle = screen.getByText("ゴミ出し");
    fireEvent.click(firstHistoryTitle);
    expect(screen.getByText("玄関の横に置いてあります")).toBeInTheDocument();
    expect(firstHistoryTitle.closest(".m5-history-row")?.querySelector("[aria-expanded='true']")).toBeInTheDocument();
    fireEvent.click(screen.getByText("お風呂掃除"));
    expect(screen.getByText("メモなし")).toBeInTheDocument();
    expect(screen.queryByText("玄関の横に置いてあります")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("お風呂掃除"));
    expect(screen.queryByText("メモなし")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    await waitFor(() => expect(window.location.pathname).toBe("/other"));
  });
});

describe("M7 legacy route redirects", () => {
  const cases = [
    ["/settings/members", "/other/members", ""],
    ["/tasks", "/home", ""],
    ["/tasks/task-1", "/tasks/task-1/edit", ""],
    ["/tasks/task-1/respond", "/home", ""],
    ["/tasks/templates", "/tasks/new", ""],
    ["/tasks/templates/template-1/edit", "/tasks/new", ""],
    ["/shopping/items/shop-2", "/shopping", "?item=shop-2"],
    ["/shopping/templates", "/shopping/new", ""],
    ["/shopping/templates/new", "/shopping/new", ""],
    ["/shopping/templates/template-1/edit", "/shopping/new", ""]
  ] as const;

  it.each(cases)("replaces %s with %s before rendering", (legacy, pathname, search) => {
    mockFetch();
    window.history.replaceState({}, "", legacy);

    render(<App />);

    expect(window.location.pathname).toBe(pathname);
    expect(window.location.search).toBe(search);
    expect(screen.queryByText("タスク詳細")).not.toBeInTheDocument();
    expect(screen.queryByText("タスクテンプレート")).not.toBeInTheDocument();
    expect(screen.queryByText("よく買うもの")).not.toBeInTheDocument();
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("App shopping UI", () => {
  it("redirects unauthenticated shopping access to login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(failure("UNAUTHENTICATED", 401));
    window.history.replaceState({}, "", "/shopping");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
  }, 15000);

  it("redirects household-less shopping access to household create", async () => {
    mockFetch(null);
    window.history.replaceState({}, "", "/shopping");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/household/create"));
  }, 15000);

  it("renders the canonical shopping list with a collapsed purchased section", async () => {
    mockFetch();
    window.history.replaceState({}, "", "/shopping");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "買い物" })).toBeInTheDocument();
    expect(await screen.findByText("牛乳")).toBeInTheDocument();
    expect(screen.getByText("1本")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /購入済み 1件/ })).toBeInTheDocument();
    expect(screen.queryByText("卵")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /購入済み 1件/ }));
    expect(screen.getByText("卵")).toBeInTheDocument();
    expect(screen.getByText(/\d{4}\/\d+\/\d+ \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByLabelText("購入者: たくや")).toBeInTheDocument();
  }, 15000);

  it("redirects the retired shopping detail route to the canonical list", async () => {
    mockFetch();
    window.history.replaceState({}, "", "/shopping/items/shop-2");

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/shopping");
      expect(window.location.search).toBe("?item=shop-2");
    });
    expect(await screen.findByRole("heading", { name: "買い物" })).toBeInTheDocument();
    expect(screen.queryByText("購入日時")).not.toBeInTheDocument();
  }, 15000);

  it("prefills shopping forms from recent items and templates without reusing image inputs", async () => {
    mockFetch();
    window.history.replaceState({}, "", "/shopping/new");

    const { container } = render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "以前の項目から選ぶ" }));
    expect(await screen.findByRole("heading", { name: "以前の項目から選ぶ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /牛乳/ }));
    expect(container.querySelector<HTMLInputElement>("#shopping-name")).toHaveValue("牛乳");
    expect(container.querySelector<HTMLInputElement>("#shopping-quantity")).toHaveValue("2本");
    expect(container.querySelector<HTMLTextAreaElement>("#shopping-note")).toHaveValue("低脂肪ではないもの");

    fireEvent.click(screen.getByRole("button", { name: "以前の項目から選ぶ" }));
    fireEvent.click(await screen.findByRole("button", { name: /キッチンペーパー/ }));
    expect(container.querySelector<HTMLInputElement>("#shopping-name")).toHaveValue("キッチンペーパー");
    expect(container.querySelector<HTMLInputElement>("#shopping-quantity")).toHaveValue("1個");
    expect(screen.queryByRole("button", { name: "写真を撮る" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "写真を選ぶ" })).toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>("#shopping-image-camera")).toBeNull();
    expect(container.querySelector<HTMLInputElement>("#shopping-image")).not.toHaveAttribute("capture");
    expect(container.querySelector<HTMLInputElement>("#shopping-image")).toHaveAttribute("accept", "image/*");
  }, 15000);
});

describe("M6 auth and household entry", () => {
  it.each(["/guest", "/onboarding"])("redirects unauthenticated %s to login", async (path) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(failure("UNAUTHENTICATED", 401));
    window.history.replaceState({}, "", path);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(screen.getByRole("heading", { name: "ログイン" })).toBeVisible();
    expect(screen.queryByText(/ゲスト|家庭をはじめましょう/)).not.toBeInTheDocument();
  });

  it("shows the generic login error on the password field without guest actions", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/api/auth/me")) return Promise.resolve(failure("UNAUTHENTICATED", 401));
      if (url.endsWith("/api/auth/login")) return Promise.resolve(failure("UNAUTHENTICATED", 401));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/login");

    render(<App />);

    await screen.findByRole("heading", { name: "ログイン" });
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "very-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("メールアドレスまたはパスワードが正しくありません");
    expect(screen.getByLabelText("パスワード")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "corrected-password" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toHaveAttribute("aria-invalid", "false");
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByText("ゲストで試す")).not.toBeInTheDocument();
    expect(calls.filter((call) => call.includes("/api/auth/login"))).toHaveLength(1);
  });

  it("validates an optional invite before registering", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/api/auth/me")) return Promise.resolve(failure("UNAUTHENTICATED", 401));
      if (url.endsWith("/api/households/invites/validate")) return Promise.resolve(ok({ valid: false }));
      if (url.endsWith("/api/auth/register")) return Promise.resolve(ok({ user }, 201));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/register");

    render(<App />);

    await screen.findByRole("heading", { name: "新規登録" });
    fireEvent.change(screen.getByLabelText("表示名"), { target: { value: "さや" } });
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "very-long-password" } });
    fireEvent.change(screen.getByLabelText("招待コード（任意）"), { target: { value: "INVALID" } });
    fireEvent.click(screen.getByRole("button", { name: "新規登録" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("招待コードを確認してください");
    expect(screen.getByLabelText("招待コード（任意）")).toHaveAttribute("aria-invalid", "true");
    expect(calls.filter((call) => call.includes("/api/auth/register"))).toHaveLength(0);
    expect(window.location.pathname).toBe("/register");

    fireEvent.change(screen.getByLabelText("招待コード（任意）"), { target: { value: "VALID" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("招待コード（任意）")).toHaveAttribute("aria-invalid", "false");
  });

  it("settles household creation and continues home when avatar upload fails", async () => {
    let createCalls = 0;
    let uploadCalls = 0;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:crop-preview" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/auth/me")) return Promise.resolve(failure("UNAUTHENTICATED", 401));
      if (url.endsWith("/api/auth/register")) return Promise.resolve(ok({ user }, 201));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household: null }));
      if (url.endsWith("/api/households") && method === "POST") {
        createCalls += 1;
        return Promise.resolve(ok({ household }, 201));
      }
      if (url.endsWith("/api/account/avatar") && method === "PUT") {
        uploadCalls += 1;
        return Promise.resolve(failure("VALIDATION_ERROR", 400));
      }
      if (url.endsWith("/api/home/today")) {
        return Promise.resolve(ok({
          date: "2026-08-01",
          homeTasks: [],
          completedRecords: [],
          passedRecords: [],
          shopping: { pendingCount: 0 },
          members
        }));
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/register");
    render(<App />);

    await screen.findByRole("heading", { name: "新規登録" });
    fireEvent.change(screen.getByLabelText("表示名"), { target: { value: "さや" } });
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "very-long-password" } });
    fireEvent.change(screen.getByLabelText("プロフィール画像を選択"), {
      target: { files: [new File(["source"], "avatar.jpg", { type: "image/jpeg" })] }
    });
    await screen.findByRole("dialog", { name: "写真を調整" });
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await screen.findByAltText("選択したプロフィール画像のプレビュー");

    fireEvent.click(screen.getByRole("button", { name: "新規登録" }));
    await screen.findByRole("heading", { name: "家庭を作る" });
    fireEvent.change(screen.getByLabelText("家庭名"), { target: { value: "わが家" } });
    fireEvent.click(screen.getByRole("button", { name: "家庭を作る" }));

    expect(await screen.findByRole("heading", { name: "やること" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
    expect(createCalls).toBe(1);
    expect(uploadCalls).toBe(1);
    expect(screen.getByText("プロフィール画像の保存に失敗しました。設定から再度登録できます。")).toBeInTheDocument();
    expect(screen.queryByText("家庭を作成できませんでした。")).not.toBeInTheDocument();
  }, 15000);

  it("settles invite join and continues home when avatar upload fails", async () => {
    let joinCalls = 0;
    let uploadCalls = 0;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:crop-preview" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/auth/me")) return Promise.resolve(failure("UNAUTHENTICATED", 401));
      if (url.endsWith("/api/households/invites/validate")) return Promise.resolve(ok({ valid: true }));
      if (url.endsWith("/api/auth/register")) return Promise.resolve(ok({ user }, 201));
      if (url.endsWith("/api/households/join") && method === "POST") {
        joinCalls += 1;
        return Promise.resolve(ok({ household }, 200));
      }
      if (url.endsWith("/api/account/avatar") && method === "PUT") {
        uploadCalls += 1;
        return Promise.resolve(failure("VALIDATION_ERROR", 400));
      }
      if (url.endsWith("/api/home/today")) {
        return Promise.resolve(ok({
          date: "2026-08-01",
          homeTasks: [],
          completedRecords: [],
          passedRecords: [],
          shopping: { pendingCount: 0 },
          members
        }));
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/register");
    render(<App />);

    await screen.findByRole("heading", { name: "新規登録" });
    fireEvent.change(screen.getByLabelText("表示名"), { target: { value: "さや" } });
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "very-long-password" } });
    fireEvent.change(screen.getByLabelText("招待コード（任意）"), { target: { value: "VALID" } });
    fireEvent.change(screen.getByLabelText("プロフィール画像を選択"), {
      target: { files: [new File(["source"], "avatar.jpg", { type: "image/jpeg" })] }
    });
    await screen.findByRole("dialog", { name: "写真を調整" });
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await screen.findByAltText("選択したプロフィール画像のプレビュー");

    fireEvent.click(screen.getByRole("button", { name: "新規登録" }));

    expect(await screen.findByRole("heading", { name: "やること" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/home");
    expect(joinCalls).toBe(1);
    expect(uploadCalls).toBe(1);
    expect(screen.getByText("プロフィール画像の保存に失敗しました。設定から再度登録できます。")).toBeInTheDocument();
    expect(screen.queryByText("招待コードが正しくありません。")).not.toBeInTheDocument();
  }, 15000);
});

describe("M2 Home", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-08-25T12:00:00+09:00"), toFake: ["Date"] });
    clearMemoryHomeSnapshots();
  });
  afterEach(() => {
    clearMemoryHomeSnapshots();
    vi.useRealTimers();
  });

  const task = {
    id: "home-task-1",
    title: "ゴミ出し",
    recurrenceType: "daily",
    modelRecurrenceType: "daily",
    assignmentType: "specific",
    assignedUserId: "user-2",
    description: "玄関前に出す",
    deadlineDate: "2026-08-25",
    deadlineTime: "09:00",
    scheduledTime: null,
    status: "pending",
    overdue: true,
    targetDate: "2026-08-25"
  };
  const baseDashboard = {
    date: "2026-08-25",
    household: { id: household.id, name: household.name, timezone: household.timezone },
    summary: { total: 1, pending: 1, inProgress: 0, completed: 0, skipped: 0 },
    todayTasks: [task],
    homeTasks: [task],
    weeklyTasks: [],
    completedRecords: [],
    passedRecords: [],
    shopping: { pendingCount: 2, previewItems: [] },
    members: [{ ...members[1], avatarUrl: null }]
  };

  it("renders the single urgency list, scope color, assignee avatar fallback, and shopping count", async () => {
    const dashboard = structuredClone(baseDashboard);
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "やること" })).toBeInTheDocument();
    expect(await screen.findByText("ゴミ出し")).toBeInTheDocument();
    expect(screen.getByText("09:00まで")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "担当: たくや" })).toHaveTextContent("た");
    expect(screen.getByText("買い物 2件")).toBeInTheDocument();
    expect(screen.getByText("ゴミ出し").closest("button")).toBeInTheDocument();
  });

  it("opens inline details without completing, then completes exactly once from the primary action", async () => {
    let completeCalls = 0;
    let completed = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) {
        return Promise.resolve(ok(completed ? {
          ...baseDashboard,
          todayTasks: [],
          homeTasks: [],
          summary: { total: 1, pending: 0, inProgress: 0, completed: 1, skipped: 0 },
          completedRecords: [{ id: "record-1", taskId: task.id, status: "completed", title: "ゴミ出し", taskActive: true, actualCompleter: { userId: user.id, displayName: user.displayName, avatarUrl: null }, assignedUser: null }]
        } : baseDashboard));
      }
      if (url.endsWith(`/api/tasks/${task.id}/complete`) && init?.method === "POST") {
        completeCalls += 1;
        completed = true;
        return Promise.resolve(ok({ task: { ...task, status: "completed" } }));
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);
    const row = await screen.findByRole("button", { name: "ゴミ出しの詳細" });
    fireEvent.click(row);
    expect(completeCalls).toBe(0);
    expect(screen.getByRole("button", { name: "完了" })).toBeInTheDocument();
    expect(screen.getByText("玄関前に出す")).toBeInTheDocument();
    const expanded = screen.getByRole("button", { name: "完了" }).parentElement!;
    expect(expanded.firstElementChild).toBe(screen.getByRole("button", { name: "完了" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(completeCalls).toBe(1), { timeout: 1000 });
    await waitFor(() => expect(screen.getByText("完了済み 1")).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByRole("button", { name: "ゴミ出しを完了" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完了済み 1/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /完了済み 1/ }));
    expect(screen.getByText("ゴミ出し")).toBeInTheDocument();
  }, 10000);

  it("keeps a no-memo task expandable without rendering an empty memo block", async () => {
    const noMemoTask = { ...task, id: "home-task-no-memo", title: "水やり", description: "   ", overdue: false };
    const dashboard = { ...baseDashboard, todayTasks: [noMemoTask], homeTasks: [noMemoTask] };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "水やりの詳細" }));
    expect(screen.getByRole("button", { name: "完了" })).toBeInTheDocument();
    expect(screen.queryByText("メモ")).not.toBeInTheDocument();
  });

  it("closes Home detail when completion starts even if the active row remains", async () => {
    let completeCalls = 0;
    let homeCalls = 0;
    let completed = false;
    let resolveComplete: ((response: Response) => void) | undefined;
    const completeResponse = new Promise<Response>((resolve) => { resolveComplete = resolve; });
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) {
        homeCalls += 1;
        return Promise.resolve(ok(completed ? {
          ...baseDashboard,
          homeTasks: [],
          completedRecords: [{ id: "record-1", taskId: task.id, status: "completed", title: "ゴミ出し", taskActive: true, actualCompleter: { userId: user.id, displayName: user.displayName, avatarUrl: null }, assignedUser: null }]
        } : baseDashboard));
      }
      if (url.endsWith(`/api/tasks/${task.id}/complete`) && init?.method === "POST") {
        completeCalls += 1;
        return completeResponse;
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);
    const row = await screen.findByRole("button", { name: "ゴミ出しの詳細" });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(completeCalls).toBe(1));
    expect(screen.queryByRole("button", { name: "完了" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ゴミ出しの詳細" })).toHaveAttribute("aria-expanded", "false");
    completed = true;
    resolveComplete?.(ok({ task: { ...task, status: "completed" } }));
    await waitFor(() => expect(homeCalls).toBe(2));
    expect(screen.queryByText("完了済み 1")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("完了済み 1")).toBeInTheDocument(), { timeout: 2000 });
  });

  it("expands only one Home task detail at a time", async () => {
    const secondTask = { ...task, id: "home-task-2", title: "床そうじ", description: "廊下" };
    const dashboard = { ...baseDashboard, todayTasks: [task, secondTask], homeTasks: [task, secondTask], summary: { ...baseDashboard.summary, total: 2, pending: 2 } };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    const { container } = render(<App />);
    await screen.findByRole("button", { name: "ゴミ出しの詳細" });
    const rows = container.querySelectorAll(".m2-home__task-list .m2-home__row");
    fireEvent.click(screen.getByRole("button", { name: "ゴミ出しの詳細" }));
    expect(rows[0]).toHaveClass("is-expanded");
    fireEvent.click(screen.getByRole("button", { name: "床そうじの詳細" }));
    expect(rows[0]).not.toHaveClass("is-expanded");
    expect(rows[1]).toHaveClass("is-expanded");
  });

  it("shows restore-only actions for inactive records", async () => {
    const dashboard = {
      ...baseDashboard,
      todayTasks: [],
      homeTasks: [],
      completedRecords: [{ id: "record-deleted", taskId: task.id, status: "completed", title: "ゴミ出し", taskActive: false, actualCompleter: { userId: user.id, displayName: user.displayName, avatarUrl: null }, assignedUser: null }]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /完了済み 1/ }));
    expect(screen.getByRole("button", { name: "戻す" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集" })).not.toBeInTheDocument();
  });

  it("reconciles pass and restore through the lean Home endpoint", async () => {
    let phase: "initial" | "passed" | "restored" = "initial";
    let skipCalls = 0;
    let restoreCalls = 0;
    const passedRecord = { id: "record-pass", taskId: task.id, status: "skipped", title: "ゴミ出し", taskActive: true, actualCompleter: { userId: user.id, displayName: user.displayName, avatarUrl: null }, assignedUser: null };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(phase === "initial" ? baseDashboard : phase === "passed" ? { ...baseDashboard, homeTasks: [], completedRecords: [], passedRecords: [passedRecord] } : baseDashboard));
      if (url.endsWith(`/api/tasks/${task.id}/skip`) && init?.method === "POST") { skipCalls += 1; phase = "passed"; return Promise.resolve(ok({ result: { ...task, status: "skipped" } })); }
      if (url.endsWith(`/api/tasks/${task.id}/restore`) && init?.method === "POST") { restoreCalls += 1; phase = "restored"; return Promise.resolve(ok({ result: { reset: true } })); }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);
    const row = await screen.findByRole("button", { name: "ゴミ出しの詳細" });
    fireEvent.click(row.parentElement?.parentElement?.querySelector<HTMLButtonElement>(".m2-home__more") ?? row);
    fireEvent.click(screen.getByRole("button", { name: "パス" }));
    await waitFor(() => expect(skipCalls).toBe(1), { timeout: 1000 });
    await waitFor(() => expect(screen.getByText("パス済み 1")).toBeInTheDocument(), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: /パス済み 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "操作" }));
    fireEvent.click(screen.getByRole("button", { name: "戻す" }));
    await waitFor(() => expect(restoreCalls).toBe(1), { timeout: 1000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "ゴミ出しの詳細" })).toBeInTheDocument(), { timeout: 2000 });
  }, 10000);

  it("keeps only one Home swipe row open at a time", async () => {
    const secondTask = { ...task, id: "home-task-2", title: "床そうじ", overdue: false };
    const dashboard = {
      ...baseDashboard,
      todayTasks: [task, secondTask],
      homeTasks: [task, secondTask],
      summary: { ...baseDashboard.summary, total: 2, pending: 2 },
      completedRecords: [{ id: "record-1", taskId: "history-task", status: "completed", title: "洗濯", taskActive: true, actualCompleter: { userId: user.id, displayName: user.displayName, avatarUrl: null }, assignedUser: null }]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    const { container } = render(<App />);
    await screen.findByRole("button", { name: "ゴミ出しの詳細" });
    const rows = () => Array.from(container.querySelectorAll<HTMLElement>(".m2-home__task-list .m2-home__row"));
    const openWithActionButton = (row: HTMLElement) => {
      fireEvent.click(row.querySelector<HTMLButtonElement>(".m2-home__more")!);
    };
    openWithActionButton(rows()[0]);
    await waitFor(() => expect(rows()[0]).toHaveClass("is-actions-open"));
    openWithActionButton(rows()[1]);
    await waitFor(() => expect(rows()[1]).toHaveClass("is-actions-open"));
    await waitFor(() => expect(rows()[0]).not.toHaveClass("is-actions-open"));
  });

  it("formats today, week, month, and dated time deadlines without merging date and time", async () => {
    const tasks = [
      { ...task, id: "today-time", title: "今日の時刻", deadlineDate: "2026-08-25", deadlineTime: "09:00", modelRecurrenceType: "daily", overdue: false },
      { ...task, id: "today-all-day", title: "今日中の家事", deadlineDate: "2026-08-25", deadlineTime: null, modelRecurrenceType: "daily", overdue: false },
      { ...task, id: "week-deadline", title: "週の期限", deadlineDate: "2026-08-30", deadlineTime: null, modelRecurrenceType: "weekly_flexible", overdue: false },
      { ...task, id: "month-deadline", title: "月の期限", deadlineDate: "2026-08-31", deadlineTime: null, modelRecurrenceType: "monthly_flexible", overdue: false },
      { ...task, id: "dated-time", title: "別日の時刻", deadlineDate: "2026-08-24", deadlineTime: "09:00", modelRecurrenceType: "once", targetDate: "2026-08-24", overdue: false },
      { ...task, id: "no-deadline", title: "締切なしの家事", deadlineDate: null, deadlineTime: null, modelRecurrenceType: "daily", overdue: false }
    ];
    const dashboard = { ...baseDashboard, todayTasks: tasks, homeTasks: tasks, summary: { ...baseDashboard.summary, total: tasks.length, pending: tasks.length } };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);
    expect(await screen.findByText("今日の時刻")).toBeInTheDocument();
    expect(screen.getByText("09:00まで")).toBeInTheDocument();
    expect(screen.getByText("今日中")).toBeInTheDocument();
    expect(screen.getByText("日曜まで")).toBeInTheDocument();
    expect(screen.getByText("8/31まで")).toBeInTheDocument();
    expect(screen.getByText("8/24 09:00まで")).toBeInTheDocument();
    expect(screen.getByText("締切なし")).toBeInTheDocument();
  });

  it("authoritatively selects and expands a task notification, then consumes the query", async () => {
    const deepLinkedTask = { ...task, id: "deep-link-task", title: "通知から開く家事", description: "すぐ完了できる" };
    const dashboard = { ...baseDashboard, todayTasks: [deepLinkedTask], homeTasks: [deepLinkedTask] };
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home?task=deep-link-task");
    render(<App />);

    expect(await screen.findByRole("button", { name: "完了" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通知から開く家事の詳細" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("すぐ完了できる")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/home"));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("does not deep-link a cached task that the authoritative Home response no longer contains", async () => {
    const staleTask: TodayTask = {
      ...task,
      id: "stale-deep-link",
      title: "古い通知の家事",
      recurrenceType: "daily",
      modelRecurrenceType: "daily",
      assignmentType: "specific",
      status: "pending",
      assignment: { type: "specific", user: { userId: "user-2" } },
      notificationSlot: "none",
      weekdays: [],
      weeklyTargetCount: null,
      active: true,
      sortOrder: 1,
      createdBy: user.id,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
      actedBy: null,
      startedAt: null,
      completedAt: null,
      skippedAt: null,
      note: null
    };
    const staleSnapshot: HomeToday = { date: "2026-08-25", homeTasks: [staleTask], completedRecords: [], passedRecords: [], shopping: { pendingCount: 2 }, members: [{ userId: user.id, displayName: user.displayName, role: "owner", color: "#d9f2eb", avatarUrl: null }] };
    writeMemoryHomeSnapshot({ userId: user.id, householdId: household.id, date: "2026-08-25" }, staleSnapshot);
    const authoritativeDashboard = { ...baseDashboard, homeTasks: [], todayTasks: [], summary: { ...baseDashboard.summary, total: 0, pending: 0 } };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(authoritativeDashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home?task=stale-deep-link");
    render(<App />);

    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/home"));
    expect(screen.queryByRole("button", { name: "完了" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "古い通知の家事の詳細" })).not.toBeInTheDocument();
  });

  it("keeps a manually closed deep-linked task closed and preserves the one-expanded invariant", async () => {
    const secondTask = { ...task, id: "deep-link-second", title: "別の家事", description: "別のメモ" };
    const dashboard = { ...baseDashboard, todayTasks: [task, secondTask], homeTasks: [task, secondTask], summary: { ...baseDashboard.summary, total: 2, pending: 2 } };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", `/home?task=${task.id}`);
    const { container } = render(<App />);
    const first = await screen.findByRole("button", { name: "ゴミ出しの詳細" });
    await waitFor(() => expect(first).toHaveAttribute("aria-expanded", "true"));
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "別の家事の詳細" }));
    const rows = container.querySelectorAll(".m2-home__task-list .m2-home__row");
    expect(rows[0]).not.toHaveClass("is-expanded");
    expect(rows[1]).toHaveClass("is-expanded");
  });

  it.each([
    ["completed", { ...baseDashboard, homeTasks: [], todayTasks: [], completedRecords: [{ id: "record-done", taskId: task.id, status: "completed", title: task.title, taskActive: true, actualCompleter: null, assignedUser: null }] }],
    ["missing", { ...baseDashboard, homeTasks: [], todayTasks: [], completedRecords: [] }]
  ])("falls back to normal Home when the deep-linked task is %s", async (_label, dashboard) => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/home/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", `/home?task=${task.id}`);
    render(<App />);
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/home"));
    expect(screen.queryByRole("button", { name: "完了" })).not.toBeInTheDocument();
  });
});

describe("Shopping image persistence", () => {
  it("keeps one persisted item while retrying a failed image upload", async () => {
    const item = { ...shoppingItem, id: "persisted-shop-1", name: "牛乳", image: null };
    vi.mocked(processShoppingImage).mockResolvedValue({
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      width: 80,
      height: 60,
      contentType: "image/jpeg",
      size: 4
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:test" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    let createCalls = 0;
    let updateCalls = 0;
    let uploadCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.startsWith("/api/shopping/recent")) return Promise.resolve(ok({ items: [] }));
      if (url.endsWith("/api/shopping/templates")) return Promise.resolve(ok({ templates: [] }));
      if (url.endsWith("/api/shopping/items") && method === "POST") { createCalls += 1; return Promise.resolve(ok({ item }, 201)); }
      if (url.endsWith(`/api/shopping/items/${item.id}`) && method === "PATCH") { updateCalls += 1; return Promise.resolve(ok({ item })); }
      if (url.endsWith(`/api/shopping/items/${item.id}/image`) && method === "PUT") { uploadCalls += 1; return Promise.resolve(failure("VALIDATION_ERROR", 400)); }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/shopping/new");
    render(<App />);

    await screen.findByRole("heading", { name: "買い物を追加" });
    fireEvent.change(screen.getByLabelText("商品名"), { target: { value: "牛乳" } });
    fireEvent.change(screen.getByLabelText("写真ファイルを選択"), { target: { files: [new File(["source"], "milk.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.getByAltText("牛乳写真のプレビュー")).toBeInTheDocument());

    const save = screen.getByRole("button", { name: "保存" });
    fireEvent.click(save);
    await waitFor(() => expect(uploadCalls).toBe(1));
    expect(createCalls).toBe(1);
    expect(screen.getByText("買い物は登録されましたが、画像の保存に失敗しました。画像を確認してもう一度保存してください。")).toBeInTheDocument();

    fireEvent.click(save);
    await waitFor(() => expect(uploadCalls).toBe(2));
    expect(createCalls).toBe(1);
    expect(updateCalls).toBe(1);

    fireEvent.click(save);
    await waitFor(() => expect(uploadCalls).toBe(3));
    expect(createCalls).toBe(1);
    expect(updateCalls).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "外す" }));
    fireEvent.click(save);
    await waitFor(() => expect(updateCalls).toBe(3));
    expect(createCalls).toBe(1);
    expect(uploadCalls).toBe(3);
  });
});
