import { validationError, unauthenticatedError } from "../lib/errors";
import { parseJsonBody } from "../lib/validation";
import { okJson } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { NotificationSettingsRepository } from "../repositories/notification-settings-repository";
import { HouseholdService } from "../services/household-service";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const userId = (context: Parameters<Handler>[0]) => context.user?.id ?? (() => { throw unauthenticatedError(); })();
const validTimezone = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
};

export const getNotificationSettingsRoute: Handler = requireAuth(async (context) => {
  const id = userId(context);
  const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(id);
  const settings = await new NotificationSettingsRepository(context.env.DB).find(id, household.id);
  return okJson({
    eveningSummaryEnabled: settings?.eveningSummaryEnabled ?? false,
    eveningSummaryTime: settings?.eveningSummaryTime ?? "21:00",
    timezone: settings?.timezone ?? household.timezone
  }, context.requestId);
});

export const updateNotificationSettingsRoute: Handler = requireAuth(async (context) => {
  const id = userId(context);
  const household = await new HouseholdService(context.env.DB).requireCurrentHousehold(id);
  const input = (await parseJsonBody(context.request)) as Record<string, unknown>;
  const details: Record<string, string> = {};
  if (typeof input.eveningSummaryEnabled !== "boolean") details.eveningSummaryEnabled = "must be boolean";
  if (typeof input.eveningSummaryTime !== "string" || !timePattern.test(input.eveningSummaryTime)) details.eveningSummaryTime = "must be HH:mm";
  if (!validTimezone(input.timezone)) details.timezone = "must be a valid IANA timezone";
  if (Object.keys(details).length) throw validationError(details);
  const settings = await new NotificationSettingsRepository(context.env.DB).upsert({
    userId: id, householdId: household.id, eveningSummaryEnabled: input.eveningSummaryEnabled as boolean,
    eveningSummaryTime: input.eveningSummaryTime as string, timezone: input.timezone as string, updatedAt: new Date().toISOString()
  });
  return okJson({ eveningSummaryEnabled: settings.eveningSummaryEnabled, eveningSummaryTime: settings.eveningSummaryTime, timezone: settings.timezone }, context.requestId);
});
