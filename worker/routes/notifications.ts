import { AppError, unauthenticatedError } from "../lib/errors";
import { okJson } from "../lib/response";
import { parsePushSubscriptionJsonBody, validatePushSubscriptionInput, validatePushUnregisterInput } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { PushSubscriptionService } from "../services/push-subscription-service";

const requireUserId = (userId: string | undefined): string => {
  if (!userId) throw unauthenticatedError();
  return userId;
};

export const vapidPublicKeyRoute: Handler = requireAuth((context) => {
  const publicKey = context.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) throw new AppError({ code: "PUSH_CONFIG_UNAVAILABLE", status: 503, message: "Push notification configuration is unavailable." });
  return okJson({ publicKey }, context.requestId);
});

export const registerPushSubscriptionRoute: Handler = requireAuth(async (context) => {
  const userId = requireUserId(context.user?.id);
  const input = validatePushSubscriptionInput(await parsePushSubscriptionJsonBody(context.request));
  await new PushSubscriptionService(context.env.DB).register(userId, input, null);
  return okJson({ registered: true }, context.requestId, { status: 201 });
});

export const unregisterPushSubscriptionRoute: Handler = requireAuth(async (context) => {
  const userId = requireUserId(context.user?.id);
  const input = validatePushUnregisterInput(await parsePushSubscriptionJsonBody(context.request));
  await new PushSubscriptionService(context.env.DB).unregister(userId, input.endpoint);
  return okJson({ removed: true }, context.requestId);
});
