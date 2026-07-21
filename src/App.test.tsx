import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { APP_NAME } from "./constants";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the placeholder home screen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" }
      })
    );

    render(<App />);

    expect(screen.getByRole("heading", { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主要画面" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Worker APIを確認中");
    expect(await screen.findByText("Worker API 接続OK")).toBeInTheDocument();
  });
});
