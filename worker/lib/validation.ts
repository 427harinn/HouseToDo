import {
  EMAIL_MAX_LENGTH,
  HOUSEHOLD_NAME_MAX_LENGTH,
  INVITE_CODE_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from "./constants";
import { validationError } from "./errors";
import { isValidDateKey } from "./date-time";
import type {
  NotificationSlot,
  TaskAssignmentType,
  TaskRecurrenceType
} from "../types/domain";

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

export type TaskWriteInput = {
  title: string;
  description: string | null;
  recurrenceType: TaskRecurrenceType;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  scheduledTime: string | null;
  notificationSlot: NotificationSlot;
  weekdays: number[];
  weeklyTargetCount: number | null;
};

export type TaskStateInput = {
  targetDate?: string;
  targetWeekStart?: string;
  note?: string | null;
};

const recurrenceTypes = new Set(["daily", "scheduled", "weekly"]);
const assignmentTypes = new Set(["anyone", "specific"]);
const notificationSlots = new Set(["morning", "night", "none"]);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const optionalString = (
  input: Record<string, unknown>,
  key: string,
  maxLength: number
): string | null => {
  const value = input[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw validationError({ [key]: `${key} must be a string.` });
  if (value.length > maxLength) {
    throw validationError({ [key]: `${key} must be ${maxLength} characters or fewer.` });
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const validateWeekdays = (value: unknown): number[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw validationError({ weekdays: "weekdays must be an array." });
  const seen = new Set<number>();
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item > 6) {
      throw validationError({ weekdays: "weekdays must contain integers from 0 to 6." });
    }
    if (seen.has(item)) throw validationError({ weekdays: "weekdays must not contain duplicates." });
    seen.add(item);
  }
  return Array.from(seen).sort((a, b) => a - b);
};

export const validateTaskWriteInput = (value: unknown): TaskWriteInput => {
  const input = asObject(value);
  const title = requiredString(input, "title", "title", 100).trim();
  const recurrenceType = input.recurrenceType;
  const assignmentType = input.assignmentType ?? "anyone";
  const notificationSlot = input.notificationSlot ?? "none";
  const scheduledTime =
    input.scheduledTime === undefined || input.scheduledTime === null
      ? null
      : typeof input.scheduledTime === "string"
        ? input.scheduledTime.trim()
        : input.scheduledTime;
  const assignedUserId =
    input.assignedUserId === undefined || input.assignedUserId === null
      ? null
      : typeof input.assignedUserId === "string"
        ? input.assignedUserId.trim()
        : input.assignedUserId;
  const weekdays = validateWeekdays(input.weekdays);
  const weeklyTargetCount = input.weeklyTargetCount;
  const details: Record<string, string> = {};

  if (title.length === 0) details.title = "title is required.";
  if (typeof recurrenceType !== "string" || !recurrenceTypes.has(recurrenceType)) {
    details.recurrenceType = "recurrenceType must be daily, scheduled, or weekly.";
  }
  if (typeof assignmentType !== "string" || !assignmentTypes.has(assignmentType)) {
    details.assignmentType = "assignmentType must be anyone or specific.";
  }
  if (typeof notificationSlot !== "string" || !notificationSlots.has(notificationSlot)) {
    details.notificationSlot = "notificationSlot must be morning, night, or none.";
  }
  if (scheduledTime !== null && typeof scheduledTime !== "string") {
    details.scheduledTime = "scheduledTime must be HH:mm.";
  } else if (scheduledTime !== null && !timePattern.test(scheduledTime)) {
    details.scheduledTime = "scheduledTime must be HH:mm.";
  }
  if (assignedUserId !== null && typeof assignedUserId !== "string") {
    details.assignedUserId = "assignedUserId must be a string.";
  } else if (assignmentType === "specific" && !assignedUserId) {
    details.assignedUserId = "assignedUserId is required for specific assignment.";
  }
  if (assignmentType === "anyone" && assignedUserId) {
    details.assignedUserId = "assignedUserId must be null for anyone assignment.";
  }

  let normalizedWeeklyTargetCount: number | null = null;
  if (recurrenceType === "scheduled" && weekdays.length === 0) {
    details.weekdays = "scheduled tasks require at least one weekday.";
  }
  if (recurrenceType !== "scheduled" && weekdays.length > 0) {
    details.weekdays = "weekdays are only allowed for scheduled tasks.";
  }
  if (recurrenceType === "weekly") {
    if (
      typeof weeklyTargetCount !== "number" ||
      !Number.isInteger(weeklyTargetCount) ||
      weeklyTargetCount < 1 ||
      weeklyTargetCount > 7
    ) {
      details.weeklyTargetCount = "weeklyTargetCount must be an integer from 1 to 7.";
    } else {
      normalizedWeeklyTargetCount = weeklyTargetCount;
    }
  } else if (weeklyTargetCount !== undefined && weeklyTargetCount !== null) {
    details.weeklyTargetCount = "weeklyTargetCount is only allowed for weekly tasks.";
  }

  if (Object.keys(details).length > 0) throw validationError(details);

  return {
    title,
    description: optionalString(input, "description", 1000),
    recurrenceType: recurrenceType as TaskRecurrenceType,
    assignmentType: assignmentType as TaskAssignmentType,
    assignedUserId: typeof assignedUserId === "string" && assignedUserId.length > 0 ? assignedUserId : null,
    scheduledTime: typeof scheduledTime === "string" ? scheduledTime : null,
    notificationSlot: notificationSlot as NotificationSlot,
    weekdays,
    weeklyTargetCount: normalizedWeeklyTargetCount
  };
};

export const validateTaskStateInput = (value: unknown): TaskStateInput => {
  const input = asObject(value);
  const output: TaskStateInput = {};
  if (typeof input.targetDate === "string") output.targetDate = input.targetDate;
  if (typeof input.targetWeekStart === "string") output.targetWeekStart = input.targetWeekStart;
  if (output.targetDate && !isValidDateKey(output.targetDate)) {
    throw validationError({ targetDate: "targetDate must be YYYY-MM-DD." });
  }
  if (output.targetWeekStart && !isValidDateKey(output.targetWeekStart)) {
    throw validationError({ targetWeekStart: "targetWeekStart must be YYYY-MM-DD." });
  }
  output.note = optionalString(input, "note", 500);
  return output;
};

export const validateDateQuery = (request: Request, key: "date" | "weekStart"): string | null => {
  const value = new URL(request.url).searchParams.get(key);
  if (value === null) return null;
  if (!isValidDateKey(value)) throw validationError({ [key]: `${key} must be YYYY-MM-DD.` });
  return value;
};

export const validateIncludeInactive = (request: Request): boolean => {
  const value = new URL(request.url).searchParams.get("includeInactive");
  if (value === null) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw validationError({ includeInactive: "includeInactive must be true or false." });
};

export const validateLimitQuery = (request: Request, defaultLimit = 20, maxLimit = 100): number => {
  const value = new URL(request.url).searchParams.get("limit");
  if (value === null) return defaultLimit;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxLimit) {
    throw validationError({ limit: `limit must be an integer from 1 to ${maxLimit}.` });
  }
  return parsed;
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
