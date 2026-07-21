import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./constants";
import { validationError } from "./errors";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw validationError({ body: "Content-Typeはapplication/jsonで送信してください。" });
  }

  try {
    return await request.json();
  } catch {
    throw validationError({ body: "JSONの形式が正しくありません。" }, undefined);
  }
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError({ body: "JSONオブジェクトを送信してください。" });
  }
  return value as Record<string, unknown>;
};

const requiredString = (
  input: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number
): string => {
  const value = input[key];
  if (typeof value !== "string") {
    throw validationError({ [key]: `${label}を入力してください。` });
  }
  if (value.length > maxLength) {
    throw validationError({ [key]: `${label}は${maxLength}文字以内で入力してください。` });
  }
  return value;
};

export type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export const validateRegisterInput = (value: unknown): RegisterInput => {
  const input = asObject(value);
  const email = normalizeEmail(requiredString(input, "email", "メールアドレス", EMAIL_MAX_LENGTH));
  const password = requiredString(input, "password", "パスワード", PASSWORD_MAX_LENGTH);
  const displayName = requiredString(input, "displayName", "表示名", 80).trim();

  const details: Record<string, string> = {};
  if (!emailPattern.test(email)) details.email = "メールアドレスの形式が正しくありません。";
  if (password.length < PASSWORD_MIN_LENGTH) {
    details.password = `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`;
  }
  if (displayName.length === 0) details.displayName = "表示名を入力してください。";

  if (Object.keys(details).length > 0) {
    throw validationError(details);
  }

  return { email, password, displayName };
};

export const validateLoginInput = (value: unknown): LoginInput => {
  const input = asObject(value);
  const email = normalizeEmail(requiredString(input, "email", "メールアドレス", EMAIL_MAX_LENGTH));
  const password = requiredString(input, "password", "パスワード", PASSWORD_MAX_LENGTH);
  const details: Record<string, string> = {};

  if (!emailPattern.test(email)) details.email = "メールアドレスの形式が正しくありません。";
  if (password.length === 0) details.password = "パスワードを入力してください。";

  if (Object.keys(details).length > 0) {
    throw validationError(details);
  }

  return { email, password };
};
