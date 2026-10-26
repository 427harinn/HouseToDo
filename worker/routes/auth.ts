import { SESSION_COOKIE_NAME } from "../lib/constants";
import { createExpiredSessionCookie, createSessionCookie, readCookie } from "../lib/cookies";
import { okJson } from "../lib/response";
import { parseJsonBody, validateLoginInput, validateRegisterInput } from "../lib/validation";
import { AuthService } from "../services/auth-service";
import type { Handler } from "../middleware/error-handler";
import { requireAuth } from "../middleware/auth";
import { logRegisterFailure, logRegisterStage } from "../lib/safe-logging";

export const registerRoute: Handler = async (context) => {
  let stage = "request-start";
  const setStage = (nextStage: string) => {
    stage = nextStage;
    if (context.env.APP_ENV !== "production") logRegisterStage(stage);
  };

  try {
    const input = validateRegisterInput(await parseJsonBody(context.request));
    setStage("validation-complete");
    const result = await new AuthService(context.env.DB).register(input, setStage);
    setStage("cookie-create-start");
    const sessionCookie = createSessionCookie(result.token, context.env.APP_ENV);
    setStage("cookie-created");
    return okJson(
      { user: result.user },
      context.requestId,
      {
        status: 201,
        headers: { "set-cookie": sessionCookie }
      }
    );
  } catch (error) {
    if (context.env.APP_ENV !== "production") logRegisterFailure(error, stage);
    throw error;
  }
};

export const loginRoute: Handler = async (context) => {
  const input = validateLoginInput(await parseJsonBody(context.request));
  const result = await new AuthService(context.env.DB).login(input.email, input.password);
  return okJson(
    { user: result.user },
    context.requestId,
    { headers: { "set-cookie": createSessionCookie(result.token, context.env.APP_ENV) } }
  );
};

export const logoutRoute: Handler = async (context) => {
  const token = readCookie(context.request, SESSION_COOKIE_NAME);
  await new AuthService(context.env.DB).logout(token);
  return okJson(
    { loggedOut: true },
    context.requestId,
    { headers: { "set-cookie": createExpiredSessionCookie(context.env.APP_ENV) } }
  );
};

export const meRoute: Handler = requireAuth((context) =>
  okJson({ user: context.user }, context.requestId)
);
