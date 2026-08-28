import { unauthenticatedError } from "../lib/errors";
import { okJson } from "../lib/response";
import { validateDateQuery } from "../lib/validation";
import { requireAuth } from "../middleware/auth";
import type { Handler } from "../middleware/error-handler";
import { HomeService } from "../services/home-service";
import { taskWithStatusResponse } from "./tasks";
import type { AuthenticatedUser } from "../types/api";

const requireUser = (user: AuthenticatedUser | undefined): AuthenticatedUser => {
  if (!user) throw unauthenticatedError();
  return user;
};

export const homeTodayRoute: Handler = requireAuth(async (context) => {
  const user = requireUser(context.user);
  const date = validateDateQuery(context.request, "date");
  const data = await new HomeService(context.env.DB).getToday(user.id, date);
  return okJson(
    {
      ...data,
      homeTasks: data.homeTasks.map(taskWithStatusResponse)
    },
    context.requestId
  );
});
