import { AppError } from "./errors";
import type { ApiFailure, ApiSuccess } from "../types/api";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export const okJson = <T>(
  data: T,
  requestId: string,
  init: ResponseInit = {}
): Response => {
  const body: ApiSuccess<T> = { ok: true, data, requestId };
  return Response.json(body, {
    ...init,
    headers: { ...jsonHeaders, ...init.headers }
  });
};

export const errorJson = (
  error: AppError,
  requestId: string,
  init: ResponseInit = {}
): Response => {
  const body: ApiFailure = {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    },
    requestId
  };

  return Response.json(body, {
    ...init,
    status: error.status,
    headers: { ...jsonHeaders, ...init.headers }
  });
};

export const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    code: "INTERNAL_ERROR",
    status: 500,
    message: "サーバー内部でエラーが発生しました。",
    cause: error
  });
};
