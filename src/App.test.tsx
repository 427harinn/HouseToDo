import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

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
  purchasedAt: "2026-08-24T01:32:00Z"
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
  imageUsageData: typeof imageUsage | null = imageUsage
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
    if (url.endsWith("/api/dashboard/today")) {
      return Promise.resolve(ok({
        date: "2026-08-01",
        household: { id: household.id, name: household.name },
        summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 },
        todayTasks: [],
        weeklyTasks: [],
        shopping: { pendingCount: 1, previewItems: [{ id: "shop-1", name: "牛乳", quantity: "1本" }] },
        members
      }));
    }
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
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(container.querySelector("#m2-task-time")).toBeInTheDocument());
    fireEvent.change(container.querySelector("#m2-task-title")!, { target: { value: "Daily task" } });
    fireEvent.change(container.querySelector("#m2-task-time")!, { target: { value: "09:00" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(capturedPayload).not.toBeNull());
    expect(capturedPayload).toMatchObject({
      recurrenceType: "daily",
      modelRecurrenceType: "daily",
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
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
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
    expect(screen.getByText("2026/8/24 10:32")).toBeInTheDocument();
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
});

describe("M2 Home", () => {
  const task = {
    id: "home-task-1",
    title: "ゴミ出し",
    recurrenceType: "daily",
    modelRecurrenceType: "daily",
    assignmentType: "specific",
    assignedUserId: "user-2",
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
      if (url.endsWith("/api/dashboard/today")) return Promise.resolve(ok(dashboard));
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

  it("completes by tapping the row and keeps history collapsed by default", async () => {
    let completeCalls = 0;
    let completed = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.endsWith("/api/dashboard/today")) {
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
    const row = await screen.findByRole("button", { name: "ゴミ出しを完了" });
    fireEvent.click(row);
    await waitFor(() => expect(completeCalls).toBe(1), { timeout: 1000 });
    await waitFor(() => expect(screen.getByText("完了済み 1")).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByRole("button", { name: "ゴミ出しを完了" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完了済み 1/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /完了済み 1/ }));
    expect(screen.getByText("ゴミ出し")).toBeInTheDocument();
  }, 10000);

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
      if (url.endsWith("/api/dashboard/today")) return Promise.resolve(ok(dashboard));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/home");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /完了済み 1/ }));
    expect(screen.getByRole("button", { name: "戻す" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集" })).not.toBeInTheDocument();
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
      if (url.endsWith("/api/dashboard/today")) return Promise.resolve(ok(dashboard));
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
});
