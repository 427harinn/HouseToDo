import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getAIIntegrations, revokeAIIntegration, type AIIntegration } from "../api/integrations";
import { ApiError, apiMessage } from "../api/client";
import { BottomSheet } from "../components/BottomSheet";
import { SettingsHeader } from "../components/SettingsHeader";
import { AI_PROVIDERS, HOUSETODO_MCP_URL, isMuseClient, providerLabelForClient, type AIProviderKey } from "../ai/providers";

const scopeLabels: Record<string, string> = {
  "tasks:read": "家事を見る",
  "tasks:write": "家事を追加・変更する",
  "shopping:read": "買い物を見る",
  "shopping:write": "買い物を追加・変更する"
};

const errorMessage = (error: unknown) =>
  error instanceof ApiError ? apiMessage(error) : "接続情報を読み込めませんでした。";

const formatConnectedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }).format(date);
};

export function AIIntegrationsPage({ onNavigate }: { onNavigate: (route: string) => void }) {
  const [integrations, setIntegrations] = useState<AIIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState<AIProviderKey | null>(null);
  const [grant, setGrant] = useState<AIIntegration | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getAIIntegrations();
      setIntegrations(result.integrations);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadIntegrations(); }, [loadIntegrations]);

  const museGrant = integrations.find((item) => isMuseClient(item.clientId));
  const selectedProvider = AI_PROVIDERS.find((item) => item.key === provider);

  const openProvider = (key: AIProviderKey) => {
    setStatus("");
    setActionError("");
    if (key === "muse" && museGrant) {
      setGrant(museGrant);
      setConfirmingRevoke(false);
    } else {
      setProvider(key);
    }
  };

  const copyMcpUrl = async () => {
    setStatus("");
    setActionError("");
    try {
      await navigator.clipboard.writeText(HOUSETODO_MCP_URL);
      setStatus("コピーしました");
    } catch {
      setActionError("コピーできませんでした。");
    }
  };

  const copyMuseConnectionGuide = async () => {
    setStatus("");
    setActionError("");
    const message = `HouseToDoをMuseから使えるように接続したいです。\n\n以下のMCPサーバーに接続してください。\n\n${HOUSETODO_MCP_URL}\n\n接続にHouseToDoへのログインや認証が必要な場合は、その手順を案内してください。`;
    try {
      await navigator.clipboard.writeText(message);
      setStatus("コピーしました。Museを開いて貼り付けてください。");
    } catch {
      setActionError("コピーできませんでした。");
    }
  };

  const revoke = async () => {
    if (!grant || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await revokeAIIntegration(grant.grantId);
      setIntegrations((current) => current.filter((item) => item.grantId !== grant.grantId));
      setGrant(null);
      setConfirmingRevoke(false);
      setStatus("接続を解除しました");
    } catch (nextError) {
      setActionError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="m5-page m5-settings-page ai-integrations-page" aria-busy={loading || busy}>
      <SettingsHeader title="AI連携" onBack={() => onNavigate("/other")} />

      <h2 className="m5-section-heading">利用できるAI</h2>
      <div className="m5-settings-list">
        {AI_PROVIDERS.map((item) => {
          const connected = item.key === "muse" && Boolean(museGrant);
          const action = connected ? "接続済み" : item.key === "muse" ? "接続する" : "接続方法を見る";
          return (
            <button key={item.key} type="button" className="m5-settings-row m5-row-button ai-provider-row" onClick={() => openProvider(item.key)}>
              <span>{item.label}</span>
              <span className="m5-row-value">{action}{!connected ? <ChevronRight aria-hidden="true" /> : null}</span>
            </button>
          );
        })}
      </div>

      <div className="ai-integrations-connected">
        <h2 className="m5-section-heading">接続中</h2>
        {loading ? <p className="m5-status" role="status">読み込み中…</p> : null}
        {error ? <div className="ai-integrations-error"><p className="m5-error" role="alert">{error}</p><button type="button" className="ai-retry-button" onClick={() => void loadIntegrations()}>再読み込み</button></div> : null}
        {!loading && !error && integrations.length === 0 ? <p className="m5-status">接続中のAIはありません</p> : null}
        {!loading && integrations.length > 0 ? (
          <div className="m5-settings-list">
            {integrations.map((item) => (
              <button key={item.grantId} type="button" className="m5-settings-row m5-row-button ai-integration-row" onClick={() => { setGrant(item); setConfirmingRevoke(false); setActionError(""); }}>
                <span>{providerLabelForClient(item.clientId, item.clientName)}</span>
                <span className="m5-row-value">{formatConnectedAt(item.connectedAt)}<ChevronRight aria-hidden="true" /></span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {provider === null && grant === null ? <p className="m5-status" role="status" aria-live="polite">{status}</p> : null}

      <BottomSheet open={provider !== null} title={selectedProvider?.key === "muse" ? "Museの接続" : selectedProvider?.key === "chatgpt" ? "ChatGPTの接続" : "その他のAI"} onClose={() => setProvider(null)}>
        <div className="m5-sheet-content ai-guide-content">
          {provider === "muse" ? <>
            <p>下の内容をコピーしてMuseに送ると、HouseToDoとの接続を始められます。</p>
            <button type="button" className="m5-primary-action" onClick={() => void copyMuseConnectionGuide()}>Museに送る内容をコピー</button>
            <p>Museで接続を進めると、HouseToDoへのログインとアクセス許可を求められる場合があります。</p>
          </> : null}
          {provider === "chatgpt" ? <>
            <p>ChatGPTのWeb版でカスタムMCPサーバーを追加します。利用できるプランやワークスペースの設定が必要な場合があります。</p>
            <a className="ai-guide-link" href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" target="_blank" rel="noreferrer">ChatGPTの設定方法を見る</a>
          </> : null}
          {provider === "other" ? <p>MCPに対応したAIの設定で、HouseToDoのサーバーURLを登録してください。</p> : null}
          {provider === "muse" ? <McpUrlDisplay /> : null}
          {provider === "chatgpt" || provider === "other" ? <McpUrlRow onCopy={() => void copyMcpUrl()} /> : null}
          {status && provider !== null ? <p className="m5-status" role="status" aria-live="polite">{status}</p> : null}
          {actionError ? <p className="m5-error" role="alert">{actionError}</p> : null}
        </div>
      </BottomSheet>

      <BottomSheet open={grant !== null} title={confirmingRevoke ? "接続を解除しますか？" : "接続中のAI"} onClose={() => { setGrant(null); setConfirmingRevoke(false); }}>
        {grant ? <div className="m5-sheet-content ai-grant-content">
          {actionError ? <p className="m5-error" role="alert">{actionError}</p> : null}
          {!confirmingRevoke ? <>
            <p className="ai-grant-name">{providerLabelForClient(grant.clientId, grant.clientName)}</p>
            <h3 className="ai-grant-scope-heading">できること</h3>
            <ul className="ai-grant-scopes">
              {grant.scopes.filter((scope) => scopeLabels[scope]).map((scope) => <li key={scope}>{scopeLabels[scope]}</li>)}
            </ul>
            <p className="m5-status">接続日: {formatConnectedAt(grant.connectedAt)}</p>
            <button type="button" className="m5-danger-action" disabled={busy} onClick={() => setConfirmingRevoke(true)}>接続を解除</button>
          </> : <>
            <p>{providerLabelForClient(grant.clientId, grant.clientName)}との接続を解除します。</p>
            <button type="button" className="m5-danger-action" disabled={busy} onClick={() => void revoke()}>{busy ? "解除中…" : "接続を解除"}</button>
            <button type="button" className="m5-secondary-action" disabled={busy} onClick={() => setConfirmingRevoke(false)}>キャンセル</button>
          </>}
        </div> : null}
      </BottomSheet>
    </section>
  );
}

function McpUrlRow({ onCopy }: { onCopy: () => void }) {
  return (
    <div className="ai-mcp-url">
      <div className="ai-mcp-url-label">MCPサーバー</div>
      <code>{HOUSETODO_MCP_URL}</code>
      <button type="button" className="m5-secondary-action ai-copy-button" onClick={onCopy}>コピー</button>
    </div>
  );
}

function McpUrlDisplay() {
  return (
    <div className="ai-mcp-url">
      <div className="ai-mcp-url-label">MCPサーバー</div>
      <code>{HOUSETODO_MCP_URL}</code>
    </div>
  );
}
