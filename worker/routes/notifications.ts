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

const APPLE_PUSH_PROBE_URL = "https://web.push.apple.com/";
const detailedEnvironments = new Set(["staging", "development", "test"]);
const probeModes = new Set(["get", "post-empty", "post-basic-headers", "post-body"]);
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
    default:
      return { method: "GET" };
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

  try {
    const response = await fetch(APPLE_PUSH_PROBE_URL, probeRequestInit(mode));
    console.info("network_probe_completed", { mode, status: response.status });
    return okJson({ ok: true, mode, status: response.status }, context.requestId);
  } catch (error) {
    const errorName = safeProbeErrorName(error);
    const causeCode = safeProbeCauseCode(error);
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
