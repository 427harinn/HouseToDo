export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_ORIGIN"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "HOUSEHOLD_LIMIT_REACHED"
  | "INVALID_INVITE"
  | "INVITE_EXPIRED"
  | "INVITE_ALREADY_USED"
  | "ALREADY_HOUSEHOLD_MEMBER"
  | "TASK_NOT_FOUND"
  | "INVALID_TASK_CONFIGURATION"
  | "ASSIGNEE_NOT_HOUSEHOLD_MEMBER"
  | "TASK_ALREADY_COMPLETED"
  | "TASK_ALREADY_IN_PROGRESS"
  | "TASK_IN_PROGRESS_BY_OTHER_MEMBER"
  | "TASK_RECORD_NOT_FOUND"
  | "TASK_NOT_ACTIVE"
  | "INVALID_TARGET_DATE"
  | "INVALID_TARGET_WEEK"
  | "SHOPPING_ITEM_NOT_FOUND"
  | "SHOPPING_ITEM_ALREADY_PURCHASED"
  | "SHOPPING_ITEM_NOT_PURCHASED"
  | "INVALID_SHOPPING_ITEM"
  | "SHOPPING_TEMPLATE_NOT_FOUND"
  | "SHOPPING_TEMPLATE_NOT_ACTIVE"
  | "INVALID_SHOPPING_TEMPLATE"
  | "RATE_LIMITED"
  | "IMAGE_UPLOAD_IN_PROGRESS"
  | "IMAGE_STORED_BYTES_UNKNOWN"
  | "IMAGE_COUNT_LIMIT_REACHED"
  | "IMAGE_ACTIVE_BYTES_LIMIT_REACHED"
  | "IMAGE_STORED_BYTES_LIMIT_REACHED"
  | "IMAGE_DAILY_UPLOAD_LIMIT_REACHED"
  | "PUSH_CONFIG_UNAVAILABLE"
  | "PUSH_NOT_ENABLED"
  | "WEB_PUSH_SEND_FAILED"
  | "WEB_PUSH_NETWORK_PROBE_FAILED"
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

export const taskNotFoundError = () =>
  new AppError({
    code: "TASK_NOT_FOUND",
    status: 404,
    message: "Task was not found."
  });

export const inactiveTaskError = () =>
  new AppError({
    code: "TASK_NOT_ACTIVE",
    status: 409,
    message: "Task is inactive."
  });

export const taskConflictError = (code: AppErrorCode, message: string) =>
  new AppError({
    code,
    status: 409,
    message
  });

export const shoppingItemNotFoundError = () =>
  new AppError({
    code: "SHOPPING_ITEM_NOT_FOUND",
    status: 404,
    message: "Shopping item was not found."
  });

export const shoppingTemplateNotFoundError = () =>
  new AppError({
    code: "SHOPPING_TEMPLATE_NOT_FOUND",
    status: 404,
    message: "Shopping template was not found."
  });

export const inactiveShoppingTemplateError = () =>
  new AppError({
    code: "SHOPPING_TEMPLATE_NOT_ACTIVE",
    status: 409,
    message: "Shopping template is inactive."
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

export const forbiddenError = (message = "この操作は許可されていません。") =>
  new AppError({
    code: "FORBIDDEN",
    status: 403,
    message
  });

export const invalidOriginError = () =>
  new AppError({
    code: "INVALID_ORIGIN",
    status: 403,
    message: "許可されていない送信元です。"
  });

export const householdLimitReachedError = () =>
  new AppError({
    code: "HOUSEHOLD_LIMIT_REACHED",
    status: 409,
    message: "MVPでは所属できる家庭は1つまでです。"
  });

export const invalidInviteError = () =>
  new AppError({
    code: "INVALID_INVITE",
    status: 400,
    message: "招待コードが正しくありません。"
  });

export const inviteExpiredError = () =>
  new AppError({
    code: "INVITE_EXPIRED",
    status: 400,
    message: "招待コードの有効期限が切れています。"
  });

export const inviteAlreadyUsedError = () =>
  new AppError({
    code: "INVITE_ALREADY_USED",
    status: 409,
    message: "この招待コードはすでに使用されています。"
  });

export const alreadyHouseholdMemberError = () =>
  new AppError({
    code: "ALREADY_HOUSEHOLD_MEMBER",
    status: 409,
    message: "すでにこの家庭へ参加しています。"
  });
