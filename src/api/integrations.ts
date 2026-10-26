import { apiRequest } from "./client";

export type AIIntegration = {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  connectedAt: string;
};

export const getAIIntegrations = (signal?: AbortSignal) =>
  apiRequest<{ integrations: AIIntegration[] }>("/api/integrations", { signal });

export const revokeAIIntegration = (grantId: string) =>
  apiRequest<{ revoked: true }>(`/api/integrations/${encodeURIComponent(grantId)}`, {
    method: "DELETE",
    body: JSON.stringify({})
  });
