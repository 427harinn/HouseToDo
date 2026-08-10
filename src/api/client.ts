export type ApiErrorCode =
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
  | "SHOPPING_ITEM_NOT_FOUND"
  | "SHOPPING_TEMPLATE_NOT_FOUND"
  | "SHOPPING_TEMPLATE_NOT_ACTIVE"
  | "INVALID_SHOPPING_ITEM"
  | "INVALID_SHOPPING_TEMPLATE"
  | "IMAGE_COUNT_LIMIT_REACHED"
  | "IMAGE_ACTIVE_BYTES_LIMIT_REACHED"
  | "IMAGE_STORED_BYTES_LIMIT_REACHED"
  | "IMAGE_STORED_BYTES_UNKNOWN"
  | "IMAGE_DAILY_UPLOAD_LIMIT_REACHED"
  | "IMAGE_UPLOAD_IN_PROGRESS"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "PUSH_CONFIG_UNAVAILABLE"
  | "WEB_PUSH_SEND_FAILED";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, string>;

  constructor(input: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    details?: Record<string, string>;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.code = input.code;
    this.status = input.status ?? 0;
    this.details = input.details;
  }
}

type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

type ApiFailure = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, string>;
  };
  requestId: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseResponse = async <T>(response: Response): Promise<ApiResponse<T>> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError({
      code: "INVALID_RESPONSE",
      status: response.status,
      message: "サーバーから読み取れない応答が返されました。"
    });
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.ok !== "boolean") {
    throw new ApiError({
      code: "INVALID_RESPONSE",
      status: response.status,
      message: "サーバーの応答形式が正しくありません。"
    });
  }

  return payload as ApiResponse<T>;
};

export const apiRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: "include"
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "通信に失敗しました。時間をおいてもう一度お試しください。"
    });
  }

  const payload = await parseResponse<T>(response);
  if (!payload.ok) {
    throw new ApiError({
      code: payload.error.code,
      status: response.status,
      message: payload.error.message,
      details: payload.error.details
    });
  }

  return payload.data;
};

export const apiMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) {
    return "処理に失敗しました。時間をおいてもう一度お試しください。";
  }

  switch (error.code) {
    case "UNAUTHENTICATED":
      return "ログインが必要です。もう一度ログインしてください。";
    case "FORBIDDEN":
      return "この操作を行う権限がありません。";
    case "CONFLICT":
      return "すでに登録済み、または現在の状態では実行できません。";
    case "HOUSEHOLD_LIMIT_REACHED":
      return "現在のMVPでは所属できる家庭は1つまでです。";
    case "INVALID_INVITE":
      return "招待コードが正しくありません。";
    case "INVITE_EXPIRED":
      return "招待コードの有効期限が切れています。";
    case "INVITE_ALREADY_USED":
      return "この招待コードはすでに使用されています。";
    case "WEB_PUSH_SEND_FAILED":
      return "テスト通知を送信できませんでした。";
    case "VALIDATION_ERROR":
      return "入力内容を確認してください。";
    default:
      return error.message;
  }
};
