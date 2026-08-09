import { apiRequest } from "./client";

export const getVapidPublicKey = (signal?: AbortSignal) =>
  apiRequest<{ publicKey: string }>("/api/notifications/vapid-public-key", { signal });

export const registerPushSubscription = (subscription: PushSubscription) =>
  apiRequest<{ registered: boolean }>("/api/notifications/subscriptions", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.toJSON().keys })
  });

export const unregisterPushSubscription = (endpoint: string) =>
  apiRequest<{ removed: boolean }>("/api/notifications/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint })
  });
