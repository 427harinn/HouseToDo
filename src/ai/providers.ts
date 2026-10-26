export const HOUSETODO_MCP_URL = "https://house-to-do.427harinn.workers.dev/mcp";
export const MUSE_PUBLIC_CLIENT_ID = "housetodo-muse";

export type AIProviderKey = "muse" | "chatgpt" | "other";

const museClientIds = [MUSE_PUBLIC_CLIENT_ID, "housetodo-muse-production", "housetodo-muse-staging"];

export const AI_PROVIDERS: Array<{
  key: AIProviderKey;
  label: string;
  clientIds?: string[];
  integrationName?: string;
}> = [
  {
    key: "muse",
    label: "Meta AI / Muse",
    clientIds: museClientIds,
    integrationName: "Muse"
  },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "other", label: "その他のAI" }
];

export const providerLabelForClient = (clientId: string, clientName: string) =>
  AI_PROVIDERS.find((provider) => provider.clientIds?.includes(clientId))?.integrationName ?? clientName;

export const isMuseClient = (clientId: string) =>
  museClientIds.includes(clientId);
