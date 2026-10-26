import { forbiddenError, unauthenticatedError, validationError } from "../lib/errors";
import { okJson } from "../lib/response";
import { isValidDateKey } from "../lib/date-time";
import {
  parseJsonBody,
  validateShoppingWriteInput,
  validateTaskStateInput,
  validateTaskWriteInput,
  validateDateQuery
} from "../lib/validation";
import { avatarUrlFor } from "../services/auth-service";
import { ShoppingService } from "../services/shopping-service";
import { TaskService } from "../services/task-service";
import { UserRepository } from "../repositories/user-repository";
import type { Handler } from "../middleware/error-handler";
import type { AuthenticatedUser } from "../types/api";
import type { Env } from "../types/env";
import { OAuthService } from "../services/oauth-service";

const equalSecret = (candidate: string, expected: string): boolean => {
  const a = new TextEncoder().encode(candidate);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
};

const authenticateAgent = async (
  request: Request,
  env: Env,
  requiredScope: string
): Promise<{ user: AuthenticatedUser; legacy: boolean }> => {
  const expected = env.AGENT_API_TOKEN;
  const userId = env.AGENT_API_USER_ID;
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) throw unauthenticatedError();
  if (
    (env.APP_ENV === "staging" || env.APP_ENV === "test") &&
    expected && userId && equalSecret(match[1], expected)
  ) {
    const user = await new UserRepository(env.DB).findById(userId);
    if (!user) throw unauthenticatedError();
    return {
      legacy: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: avatarUrlFor(user.id, user)
      }
    };
  }

  if (env.APP_ENV !== "staging" && env.APP_ENV !== "test")
    throw unauthenticatedError();
  const principal = await new OAuthService(env).authenticateAccessToken(match[1]);
  if (!principal) throw unauthenticatedError();
  if (!principal.scopes.has(requiredScope))
    throw forbiddenError("OAuth token is missing the required scope.");
  return { user: principal.user, legacy: false };
};

export const withAgentAuth =
  (requiredScope: string, handler: (user: AuthenticatedUser) => Handler): Handler =>
  async (context) => {
    const principal = await authenticateAgent(context.request, context.env, requiredScope);
    return handler(principal.user)(context);
  };

const parseObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw validationError({ body: "body must be an object." });
  return value as Record<string, unknown>;
};

const taskStatus = (
  task: Awaited<ReturnType<TaskService["listToday"]>>["tasks"][number]
) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  scheduledTime: task.scheduledTime,
  targetDate: task.targetDate,
  occurrenceKey: task.occurrenceKey,
  periodKey: task.periodKey,
  completedAt: task.completedAt,
  overdue: task.overdue
});

export const agentTodayTasksRoute: Handler = withAgentAuth("tasks:read",
  (user) => async (context) => {
    const date = validateDateQuery(context.request, "date");
    const data = await new TaskService(context.env.DB).listToday(user.id, date);
    return okJson(
      { date: data.date, tasks: data.tasks.map(taskStatus) },
      context.requestId
    );
  }
);

export const agentTasksByDateRoute: Handler = withAgentAuth("tasks:read",
  (user) => async (context) => {
    const date = validateDateQuery(context.request, "date");
    if (!date) throw validationError({ date: "date is required." });
    const data = await new TaskService(context.env.DB).listToday(user.id, date);
    return okJson(
      {
        date: data.date,
        tasks: data.tasks.map(taskStatus)
      },
      context.requestId
    );
  }
);

export const agentCreateTaskRoute: Handler = withAgentAuth("tasks:write",
  (user) => async (context) => {
    const input = parseObject(await parseJsonBody(context.request));
    const date = input.date;
    if (typeof date !== "string" || !isValidDateKey(date))
      throw validationError({ date: "date must be YYYY-MM-DD." });
    const canonical = validateTaskWriteInput({
      title: input.title,
      description: input.description,
      modelRecurrenceType: "once",
      executionTiming: "on_date",
      startDate: date,
      targetDate: date,
      scheduledTime: input.time ?? null,
      assignmentType: "anyone",
      notificationSlot: "none"
    });
    const task = await new TaskService(context.env.DB).createTask(user.id, canonical);
    return okJson(
      {
        task: {
          id: task.id,
          title: task.title,
          startDate: task.startDate,
          targetDate: task.targetDate,
          scheduledTime: task.scheduledTime
        }
      },
      context.requestId,
      { status: 201 }
    );
  }
);

export const agentCompleteTaskRoute = (taskId: string): Handler =>
  withAgentAuth("tasks:write", (user) => async (context) => {
    const raw = await parseJsonBody(context.request);
    const body = parseObject(raw);
    const input = validateTaskStateInput({
      ...body,
      targetDate: body.targetDate ?? body.calendarDate,
      calendarDate: body.calendarDate ?? body.targetDate
    });
    if (!input.targetDate)
      throw validationError({ targetDate: "targetDate is required." });
    const result = await new TaskService(context.env.DB).changeState(
      user.id,
      taskId,
      "complete",
      input
    );
    return okJson({ result }, context.requestId);
  });

export const agentShoppingListRoute: Handler = withAgentAuth("shopping:read",
  (user) => async (context) => {
    const data = await new ShoppingService(
      context.env.DB,
      context.env.ATTACHMENTS
    ).listItems(user.id);
    const item = (row: (typeof data.pending)[number]) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      note: row.note,
      status: row.status,
      plannedPurchaseDate: row.plannedPurchaseDate,
      purchasedAt: row.purchasedAt
    });
    return okJson(
      { pending: data.pending.map(item), purchased: data.purchased.map(item) },
      context.requestId
    );
  }
);

export const agentCreateShoppingRoute: Handler = withAgentAuth("shopping:write",
  (user) => async (context) => {
    const input = validateShoppingWriteInput(await parseJsonBody(context.request));
    const item = await new ShoppingService(
      context.env.DB,
      context.env.ATTACHMENTS,
      context.env
    ).createItem(user.id, input, user.displayName);
    return okJson(
      {
        item: {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          note: item.note,
          plannedPurchaseDate: item.plannedPurchaseDate,
          status: item.status
        }
      },
      context.requestId,
      { status: 201 }
    );
  }
);

export const agentPurchaseShoppingRoute = (itemId: string): Handler =>
  withAgentAuth("shopping:write", (user) => async (context) => {
    await parseJsonBody(context.request);
    const item = await new ShoppingService(
      context.env.DB,
      context.env.ATTACHMENTS
    ).markPurchased(user.id, itemId);
    return okJson(
      {
        item: {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          status: item.status,
          purchasedAt: item.purchasedAt
        }
      },
      context.requestId
    );
  });
