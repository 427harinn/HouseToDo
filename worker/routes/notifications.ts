import { AppError, unauthenticatedError } from "../lib/errors";
import { okJson } from "../lib/response";
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
