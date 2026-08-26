import { notFoundError } from "./lib/errors";
import { errorJson } from "./lib/response";
import { withErrorHandling } from "./middleware/error-handler";
import { createRequestContext } from "./middleware/request-context";
import { withStateChangingRequestProtection } from "./middleware/security";
import { loginRoute, logoutRoute, meRoute, registerRoute } from "./routes/auth";
import { healthRoute } from "./routes/health";
import { currentHouseholdImageUsageRoute } from "./routes/household-image-usage";
import {
  createHouseholdInviteRoute,
  createHouseholdRoute,
  currentHouseholdMembersRoute,
  currentHouseholdRoute,
  joinHouseholdRoute,
  validateHouseholdInviteRoute,
  updateCurrentHouseholdRoute
} from "./routes/households";
import {
  addShoppingItemFromTemplateRoute,
  clearPurchasedShoppingItemsRoute,
  createShoppingItemRoute,
  createShoppingTemplateRoute,
  deleteShoppingItemRoute,
  deleteShoppingTemplateRoute,
  getShoppingItemRoute,
  getShoppingTemplateRoute,
  listShoppingItemsRoute,
  listRecentShoppingItemsRoute,
  listShoppingTemplatesRoute,
  purchaseShoppingItemRoute,
  reorderShoppingItemsRoute,
  unpurchaseShoppingItemRoute,
  updateShoppingItemRoute,
  updateShoppingTemplateRoute
} from "./routes/shopping";
import {
  deleteShoppingItemImageRoute,
  getShoppingItemImageRoute,
  uploadShoppingItemImageRoute
} from "./routes/shopping-images";
import {
  changeTaskStateRoute,
  calendarTasksRoute,
  createTaskRoute,
  dashboardTodayRoute,
  deleteTaskRoute,
  getTaskRoute,
  recentTasksRoute,
  restoreTaskRecordRoute,
  restoreCalendarTaskRecordRoute,
  listTasksRoute,
  taskHistoryRoute,
  todayTasksRoute,
  updateTaskRoute,
  weekTasksRoute
} from "./routes/tasks";
import {
  createTaskTemplateRoute,
  deleteTaskTemplateRoute,
  getTaskTemplateRoute,
  listTaskTemplatesRoute,
  updateTaskTemplateRoute
} from "./routes/task-templates";
import type { Env } from "./types/env";
import {
  vapidPublicKeyRoute,
  registerPushSubscriptionRoute,
  unregisterPushSubscriptionRoute,
  testPushNotificationRoute
} from "./routes/notifications";
import {
  getNotificationSettingsRoute,
  updateNotificationSettingsRoute
} from "./routes/notification-settings";
import {
  deleteProfileImageRoute,
  getProfileImageRoute,
  profileImageMetadataRoute,
  updateProfileRoute,
  uploadProfileImageRoute
} from "./routes/account";

const routeApi = withErrorHandling(
  withStateChangingRequestProtection((context) => {
    const url = new URL(context.request.url);
    const key = `${context.request.method} ${url.pathname}`;
    const taskPath = url.pathname.match(/^\/api\/tasks\/([^/]+)(?:\/([^/]+))?$/);
    const taskTemplatePath = url.pathname.match(/^\/api\/task-templates\/([^/]+)$/);
    const shoppingItemPath = url.pathname.match(
      /^\/api\/shopping\/items\/([^/]+)(?:\/([^/]+))?$/
    );
    const shoppingTemplatePath = url.pathname.match(
      /^\/api\/shopping\/templates\/([^/]+)(?:\/([^/]+))?$/
    );
    const userAvatarPath = url.pathname.match(/^\/api\/users\/([^/]+)\/avatar$/);

    if (userAvatarPath && context.request.method === "GET") {
      return getProfileImageRoute(decodeURIComponent(userAvatarPath[1]))(context);
    }

    if (taskTemplatePath) {
      const templateId = decodeURIComponent(taskTemplatePath[1]);
      if (context.request.method === "GET")
        return getTaskTemplateRoute(templateId)(context);
      if (context.request.method === "PATCH")
        return updateTaskTemplateRoute(templateId)(context);
      if (context.request.method === "DELETE")
        return deleteTaskTemplateRoute(templateId)(context);
    }

    if (taskPath && !["today", "week", "calendar", "recent"].includes(taskPath[1])) {
      const taskId = decodeURIComponent(taskPath[1]);
      const action = taskPath[2];
      if (!action && context.request.method === "GET")
        return getTaskRoute(taskId)(context);
      if (!action && context.request.method === "PATCH")
        return updateTaskRoute(taskId)(context);
      if (!action && context.request.method === "DELETE")
        return deleteTaskRoute(taskId)(context);
      if (action === "history" && context.request.method === "GET") {
        return taskHistoryRoute(taskId)(context);
      }
      if (action === "restore" && context.request.method === "POST") {
        return restoreTaskRecordRoute(taskId)(context);
      }
      if (action === "calendar-restore" && context.request.method === "POST") {
        return restoreCalendarTaskRecordRoute(taskId)(context);
      }
      if (
        context.request.method === "POST" &&
        (action === "start" ||
          action === "complete" ||
          action === "skip" ||
          action === "reset")
      ) {
        return changeTaskStateRoute(taskId, action)(context);
      }
    }

    if (shoppingItemPath && shoppingItemPath[1] !== "purchased" && shoppingItemPath[1] !== "reorder") {
      const itemId = decodeURIComponent(shoppingItemPath[1]);
      const action = shoppingItemPath[2];
      if (!action && context.request.method === "GET")
        return getShoppingItemRoute(itemId)(context);
      if (!action && context.request.method === "PATCH")
        return updateShoppingItemRoute(itemId)(context);
      if (!action && context.request.method === "DELETE")
        return deleteShoppingItemRoute(itemId)(context);
      if (action === "purchase" && context.request.method === "POST") {
        return purchaseShoppingItemRoute(itemId)(context);
      }
      if (action === "unpurchase" && context.request.method === "POST") {
        return unpurchaseShoppingItemRoute(itemId)(context);
      }
      if (action === "image" && context.request.method === "PUT")
        return uploadShoppingItemImageRoute(itemId)(context);
      if (action === "image" && context.request.method === "GET")
        return getShoppingItemImageRoute(itemId)(context);
      if (action === "image" && context.request.method === "DELETE")
        return deleteShoppingItemImageRoute(itemId)(context);
    }

    if (url.pathname === "/api/shopping/items/reorder" && context.request.method === "POST") {
      return reorderShoppingItemsRoute(context);
    }

    if (shoppingTemplatePath) {
      const templateId = decodeURIComponent(shoppingTemplatePath[1]);
      const action = shoppingTemplatePath[2];
      if (!action && context.request.method === "GET")
        return getShoppingTemplateRoute(templateId)(context);
      if (!action && context.request.method === "PATCH")
        return updateShoppingTemplateRoute(templateId)(context);
      if (!action && context.request.method === "DELETE")
        return deleteShoppingTemplateRoute(templateId)(context);
      if (action === "add" && context.request.method === "POST") {
        return addShoppingItemFromTemplateRoute(templateId)(context);
      }
    }

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
      case "GET /api/account/avatar":
        return profileImageMetadataRoute(context);
      case "PATCH /api/account/profile":
        return updateProfileRoute(context);
      case "PUT /api/account/avatar":
        return uploadProfileImageRoute(context);
      case "DELETE /api/account/avatar":
        return deleteProfileImageRoute(context);
      case "GET /api/notifications/vapid-public-key":
        return vapidPublicKeyRoute(context);
      case "POST /api/notifications/subscriptions":
        return registerPushSubscriptionRoute(context);
      case "DELETE /api/notifications/subscriptions":
        return unregisterPushSubscriptionRoute(context);
      case "POST /api/notifications/test":
        return testPushNotificationRoute(context);
      case "GET /api/notifications/settings":
        return getNotificationSettingsRoute(context);
      case "PATCH /api/notifications/settings":
        return updateNotificationSettingsRoute(context);
      case "POST /api/households":
        return createHouseholdRoute(context);
      case "GET /api/households/current":
        return currentHouseholdRoute(context);
      case "PATCH /api/households/current":
        return updateCurrentHouseholdRoute(context);
      case "GET /api/households/current/members":
        return currentHouseholdMembersRoute(context);
      case "GET /api/households/current/image-usage":
        return currentHouseholdImageUsageRoute(context);
      case "POST /api/households/current/invites":
        return createHouseholdInviteRoute(context);
      case "POST /api/households/join":
        return joinHouseholdRoute(context);
      case "POST /api/households/invites/validate":
        return validateHouseholdInviteRoute(context);
      case "GET /api/tasks":
        return listTasksRoute(context);
      case "GET /api/tasks/recent":
        return recentTasksRoute(context);
      case "POST /api/tasks":
        return createTaskRoute(context);
      case "GET /api/tasks/today":
        return todayTasksRoute(context);
      case "GET /api/tasks/week":
        return weekTasksRoute(context);
      case "GET /api/tasks/calendar":
        return calendarTasksRoute(context);
      case "GET /api/task-templates":
        return listTaskTemplatesRoute(context);
      case "POST /api/task-templates":
        return createTaskTemplateRoute(context);
      case "GET /api/dashboard/today":
        return dashboardTodayRoute(context);
      case "GET /api/shopping/items":
        return listShoppingItemsRoute(context);
      case "GET /api/shopping/recent":
        return listRecentShoppingItemsRoute(context);
      case "POST /api/shopping/items":
        return createShoppingItemRoute(context);
      case "POST /api/shopping/items/clear-purchased":
        return clearPurchasedShoppingItemsRoute(context);
      case "GET /api/shopping/templates":
        return listShoppingTemplatesRoute(context);
      case "POST /api/shopping/templates":
        return createShoppingTemplateRoute(context);
      default:
        throw notFoundError();
    }
  })
);

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
