import { errorJson, toAppError } from "../lib/response";
import { safeErrorMessage, safeErrorName, safeErrorStack } from "../lib/safe-logging";
import type { RequestContext } from "./request-context";

export type Handler = (context: RequestContext) => Promise<Response> | Response;

export const withErrorHandling =
  (handler: Handler): Handler =>
  async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.status >= 500) {
        const cause = appError.cause ?? error;
        const stack = safeErrorStack(cause);
        console.error("worker_error", {
          requestId: context.requestId,
          method: context.request.method,
          path: new URL(context.request.url).pathname,
          code: appError.code,
          errorName: safeErrorName(cause),
          errorMessage: safeErrorMessage(cause),
          ...(stack ? { stack } : {})
        });
      }
      return errorJson(appError, context.requestId);
    }
  };
