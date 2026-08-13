import { apiRequest } from "./client";

export type ApplePushNetworkProbeResult = {
  ok: true;
  mode: string;
  status: number;
};

export type ApplePushNetworkProbeFailure = {
  stage?: string;
  errorCategory?: string;
  requestPhase?: string;
  errorName?: string;
  causeCode?: string;
  pushService?: string;
  upstreamStatus?: string;
};

export type ApplePushSubscriptionProbeResult =
  | { index: number; ok: true; status: number }
  | ({ index: number; ok: false } & ApplePushNetworkProbeFailure);

export const getVapidPublicKey = (signal?: AbortSignal) =>
  apiRequest<{ publicKey: string }>("/api/notifications/vapid-public-key", { signal });

export const registerPushSubscription = (subscription: PushSubscription) =>
  apiRequest<{ registered: boolean }>("/api/notifications/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys
    })
  });

export const unregisterPushSubscription = (endpoint: string) =>
  apiRequest<{ removed: boolean }>("/api/notifications/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint })
  });

export const sendTestPushNotification = () =>
  apiRequest<{ sent: number; failed: number }>("/api/notifications/test", {
    method: "POST",
    body: JSON.stringify({})
  });

export const runApplePushNetworkProbe = () =>
  apiRequest<ApplePushNetworkProbeResult>(
    "/api/notifications/network-probe?mode=post-authorization-fixed-host"
  );

export const runApplePushSubscriptionManualRedirectProbe = () =>
  apiRequest<{ results: ApplePushSubscriptionProbeResult[] }>(
    "/api/notifications/network-probe?mode=subscription-post-authorization-dummy-manual-redirect"
  );

export const runApplePushSubscriptionCustomHeaderProbe = () =>
  apiRequest<{ results: ApplePushSubscriptionProbeResult[] }>(
    "/api/notifications/network-probe?mode=subscription-post-dummy-header"
  );
