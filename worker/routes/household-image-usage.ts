import { okJson } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { HouseholdImageUsageService } from "../services/household-image-usage-service";

export const currentHouseholdImageUsageRoute: Handler = requireAuth(async (context) => {
  const usage = await new HouseholdImageUsageService(context.env.DB, context.env).getForUser(context.user!.id);
  return okJson(usage, context.requestId);
});
