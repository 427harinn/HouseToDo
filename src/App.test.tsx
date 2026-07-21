import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { APP_NAME } from "./constants";

const user = {
  id: "user-1",
  email: "a@example.com",
  displayName: "あかり"
};

const household = {
  id: "household-1",
  name: "わが家",
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  role: "owner"
};

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ ok: true, data, requestId: "req-1" }), {
    status,
    headers: { "content-type": "application/json" }
  });

const failure = (code: string, status: number) =>
  new Response(
    JSON.stringify({
      ok: false,
      error: { code, message: "error" },
      requestId: "req-1"
    }),
    {
      status,
      headers: { "content-type": "application/json" }
    }
  );

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

    expect(screen.getByRole("status")).toHaveTextContent(
      "ログイン状態を確認しています"
    );
    expect(await screen.findByRole("heading", { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  }, 15000);

  it("routes an authenticated household member to home", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith("/api/auth/me")) return Promise.resolve(ok({ user }));
      if (url.endsWith("/api/households/current")) {
        return Promise.resolve(ok({ household }));
      }
      return Promise.resolve(failure("NOT_FOUND", 404));
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "ホーム" })).toBeInTheDocument();
    expect(screen.getByText("わが家 / あかりさん")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主要画面" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/home"));
  }, 15000);
});
