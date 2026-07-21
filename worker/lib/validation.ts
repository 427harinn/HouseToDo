import {
  EMAIL_MAX_LENGTH,
  HOUSEHOLD_NAME_MAX_LENGTH,
  INVITE_CODE_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from "./constants";
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

export type CreateHouseholdInput = {
  name: string;
};

export type UpdateHouseholdInput = {
  name?: string;
  weekStartsOn?: number;
};

export type JoinHouseholdInput = {
  code: string;
};

export const validateCreateHouseholdInput = (value: unknown): CreateHouseholdInput => {
  const input = asObject(value);
  const name = requiredString(input, "name", "家庭名", HOUSEHOLD_NAME_MAX_LENGTH).trim();
  if (name.length === 0) {
    throw validationError({ name: "家庭名を入力してください。" });
  }
  return { name };
};

export const validateUpdateHouseholdInput = (value: unknown): UpdateHouseholdInput => {
  const input = asObject(value);
  const output: UpdateHouseholdInput = {};
  const details: Record<string, string> = {};

  if ("name" in input) {
    if (typeof input.name !== "string") {
      details.name = "家庭名は文字列で入力してください。";
    } else {
      const name = input.name.trim();
      if (name.length === 0) details.name = "家庭名を入力してください。";
      if (name.length > HOUSEHOLD_NAME_MAX_LENGTH) {
        details.name = `家庭名は${HOUSEHOLD_NAME_MAX_LENGTH}文字以内で入力してください。`;
      }
      if (!details.name) output.name = name;
    }
  }

  if ("weekStartsOn" in input) {
    if (
      typeof input.weekStartsOn !== "number" ||
      !Number.isInteger(input.weekStartsOn) ||
      input.weekStartsOn < 0 ||
      input.weekStartsOn > 6
    ) {
      details.weekStartsOn = "週の開始曜日は0から6の整数で指定してください。";
    } else {
      output.weekStartsOn = input.weekStartsOn;
    }
  }

  if (Object.keys(details).length > 0) {
    throw validationError(details);
  }
  if (!("name" in output) && !("weekStartsOn" in output)) {
    throw validationError({ body: "更新する項目を少なくとも1つ指定してください。" });
  }

  return output;
};

export const validateJoinHouseholdInput = (value: unknown): JoinHouseholdInput => {
  const input = asObject(value);
  const code = requiredString(input, "code", "招待コード", INVITE_CODE_MAX_LENGTH).trim();
  if (code.length === 0) {
    throw validationError({ code: "招待コードを入力してください。" });
  }
  return { code };
};
