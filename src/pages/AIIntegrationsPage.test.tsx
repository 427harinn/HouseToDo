import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIIntegrationsPage } from "./AIIntegrationsPage";
import { HOUSETODO_MCP_URL } from "../ai/providers";

const ok = (data: unknown, status = 200) => new Response(JSON.stringify({
  ok: true, data, requestId: "req-1"
}), { status, headers: { "content-type": "application/json" } });

const failure = (status = 500) => new Response(JSON.stringify({
  ok: false, error: { code: "INTERNAL_ERROR", message: "error" }, requestId: "req-1"
}), { status, headers: { "content-type": "application/json" } });

const museGrant = {
  grantId: "grant-muse",
  clientId: "housetodo-muse-production",
  clientName: "Muse",
  scopes: ["tasks:read", "tasks:write", "shopping:read", "shopping:write"],
  connectedAt: "2026-10-20T00:00:00.000Z"
};

afterEach(() => vi.restoreAllMocks());

describe("AI integrations settings", () => {
  it("shows provider guides and copies the MCP URL from a plain settings sheet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ integrations: [] }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(<AIIntegrationsPage onNavigate={vi.fn()} />);

    expect(await screen.findByText("接続中のAIはありません")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /その他のAI/ }));
    expect(screen.getByText("MCPサーバー")).toBeInTheDocument();
    expect(screen.getByText("https://house-to-do.427harinn.workers.dev/mcp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("コピーしました"));
    expect(writeText).toHaveBeenCalledWith("https://house-to-do.427harinn.workers.dev/mcp");

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: /ChatGPT/ }));
    expect(screen.getByRole("link", { name: "ChatGPTの設定方法を見る" })).toHaveAttribute("href", expect.stringContaining("help.openai.com"));
  });

  it("copies a Muse-ready connection request containing the configured MCP URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ integrations: [] }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<AIIntegrationsPage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Muse/ }));
    expect(screen.getByText("下の内容をコピーしてMuseに送ると、HouseToDoとの接続を始められます。")).toBeInTheDocument();
    expect(screen.getByText("Museで接続を進めると、HouseToDoへのログインとアクセス許可を求められる場合があります。")).toBeInTheDocument();
    expect(screen.getByText(HOUSETODO_MCP_URL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Museに送る内容をコピー" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "コピー" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Museに送る内容をコピー" }));
    const message = `HouseToDoをMuseから使えるように接続したいです。\n\n以下のMCPサーバーに接続してください。\n\n${HOUSETODO_MCP_URL}\n\n接続にHouseToDoへのログインや認証が必要な場合は、その手順を案内してください。`;
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("コピーしました。Museを開いて貼り付けてください。"));
    expect(writeText).toHaveBeenCalledWith(message);
  });

  it("shows Japanese scopes and removes a grant immediately after confirmed revoke", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/integrations") && init?.method !== "DELETE")
        return Promise.resolve(ok({ integrations: [museGrant] }));
      if (url.endsWith("/api/integrations/grant-muse") && init?.method === "DELETE")
        return Promise.resolve(ok({ revoked: true }));
      return Promise.resolve(failure(404));
    });
    render(<AIIntegrationsPage onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Muse/ }));
    expect(screen.getByText("家事を見る")).toBeInTheDocument();
    expect(screen.getByText("家事を追加・変更する")).toBeInTheDocument();
    expect(screen.getByText("買い物を見る")).toBeInTheDocument();
    expect(screen.getByText("買い物を追加・変更する")).toBeInTheDocument();
    expect(screen.queryByText("tasks:read")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "接続を解除" }));
    expect(screen.getByText("Museとの接続を解除します。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "接続を解除" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("接続を解除しました"));
    expect(document.querySelector(".ai-integration-row")).toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/integrations/grant-muse"), expect.objectContaining({ method: "DELETE" }));
  });

  it("exposes loading and retryable error states", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    let requestCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      requestCount += 1;
      if (requestCount === 1) return new Promise((resolve) => { finishRequest = resolve; });
      return Promise.resolve(ok({ integrations: [] }));
    });
    render(<AIIntegrationsPage onNavigate={vi.fn()} />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
    finishRequest?.(failure());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByText("接続中のAIはありません")).toBeInTheDocument();
  });
});
