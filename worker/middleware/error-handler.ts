import { errorJson, toAppError } from "../lib/response";
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
        console.error("worker_error", {
          requestId: context.requestId,
          method: context.request.method,
          path: new URL(context.request.url).pathname,
          code: appError.code,
          cause: appError.cause instanceof Error ? appError.cause.name : typeof appError.cause
        });
      }
      return errorJson(appError, context.requestId);
    }
  };
