import type {
  NotificationSlot,
  Task,
  TaskAssignmentType,
  TaskRecurrenceType
} from "../types/domain";

type TaskRow = {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  recurrence_type: TaskRecurrenceType;
  assignment_type: TaskAssignmentType;
  assigned_user_id: string | null;
  scheduled_time: string | null;
  notification_slot: NotificationSlot;
  notification_time: string | null;
  weekly_target_count: number | null;
  active: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskCreateRecordInput = {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  recurrenceType: TaskRecurrenceType;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  scheduledTime: string | null;
  notificationSlot: NotificationSlot;
  notificationTime?: string | null;
  weeklyTargetCount: number | null;
  sortOrder: number;
  createdBy: string;
  now: string;
};

export type TaskUpdateRecordInput = Omit<
  TaskCreateRecordInput,
  "id" | "householdId" | "createdBy" | "sortOrder"
> & {
  sortOrder?: number;
};

const toTask = (row: TaskRow, weekdays: number[] = []): Task => ({
  id: row.id,
  householdId: row.household_id,
  title: row.title,
  description: row.description,
  recurrenceType: row.recurrence_type,
  assignmentType: row.assignment_type,
  assignedUserId: row.assigned_user_id,
  scheduledTime: row.scheduled_time,
  notificationSlot: row.notification_slot,
  notificationTime: row.notification_time ?? null,
  weeklyTargetCount: row.weekly_target_count,
  active: row.active === 1,
  sortOrder: row.sort_order,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  weekdays
});

export class TaskRepository {
  constructor(private readonly db: D1Database) {}

  private async attachWeekdays(rows: TaskRow[]): Promise<Task[]> {
    const tasks = rows.map((row) => toTask(row));
    for (const task of tasks) {
      task.weekdays = await this.listWeekdays(task.id);
    }
    return tasks;
  }

  async listByHouseholdId(
    householdId: string,
    options: { includeInactive?: boolean } = {}
  ): Promise<Task[]> {
    const sql = `SELECT id, household_id, title, description, recurrence_type, assignment_type,
       assigned_user_id, scheduled_time, notification_slot, notification_time, weekly_target_count, active, sort_order,
       created_by, created_at, updated_at
       FROM tasks
       WHERE household_id = ? ${options.includeInactive ? "" : "AND active = 1"}
       ORDER BY sort_order ASC, created_at ASC`;
    const result = await this.db.prepare(sql).bind(householdId).all<TaskRow>();
    return this.attachWeekdays(result.results ?? []);
  }

  async findByIdForHousehold(householdId: string, taskId: string): Promise<Task | null> {
    const row = await this.db
      .prepare(
        `SELECT id, household_id, title, description, recurrence_type, assignment_type,
         assigned_user_id, scheduled_time, notification_slot, notification_time, weekly_target_count, active, sort_order,
         created_by, created_at, updated_at
         FROM tasks
         WHERE household_id = ? AND id = ?`
      )
      .bind(householdId, taskId)
      .first<TaskRow>();
    if (!row) return null;
    return toTask(row, await this.listWeekdays(taskId));
  }

  async listWeekdays(taskId: string): Promise<number[]> {
    const result = await this.db
      .prepare("SELECT weekday FROM task_weekdays WHERE task_id = ? ORDER BY weekday ASC")
      .bind(taskId)
      .all<{ weekday: number }>();
    return (result.results ?? []).map((row) => row.weekday);
  }

  prepareCreate(input: TaskCreateRecordInput): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO tasks (
          id, household_id, title, description, recurrence_type, assignment_type, assigned_user_id,
          scheduled_time, notification_slot, notification_time, weekly_target_count, active, sort_order, created_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.householdId,
        input.title,
        input.description,
        input.recurrenceType,
        input.assignmentType,
        input.assignedUserId,
        input.scheduledTime,
        input.notificationSlot,
        input.notificationTime,
        input.weeklyTargetCount,
        input.sortOrder,
        input.createdBy,
        input.now,
        input.now
      );
  }

  async create(input: TaskCreateRecordInput, weekdays: number[]): Promise<Task> {
    await this.db.batch([
      this.prepareCreate(input),
      ...weekdays.map((weekday) => this.prepareAddWeekday(input.id, weekday))
    ]);
    return (await this.findByIdForHousehold(input.householdId, input.id))!;
  }

  async update(householdId: string, taskId: string, input: TaskUpdateRecordInput): Promise<Task | null> {
    const current = await this.findByIdForHousehold(householdId, taskId);
    if (!current) return null;
    await this.db
      .prepare(
        `UPDATE tasks
         SET title = ?, description = ?, recurrence_type = ?, assignment_type = ?, assigned_user_id = ?,
             scheduled_time = ?, notification_slot = ?, notification_time = ?, weekly_target_count = ?, sort_order = ?, updated_at = ?
         WHERE household_id = ? AND id = ?`
      )
      .bind(
        input.title,
        input.description,
        input.recurrenceType,
        input.assignmentType,
        input.assignedUserId,
        input.scheduledTime,
        input.notificationSlot,
        input.notificationTime,
        input.weeklyTargetCount,
        input.sortOrder ?? current.sortOrder,
        input.now,
        householdId,
        taskId
      )
      .run();
    return this.findByIdForHousehold(householdId, taskId);
  }

  async deactivate(householdId: string, taskId: string, updatedAt: string): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE tasks SET active = 0, updated_at = ? WHERE household_id = ? AND id = ?")
      .bind(updatedAt, householdId, taskId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  prepareAddWeekday(taskId: string, weekday: number): D1PreparedStatement {
    return this.db
      .prepare("INSERT INTO task_weekdays (task_id, weekday) VALUES (?, ?)")
      .bind(taskId, weekday);
  }

  async replaceWeekdays(taskId: string, weekdays: number[]): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM task_weekdays WHERE task_id = ?").bind(taskId),
      ...weekdays.map((weekday) => this.prepareAddWeekday(taskId, weekday))
    ]);
  }
}
