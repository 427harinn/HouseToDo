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
  purchasedAt: "2026-08-01T01:32:00Z"
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
    if (url.endsWith("/api/shopping/items")) return Promise.resolve(ok({ pending: [shoppingItem], purchased: [purchasedItem] }));
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

    await waitFor(() => expect(container.querySelector("#task-time")).toHaveValue("09:00"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }, 15000);

  it("sends the daily scheduled time from the time input", async () => {
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
    await waitFor(() => expect(container.querySelector("#task-time")).toBeInTheDocument());
    fireEvent.change(container.querySelector("#task-title")!, { target: { value: "Daily task" } });
    fireEvent.input(container.querySelector("#task-time")!, { target: { value: "09:00" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(capturedPayload).not.toBeNull());
    expect(capturedPayload).toMatchObject({
      recurrenceType: "daily",
      scheduledTime: "09:00"
    });
  }, 15000);

  it("sends edited and cleared scheduled times", async () => {
    const task = {
      id: "task-1",
      title: "Daily task",
      description: null,
      recurrenceType: "daily",
      assignmentType: "anyone",
      assignedUserId: null,
      assignment: { type: "anyone", user: null },
      scheduledTime: "09:00",
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
        return Promise.resolve(ok({ task: { ...task, scheduledTime: patchPayloads.at(-1)?.scheduledTime ?? null } }));
      }
      if (url.endsWith("/api/tasks/task-1")) return Promise.resolve(ok({ task }));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/tasks/task-1/edit");

    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector("#task-time")).toHaveValue("09:00"));
    fireEvent.input(container.querySelector("#task-time")!, { target: { value: "10:30" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(patchPayloads).toHaveLength(1));
    expect(patchPayloads[0].scheduledTime).toBe("10:30");

    act(() => {
      window.history.pushState({}, "", "/tasks/task-1/edit");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(container.querySelector("#task-time")).toHaveValue("09:00"));
    fireEvent.input(container.querySelector("#task-time")!, { target: { value: "" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(patchPayloads).toHaveLength(2));
    expect(patchPayloads[1].scheduledTime).toBeNull();
  }, 15000);
});

describe("App members UI", () => {
  it("ignores the StrictMode abort from the first members load", async () => {
    let memberLoads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) {
        memberLoads += 1;
        return memberLoads === 1
          ? Promise.reject(new DOMException("The operation was aborted.", "AbortError"))
          : Promise.resolve(ok({ members: members.slice(0, 1) }));
      }
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/settings/members");

    render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    expect(await screen.findByText(members[0].displayName)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }, 15000);

  it("shows the existing error for a members API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(failure("INTERNAL_ERROR", 500));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  }, 15000);

  it("renders the owner member screen successfully", async () => {
    mockFetch();
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);

    expect(await screen.findByText(members[0].displayName)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "招待コードを発行" })).toBeInTheDocument();
  }, 15000);

  it("runs the staging diagnostic only after a click and shows transport success", async () => {
    let resolveProbe!: (response: Response) => void;
    const probeResponse = new Promise<Response>((resolve) => {
      resolveProbe = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.includes("/api/notifications/network-probe?mode=post-authorization-fixed-host")) return probeResponse;
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);

    await screen.findByText(members[0].displayName);
    const diagnosticButton = screen.getByRole("button", { name: "診断用 Apple通信診断" });
    const requestsBeforeClick = fetchMock.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    );
    expect(requestsBeforeClick.some((url) => url.includes("network-probe"))).toBe(false);
    fireEvent.click(diagnosticButton);
    expect(diagnosticButton).toBeDisabled();

    resolveProbe(ok({ ok: true, mode: "post-authorization-fixed-host", status: 403 }));
    expect(await screen.findByText(/transport success/)).toBeInTheDocument();
    const probeCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url.includes("network-probe");
    });
    expect(probeCalls).toHaveLength(1);
    const probeInit = probeCalls[0]?.[1];
    expect(probeInit).toMatchObject({ credentials: "include" });
    expect(new Headers(probeInit?.headers).has("Authorization")).toBe(false);
  }, 15000);

  it("shows only safe diagnostics when the staging probe fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) return Promise.resolve(ok(imageUsage));
      if (url.includes("/api/notifications/network-probe?mode=post-authorization-fixed-host")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: false,
          error: {
            code: "WEB_PUSH_NETWORK_PROBE_FAILED",
            message: "Apple Push network probe failed.",
            details: {
              stage: "network",
              errorCategory: "network_failed",
              requestPhase: "fetch_call",
              errorName: "TypeError",
              causeCode: "null",
              pushService: "apple",
              upstreamStatus: "null"
            }
          },
          requestId: "req-1"
        }), { status: 502, headers: { "content-type": "application/json" }}));
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);
    await screen.findByText(members[0].displayName);
    fireEvent.click(screen.getByRole("button", { name: "診断用 Apple通信診断" }));

    expect(await screen.findByText(/network_failed/)).toBeInTheDocument();
    expect(screen.getByText(/TypeError/)).toBeInTheDocument();
    expect(screen.queryByText(/Bearer|Authorization|endpoint|VAPID|JWT|Cookie|session/i)).not.toBeInTheDocument();
  }, 15000);

  it("does not show the invite action for a member", async () => {
    const memberHousehold = { ...household, role: "member" };
    mockFetch(memberHousehold);
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);

    expect(await screen.findByText(members[0].displayName)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "招待コードを発行" })).not.toBeInTheDocument();
  }, 15000);
});

describe("App image usage UI", () => {
  it("shows usage metrics and cleanup information", async () => {
    mockFetch(household, {
      ...imageUsage,
      reservedCount: 1,
      reservedBytes: 1024,
      pendingCleanupBytes: 2.3 * 1024 * 1024,
      pendingCleanupUnknownCount: 1,
      storedBytes: 75 * 1024 * 1024,
      storedBytesKnown: false
    });
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);

    expect(await screen.findByText("画像ストレージ")).toBeInTheDocument();
    expect(await screen.findByText("3 / 50 枚")).toBeInTheDocument();
    expect(await screen.findByText("12.4 MB / 50 MB")).toBeInTheDocument();
    expect(await screen.findByText("確認中 / 75 MB")).toBeInTheDocument();
    expect(await screen.findByText("4 / 20 回")).toBeInTheDocument();
    expect(await screen.findByText("アップロード処理中: 1件")).toBeInTheDocument();
    expect(await screen.findByText("削除処理待ち: 2.3 MB")).toBeInTheDocument();
    expect(await screen.findByText("削除処理待ちの画像があるため、保存容量を正確に確認できません。")).toBeInTheDocument();
    expect(screen.queryByText("保存容量の上限に達しています。")).not.toBeInTheDocument();
  }, 15000);

  it("shows warnings at 80 percent and at the limit", async () => {
    mockFetch(household, {
      ...imageUsage,
      activeCount: 50,
      activeBytes: 40 * 1024 * 1024,
      storedBytes: 60 * 1024 * 1024,
      dailyUploadCount: 16
    });
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);

    expect(await screen.findByText("画像数の上限に達しています。")).toBeInTheDocument();
    expect(screen.getByText("使用容量の使用量が上限に近づいています。")).toBeInTheDocument();
    expect(screen.getByText("保存容量の使用量が上限に近づいています。")).toBeInTheDocument();
    expect(screen.getByText("本日のアップロードの使用量が上限に近づいています。")).toBeInTheDocument();
  }, 15000);

  it("shows an error and retries image usage loading", async () => {
    let attempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household }));
      if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
      if (url.endsWith("/api/households/current/image-usage")) {
        attempts += 1;
        return Promise.resolve(attempts === 1 ? failure("INTERNAL_ERROR", 500) : ok(imageUsage));
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });
    window.history.replaceState({}, "", "/settings/members");

    render(<App />);

    expect(await screen.findByText("画像使用量を取得できませんでした。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("3 / 50 枚")).toBeInTheDocument();
  }, 15000);
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

  it("redirects household-less shopping access to onboarding", async () => {
    mockFetch(null);
    window.history.replaceState({}, "", "/shopping");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/onboarding"));
  }, 15000);

  it("renders shopping items, templates, count, purchaser, and collapse", async () => {
    mockFetch();
    window.history.replaceState({}, "", "/shopping");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "買い物リスト" })).toBeInTheDocument();
    expect(await screen.findByText("牛乳")).toBeInTheDocument();
    expect(screen.getByText(/あと1つ/)).toBeInTheDocument();
    expect(screen.getAllByText("1本 / 低脂肪ではないもの").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "キッチンペーパーを買い物リストへ追加" })).toBeInTheDocument();
    expect(screen.getByText(/たくやさんが購入/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /購入済み 1件/ }));
    expect(screen.queryByText(/たくやさんが購入/)).not.toBeInTheDocument();
  }, 15000);
});
