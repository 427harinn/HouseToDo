import type { MonthlyDeadlineType, TaskAssignmentType, TaskExecutionTiming, TaskModelRecurrenceType, TaskTemplate } from "../types/domain";

type TaskTemplateRow = {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  model_recurrence_type: TaskModelRecurrenceType;
  execution_timing: TaskExecutionTiming | null;
  deadline_date: string | null;
  assignment_type: TaskAssignmentType;
  assigned_user_id: string | null;
  weekdays_json: string;
  deadline_time: string | null;
  notification_offset_minutes: number | null;
  weekly_deadline_weekday: number | null;
  monthly_day_of_month: number | null;
  monthly_deadline_type: MonthlyDeadlineType | null;
  active: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskTemplateCreateInput = Omit<TaskTemplate, "active" | "createdAt" | "updatedAt" | "householdId" | "id" | "sortOrder"> & {
  id: string;
  householdId: string;
  sortOrder: number;
  now: string;
};

export type TaskTemplateUpdateInput = Partial<Omit<TaskTemplateCreateInput, "id" | "householdId" | "sortOrder" | "now" | "createdBy">> & {
  now: string;
};

const parseWeekdays = (value: string): number[] => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => Number.isInteger(item)) ? parsed as number[] : [];
  } catch {
    return [];
  }
};

const toTemplate = (row: TaskTemplateRow | null): TaskTemplate | null => row ? ({
  id: row.id,
  householdId: row.household_id,
  title: row.title,
  description: row.description,
  modelRecurrenceType: row.model_recurrence_type,
  executionTiming: row.execution_timing ?? null,
  deadlineDate: row.deadline_date ?? null,
  assignmentType: row.assignment_type,
  assignedUserId: row.assigned_user_id,
  weekdays: parseWeekdays(row.weekdays_json),
  deadlineTime: row.deadline_time,
  notificationOffsetMinutes: row.notification_offset_minutes,
  weeklyDeadlineWeekday: row.weekly_deadline_weekday,
  monthlyDayOfMonth: row.monthly_day_of_month,
  monthlyDeadlineType: row.monthly_deadline_type,
  active: row.active === 1,
  sortOrder: row.sort_order,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const columns = `id, household_id, title, description, model_recurrence_type, assignment_type,
  assigned_user_id, weekdays_json, execution_timing, deadline_date, deadline_time, notification_offset_minutes,
  weekly_deadline_weekday, monthly_day_of_month, monthly_deadline_type,
  active, sort_order, created_by, created_at, updated_at`;

export class TaskTemplateRepository {
  constructor(private readonly db: D1Database) {}

  async listByHouseholdId(householdId: string, options: { includeInactive?: boolean } = {}): Promise<TaskTemplate[]> {
    const result = await this.db.prepare(
      `SELECT ${columns} FROM task_templates WHERE household_id = ? ${options.includeInactive ? "" : "AND active = 1"} ORDER BY sort_order ASC, created_at ASC`
    ).bind(householdId).all<TaskTemplateRow>();
    return (result.results ?? []).map((row) => toTemplate(row)!);
  }

  async findByIdForHousehold(householdId: string, templateId: string): Promise<TaskTemplate | null> {
    const row = await this.db.prepare(
      `SELECT ${columns} FROM task_templates WHERE household_id = ? AND id = ?`
    ).bind(householdId, templateId).first<TaskTemplateRow>();
    return toTemplate(row);
  }

  async getNextSortOrder(householdId: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM task_templates WHERE household_id = ?"
    ).bind(householdId).first<{ max_sort_order: number }>();
    return Number(row?.max_sort_order ?? 0) + 1;
  }

  async create(input: TaskTemplateCreateInput): Promise<TaskTemplate> {
    await this.db.prepare(
      `INSERT INTO task_templates (
        id, household_id, title, description, model_recurrence_type, assignment_type,
        assigned_user_id, weekdays_json, execution_timing, deadline_date, deadline_time, notification_offset_minutes,
        weekly_deadline_weekday, monthly_day_of_month, monthly_deadline_type,
        active, sort_order, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).bind(
      input.id, input.householdId, input.title, input.description, input.modelRecurrenceType,
      input.assignmentType, input.assignedUserId, JSON.stringify(input.weekdays), input.executionTiming ?? null, input.deadlineDate ?? null, input.deadlineTime,
      input.notificationOffsetMinutes, input.weeklyDeadlineWeekday, input.monthlyDayOfMonth,
      input.monthlyDeadlineType, input.sortOrder, input.createdBy, input.now, input.now
    ).run();
    return (await this.findByIdForHousehold(input.householdId, input.id))!;
  }

  async update(householdId: string, templateId: string, input: TaskTemplateUpdateInput): Promise<TaskTemplate | null> {
    const current = await this.findByIdForHousehold(householdId, templateId);
    if (!current) return null;
    await this.db.prepare(
      `UPDATE task_templates SET title = ?, description = ?, model_recurrence_type = ?, assignment_type = ?,
       assigned_user_id = ?, weekdays_json = ?, execution_timing = ?, deadline_date = ?, deadline_time = ?, notification_offset_minutes = ?,
       weekly_deadline_weekday = ?, monthly_day_of_month = ?, monthly_deadline_type = ?, updated_at = ?
       WHERE household_id = ? AND id = ?`
    ).bind(
      input.title ?? current.title, "description" in input ? input.description ?? null : current.description,
      input.modelRecurrenceType ?? current.modelRecurrenceType, input.assignmentType ?? current.assignmentType,
      input.assignedUserId === undefined ? current.assignedUserId : input.assignedUserId,
      JSON.stringify(input.weekdays ?? current.weekdays), input.executionTiming === undefined ? current.executionTiming : input.executionTiming,
      input.deadlineDate === undefined ? current.deadlineDate : input.deadlineDate,
      input.deadlineTime === undefined ? current.deadlineTime : input.deadlineTime,
      input.notificationOffsetMinutes === undefined ? current.notificationOffsetMinutes : input.notificationOffsetMinutes,
      input.weeklyDeadlineWeekday === undefined ? current.weeklyDeadlineWeekday : input.weeklyDeadlineWeekday,
      input.monthlyDayOfMonth === undefined ? current.monthlyDayOfMonth : input.monthlyDayOfMonth,
      input.monthlyDeadlineType === undefined ? current.monthlyDeadlineType : input.monthlyDeadlineType,
      input.now, householdId, templateId
    ).run();
    return this.findByIdForHousehold(householdId, templateId);
  }

  async deactivate(householdId: string, templateId: string, updatedAt: string): Promise<boolean> {
    const result = await this.db.prepare(
      "UPDATE task_templates SET active = 0, updated_at = ? WHERE household_id = ? AND id = ?"
    ).bind(updatedAt, householdId, templateId).run();
    return (result.meta.changes ?? 0) > 0;
  }
}
