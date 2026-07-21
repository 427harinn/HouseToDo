import { notFoundError } from "./lib/errors";
import { errorJson } from "./lib/response";
import { withErrorHandling } from "./middleware/error-handler";
import { createRequestContext } from "./middleware/request-context";
import { withStateChangingRequestProtection } from "./middleware/security";
import { loginRoute, logoutRoute, meRoute, registerRoute } from "./routes/auth";
import { healthRoute } from "./routes/health";
import {
  createHouseholdInviteRoute,
  createHouseholdRoute,
  currentHouseholdMembersRoute,
  currentHouseholdRoute,
  joinHouseholdRoute,
  updateCurrentHouseholdRoute
} from "./routes/households";
import type { Env } from "./types/env";

const routeApi = withErrorHandling(withStateChangingRequestProtection((context) => {
  const url = new URL(context.request.url);
  const key = `${context.request.method} ${url.pathname}`;

  switch (key) {
    case "GET /api/health":
      return healthRoute(context);
    case "POST /api/auth/register":
      return registerRoute(context);
    case "POST /api/auth/login":
      return loginRoute(context);
    case "POST /api/auth/logout":
      return logoutRoute(context);
    case "GET /api/auth/me":
      return meRoute(context);
    case "POST /api/households":
      return createHouseholdRoute(context);
    case "GET /api/households/current":
      return currentHouseholdRoute(context);
    case "PATCH /api/households/current":
      return updateCurrentHouseholdRoute(context);
    case "GET /api/households/current/members":
      return currentHouseholdMembersRoute(context);
    case "POST /api/households/current/invites":
      return createHouseholdInviteRoute(context);
    case "POST /api/households/join":
      return joinHouseholdRoute(context);
    default:
      throw notFoundError();
  }
}));

export const createApp = () => ({
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const context = createRequestContext(request, env);
      return routeApi(context);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return errorJson(notFoundError(), crypto.randomUUID());
  }
});
