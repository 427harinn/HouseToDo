export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, string>;

  constructor(input: {
    code: AppErrorCode;
    status: number;
    message: string;
    details?: Record<string, string>;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "AppError";
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
  }
}

export const validationError = (
  details: Record<string, string>,
  message = "入力内容を確認してください。"
) =>
  new AppError({
    code: "VALIDATION_ERROR",
    status: 400,
    message,
    details
  });

export const unauthenticatedError = () =>
  new AppError({
    code: "UNAUTHENTICATED",
    status: 401,
    message: "認証が必要です。"
  });

export const notFoundError = () =>
  new AppError({
    code: "NOT_FOUND",
    status: 404,
    message: "対象が見つかりません。"
  });

export const conflictError = (message = "すでに登録されています。") =>
  new AppError({
    code: "CONFLICT",
    status: 409,
    message
  });
