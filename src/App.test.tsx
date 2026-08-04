import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const mockFetch = (householdData: typeof household | null = household) =>
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
    if (url.endsWith("/api/households/current")) return Promise.resolve(ok({ household: householdData }));
    if (url.endsWith("/api/households/current/members")) return Promise.resolve(ok({ members }));
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
