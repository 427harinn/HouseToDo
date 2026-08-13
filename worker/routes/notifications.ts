import { AppError, unauthenticatedError } from "../lib/errors";
import { errorJson, okJson } from "../lib/response";
import {
  parsePushSubscriptionJsonBody,
  validatePushSubscriptionInput,
  validatePushUnregisterInput
} from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { PushSubscriptionService } from "../services/push-subscription-service";
import { HouseholdService } from "../services/household-service";
import { WebPushService } from "../services/web-push-service";
import { PushSubscriptionRepository } from "../repositories/push-subscription-repository";

const APPLE_PUSH_PROBE_URL = "https://web.push.apple.com/";
const detailedEnvironments = new Set(["staging", "development", "test"]);
const probeModes = new Set([
  "get",
  "post-empty",
  "post-basic-headers",
  "post-body",
  "post-content-encoding",
  "post-authorization-fixed-host",
  "subscription-post-empty",
  "subscription-post-ttl",
  "subscription-post-ttl-global-fetch",
  "subscription-post-vapid",
  "subscription-post-authorization-dummy",
  "subscription-post-dummy-header",
  "subscription-post-authorization-dummy-manual-redirect"
]);
const safeProbeErrorNames = new Set([
  "AbortError",
  "Error",
  "NetworkError",
  "RangeError",
  "SyntaxError",
  "TypeError"
]);
const safeProbeCauseCodes = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ERR_NETWORK",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET"
]);

const safeProbeErrorName = (thrown: unknown): string =>
  thrown instanceof Error && safeProbeErrorNames.has(thrown.name) ? thrown.name : "UnknownError";

const safeProbeCauseCode = (thrown: unknown): string | null => {
  if (!(thrown instanceof Error) || !thrown.cause || typeof thrown.cause !== "object") {
    return null;
  }
  const code = (thrown.cause as { code?: unknown }).code;
  return typeof code === "string" && safeProbeCauseCodes.has(code) ? code : null;
};

const probeRequestInit = (mode: string): RequestInit => {
  switch (mode) {
    case "post-empty":
      return { method: "POST" };
    case "post-basic-headers":
      return {
        method: "POST",
        headers: {
          TTL: "60",
          "Content-Type": "application/octet-stream"
        }
      };
    case "post-body":
      return {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3])
      };
    case "post-content-encoding":
      return {
        method: "POST",
        headers: {
          TTL: "60",
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm"
        },
        body: new Uint8Array([1, 2, 3])
      };
    case "post-authorization-fixed-host":
      return {
        method: "POST",
        headers: { Authorization: "Bearer probe" }
      };
    default:
      return { method: "GET" };
  }
};

const isAppleHttpsEndpoint = (endpoint: string): boolean => {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "web.push.apple.com" || hostname.endsWith(".push.apple.com"))
    );
  } catch {
    return false;
  }
};

const requireUserId = (userId: string | undefined): string => {
  if (!userId) throw unauthenticatedError();
  return userId;
};

export const vapidPublicKeyRoute: Handler = requireAuth((context) => {
  const publicKey = context.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey)
    throw new AppError({
      code: "PUSH_CONFIG_UNAVAILABLE",
      status: 503,
      message: "Push notification configuration is unavailable."
    });
  return okJson({ publicKey }, context.requestId);
});

export const debugIdentityRoute: Handler = requireAuth(async (context) => {
  if (!detailedEnvironments.has(context.env.APP_ENV ?? "")) {
    throw new AppError({ code: "NOT_FOUND", status: 404, message: "Not found." });
  }

  const userId = requireUserId(context.user?.id);
  const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(
    userId
  );

  return okJson({ userId, householdId: household.id }, context.requestId);
});

export const registerPushSubscriptionRoute: Handler = requireAuth(async (context) => {
  const userId = requireUserId(context.user?.id);
  const input = validatePushSubscriptionInput(
    await parsePushSubscriptionJsonBody(context.request)
  );
  await new PushSubscriptionService(context.env.DB).register(userId, input, null);
  return okJson({ registered: true }, context.requestId, { status: 201 });
});

export const unregisterPushSubscriptionRoute: Handler = requireAuth(async (context) => {
  const userId = requireUserId(context.user?.id);
  const input = validatePushUnregisterInput(
    await parsePushSubscriptionJsonBody(context.request)
  );
  await new PushSubscriptionService(context.env.DB).unregister(userId, input.endpoint);
  return okJson({ removed: true }, context.requestId);
});

export const testPushNotificationRoute: Handler = requireAuth(async (context) => {
  if (
    context.env.APP_ENV === "production" ||
    !["staging", "development", "test"].includes(context.env.APP_ENV ?? "")
  ) {
    throw new AppError({ code: "NOT_FOUND", status: 404, message: "Not found." });
  }
  const userId = requireUserId(context.user?.id);
  const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(
    userId
  );
  try {
    const result = await new WebPushService(context.env.DB).sendTest(
      userId,
      household.id,
      context.env
    );
    if (result.sent === 0 && result.failed === 0) {
      throw new AppError({
        code: "PUSH_NOT_ENABLED",
        status: 409,
        message: "この端末で通知を有効にしてください。"
      });
    }
    if (result.failure) {
      return errorJson(new AppError({
        code: "WEB_PUSH_SEND_FAILED",
        status: 502,
        message: "Test push notification could not be sent.",
        details: {
          stage: result.failure.stage,
          category: result.failure.errorCategory,
          ...(result.failure.requestPhase
            ? { requestPhase: result.failure.requestPhase }
            : {}),
          ...(result.failure.errorName
            ? { errorName: result.failure.errorName }
            : {}),
          ...(result.failure.causeCode
            ? { causeCode: result.failure.causeCode }
            : {}),
          ...(result.failure.pushService
            ? { pushService: result.failure.pushService }
            : {}),
          ...(result.failure.upstreamStatus !== null
            ? { upstreamStatus: String(result.failure.upstreamStatus) }
            : {})
        }
      }), context.requestId);
    }
    return okJson(result, context.requestId);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.message === "push-config-missing") {
      throw new AppError({
        code: "PUSH_CONFIG_UNAVAILABLE",
        status: 503,
        message: "Push notification configuration is unavailable."
      });
    }
    throw error;
  }
});

export const applePushNetworkProbeRoute: Handler = requireAuth(async (context) => {
  if (!detailedEnvironments.has(context.env.APP_ENV ?? "")) {
    throw new AppError({ code: "NOT_FOUND", status: 404, message: "Not found." });
  }

  const mode = new URL(context.request.url).searchParams.get("mode") ?? "get";
  if (!probeModes.has(mode)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Invalid network probe mode.",
      details: { mode: "Unsupported probe mode." }
    });
  }

  if (
    mode === "subscription-post-empty" ||
    mode === "subscription-post-ttl" ||
    mode === "subscription-post-ttl-global-fetch" ||
    mode === "subscription-post-vapid" ||
    mode === "subscription-post-authorization-dummy" ||
    mode === "subscription-post-dummy-header" ||
    mode === "subscription-post-authorization-dummy-manual-redirect"
  ) {
    const userId = requireUserId(context.user?.id);
    const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(
      userId
    );
    const subscriptions = await new PushSubscriptionRepository(context.env.DB).listActiveByUserHousehold(
      userId,
      household.id
    );
    if (mode === "subscription-post-vapid") {
      const results = await new WebPushService(context.env.DB).probeVapidAuthorization(
        userId,
        household.id,
        context.env,
        isAppleHttpsEndpoint
      );
      return okJson({ results }, context.requestId);
    }
    if (mode === "subscription-post-authorization-dummy") {
      const results = await new WebPushService(context.env.DB).probeDummyAuthorization(
        userId,
        household.id,
        isAppleHttpsEndpoint
      );
      return okJson({ results }, context.requestId);
    }
    if (mode === "subscription-post-dummy-header") {
      const results = await new WebPushService(context.env.DB).probeCustomHeader(
        userId,
        household.id,
        isAppleHttpsEndpoint
      );
      return okJson({ results }, context.requestId);
    }
    if (mode === "subscription-post-authorization-dummy-manual-redirect") {
      const results = await new WebPushService(context.env.DB).probeDummyAuthorizationManualRedirect(
        userId,
        household.id,
        isAppleHttpsEndpoint
      );
      return okJson({ results }, context.requestId);
    }
    if (mode === "subscription-post-ttl") {
      const results = await new WebPushService(context.env.DB).probeTtl(
        userId,
        household.id,
        isAppleHttpsEndpoint
      );
      return okJson({ results }, context.requestId);
    }
    if (mode === "subscription-post-ttl-global-fetch") {
      const results = await Promise.all(
        subscriptions.map(async (subscription, index) => {
          if (!isAppleHttpsEndpoint(subscription.endpoint)) return null;
          try {
            const response = await globalThis.fetch(subscription.endpoint, {
              method: "POST",
              headers: { TTL: "60" }
            });
            if (!(response instanceof Response) || typeof response.status !== "number") {
              throw new TypeError("Probe fetch did not return an HTTP response.");
            }
            return { index: index + 1, ok: true, status: response.status };
          } catch (error) {
            const errorName = safeProbeErrorName(error);
            const causeCode = safeProbeCauseCode(error);
            return {
              index: index + 1,
              ok: false,
              stage: "network",
              errorCategory: "network_failed",
              upstreamStatus: null,
              requestPhase: "fetch_call",
              errorName,
              causeCode,
              pushService: "apple"
            };
          }
        })
      );
      return okJson(
        { results: results.filter((result): result is NonNullable<typeof result> => result !== null) },
        context.requestId
      );
    }
    const results = await Promise.all(
      subscriptions.map(async (subscription, index) => {
        if (!isAppleHttpsEndpoint(subscription.endpoint)) return null;
        try {
          const response = await fetch(subscription.endpoint, { method: "POST" });
          if (!(response instanceof Response) || typeof response.status !== "number") {
            throw new TypeError("Probe fetch did not return an HTTP response.");
          }
          console.info("subscription_network_probe_completed", {
            type: mode,
            index: index + 1,
            status: response.status
          });
          return { index: index + 1, ok: true, status: response.status };
        } catch (error) {
          const errorName = safeProbeErrorName(error);
          const causeCode = safeProbeCauseCode(error);
          console.error("subscription_network_probe_failed", {
            type: mode,
            index: index + 1,
            errorName,
            causeCode
          });
          return {
            index: index + 1,
            ok: false,
            errorName,
            causeCode
          };
        }
      })
    );
    return okJson(
      { results: results.filter((result): result is NonNullable<typeof result> => result !== null) },
      context.requestId
    );
  }

  try {
    const response = await fetch(APPLE_PUSH_PROBE_URL, probeRequestInit(mode));
    console.info("network_probe_completed", { mode, status: response.status });
    return okJson({ ok: true, mode, status: response.status }, context.requestId);
  } catch (error) {
    const errorName = safeProbeErrorName(error);
    const causeCode = safeProbeCauseCode(error);
    if (mode === "post-authorization-fixed-host") {
      console.error("network_probe_failed", {
        stage: "network",
        errorCategory: "network_failed",
        requestPhase: "fetch_call",
        errorName,
        causeCode,
        pushService: "apple",
        upstreamStatus: null
      });
      return errorJson(
        new AppError({
          code: "WEB_PUSH_NETWORK_PROBE_FAILED",
          status: 502,
          message: "Apple Push network probe failed.",
          details: {
            stage: "network",
            errorCategory: "network_failed",
            requestPhase: "fetch_call",
            errorName,
            causeCode: causeCode ?? "null",
            pushService: "apple",
            upstreamStatus: "null"
          }
        }),
        context.requestId
      );
    }
    console.error("network_probe_failed", { mode, errorName, causeCode });
    return errorJson(
      new AppError({
        code: "WEB_PUSH_NETWORK_PROBE_FAILED",
        status: 502,
        message: "Apple Push network probe failed.",
        details: { mode, errorName, causeCode: causeCode ?? "null" }
      }),
      context.requestId
    );
  }
});
