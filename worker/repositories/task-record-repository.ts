import type { TaskRecord, TaskRecordStatus } from "../types/domain";

type TaskRecordRow = {
  id: string;
  household_id: string;
  task_id: string;
  target_date: string | null;
  target_week_start: string | null;
  occurrence_key: string | null;
  period_key: string | null;
  status: TaskRecordStatus;
  acted_by: string;
  acted_by_display_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  note: string | null;
  task_title_snapshot: string | null;
  assigned_user_id_snapshot: string | null;
  assigned_user_display_name_snapshot: string | null;
  assigned_user_color_snapshot: string | null;
  assigned_user_avatar_url_snapshot: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordStateInput = {
  id: string;
  householdId: string;
  taskId: string;
  targetDate: string | null;
  targetWeekStart: string | null;
  occurrenceKey?: string | null;
  periodKey?: string | null;
  status: TaskRecordStatus;
  actedBy: string;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  note: string | null;
  taskTitleSnapshot?: string | null;
  assignedUserIdSnapshot?: string | null;
  assignedUserDisplayNameSnapshot?: string | null;
  assignedUserColorSnapshot?: string | null;
  assignedUserAvatarUrlSnapshot?: string | null;
  now: string;
};

const selectRecord = `tr.id, tr.household_id, tr.task_id, tr.target_date, tr.target_week_start,
  tr.occurrence_key, tr.period_key, tr.status, tr.acted_by, u.display_name AS acted_by_display_name, tr.started_at, tr.completed_at,
  tr.skipped_at, tr.note, tr.task_title_snapshot, tr.assigned_user_id_snapshot,
  tr.assigned_user_display_name_snapshot, tr.assigned_user_color_snapshot,
  tr.assigned_user_avatar_url_snapshot, tr.created_at, tr.updated_at`;

const toRecord = (row: TaskRecordRow | null): TaskRecord | null =>
  row
    ? {
        id: row.id,
        householdId: row.household_id,
        taskId: row.task_id,
        targetDate: row.target_date,
        targetWeekStart: row.target_week_start,
        occurrenceKey: row.occurrence_key ?? null,
        periodKey: row.period_key ?? null,
        status: row.status,
        actedBy: row.acted_by,
        actedByDisplayName: row.acted_by_display_name,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        skippedAt: row.skipped_at,
        note: row.note,
        taskTitleSnapshot: row.task_title_snapshot ?? null,
        assignedUserIdSnapshot: row.assigned_user_id_snapshot ?? null,
        assignedUserDisplayNameSnapshot: row.assigned_user_display_name_snapshot ?? null,
        assignedUserColorSnapshot: row.assigned_user_color_snapshot ?? null,
        assignedUserAvatarUrlSnapshot: row.assigned_user_avatar_url_snapshot ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    : null;

export class TaskRecordRepository {
  constructor(private readonly db: D1Database) {}

  async findDailyRecord(taskId: string, targetDate: string): Promise<TaskRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${selectRecord}
         FROM task_records tr
         LEFT JOIN users u ON u.id = tr.acted_by
         WHERE tr.task_id = ? AND tr.target_date = ?
         LIMIT 1`
      )
      .bind(taskId, targetDate)
      .first<TaskRecordRow>();
    return toRecord(row);
  }

  async findByOccurrenceKey(taskId: string, occurrenceKey: string): Promise<TaskRecord | null> {
    const row = await this.db.prepare(`SELECT ${selectRecord} FROM task_records tr LEFT JOIN users u ON u.id = tr.acted_by WHERE tr.task_id = ? AND tr.occurrence_key = ? ORDER BY tr.updated_at DESC LIMIT 1`).bind(taskId, occurrenceKey).first<TaskRecordRow>();
    return toRecord(row);
  }

  async listByPeriodKey(taskId: string, periodKey: string): Promise<TaskRecord[]> {
    const result = await this.db.prepare(`SELECT ${selectRecord} FROM task_records tr LEFT JOIN users u ON u.id = tr.acted_by WHERE tr.task_id = ? AND tr.period_key = ? ORDER BY tr.updated_at DESC`).bind(taskId, periodKey).all<TaskRecordRow>();
    return (result.results ?? []).map((row) => toRecord(row)!);
  }

  async listByPeriodKeys(householdId: string, periodKeys: string[]): Promise<TaskRecord[]> {
    if (periodKeys.length === 0) return [];
    const placeholders = periodKeys.map(() => "?").join(", ");
    const result = await this.db.prepare(`SELECT ${selectRecord} FROM task_records tr LEFT JOIN users u ON u.id = tr.acted_by WHERE tr.household_id = ? AND tr.period_key IN (${placeholders}) ORDER BY tr.updated_at DESC`).bind(householdId, ...periodKeys).all<TaskRecordRow>();
    return (result.results ?? []).map((row) => toRecord(row)!);
  }

  async listCalendarRecords(householdId: string, from: string, to: string, periodKeys: string[]): Promise<TaskRecord[]> {
    const periodClause = periodKeys.length > 0
      ? ` OR tr.period_key IN (${periodKeys.map(() => "?").join(", ")})`
      : "";
    const result = await this.db.prepare(
      `SELECT ${selectRecord}
       FROM task_records tr
       LEFT JOIN users u ON u.id = tr.acted_by
       WHERE tr.household_id = ?
         AND (tr.target_date >= ? AND tr.target_date <= ?${periodClause})
       ORDER BY tr.updated_at DESC`
    ).bind(householdId, from, to, ...periodKeys).all<TaskRecordRow>();
    return (result.results ?? []).map((row) => toRecord(row)!);
  }

  async findWeeklyOpenRecord(taskId: string, targetWeekStart: string): Promise<TaskRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${selectRecord}
         FROM task_records tr
         LEFT JOIN users u ON u.id = tr.acted_by
         WHERE tr.task_id = ? AND tr.target_week_start = ? AND tr.status IN ('in_progress', 'skipped')
         ORDER BY tr.updated_at DESC
         LIMIT 1`
      )
      .bind(taskId, targetWeekStart)
      .first<TaskRecordRow>();
    return toRecord(row);
  }

  async listDailyRecords(householdId: string, targetDate: string): Promise<TaskRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectRecord}
         FROM task_records tr
         LEFT JOIN users u ON u.id = tr.acted_by
         WHERE tr.household_id = ? AND tr.target_date = ?`
      )
      .bind(householdId, targetDate)
      .all<TaskRecordRow>();
    return (result.results ?? []).map((row) => toRecord(row)!);
  }

  async listByHouseholdId(householdId: string): Promise<TaskRecord[]> {
    const result = await this.db
      .prepare(`SELECT ${selectRecord} FROM task_records tr LEFT JOIN users u ON u.id = tr.acted_by
        WHERE tr.household_id = ? ORDER BY tr.updated_at DESC`)
      .bind(householdId)
      .all<TaskRecordRow>();
    return (result.results ?? []).map((row) => toRecord(row)!);
  }

  async listWeeklyRecords(householdId: string, targetWeekStart: string): Promise<TaskRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectRecord}
         FROM task_records tr
         LEFT JOIN users u ON u.id = tr.acted_by
         WHERE tr.household_id = ? AND tr.target_week_start = ?
         ORDER BY tr.updated_at DESC`
      )
      .bind(householdId, targetWeekStart)
      .all<TaskRecordRow>();
    return (result.results ?? []).map((row) => toRecord(row)!);
  }

  async upsertDailyState(input: RecordStateInput): Promise<TaskRecord> {
    const existing = await this.findDailyRecord(input.taskId, input.targetDate!);
    if (existing) {
      await this.db
        .prepare(
          `UPDATE task_records
           SET status = ?, acted_by = ?, started_at = ?, completed_at = ?, skipped_at = ?,
               note = ?, task_title_snapshot = ?,
               assigned_user_id_snapshot = ?,
               assigned_user_display_name_snapshot = ?,
               assigned_user_color_snapshot = ?,
               assigned_user_avatar_url_snapshot = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(
          input.status,
          input.actedBy,
          input.startedAt,
          input.completedAt,
          input.skippedAt,
          input.note,
          input.taskTitleSnapshot ?? null,
          input.assignedUserIdSnapshot ?? null,
          input.assignedUserDisplayNameSnapshot ?? null,
          input.assignedUserColorSnapshot ?? null,
          input.assignedUserAvatarUrlSnapshot ?? null,
          input.now,
          existing.id
        )
        .run();
      return (await this.findDailyRecord(input.taskId, input.targetDate!))!;
    }

    await this.insert(input);
    return (await this.findDailyRecord(input.taskId, input.targetDate!))!;
  }

  async createWeeklyRecord(input: RecordStateInput): Promise<TaskRecord> {
    await this.insert(input);
    return (await this.findById(input.householdId, input.id))!;
  }

  async updateById(householdId: string, id: string, input: RecordStateInput): Promise<TaskRecord | null> {
    const result = await this.db
      .prepare(
        `UPDATE task_records
         SET status = ?, acted_by = ?, started_at = ?, completed_at = ?, skipped_at = ?,
             note = ?, task_title_snapshot = ?,
             assigned_user_id_snapshot = ?,
             assigned_user_display_name_snapshot = ?,
             assigned_user_color_snapshot = ?,
             assigned_user_avatar_url_snapshot = ?,
             updated_at = ?
         WHERE household_id = ? AND id = ?`
      )
      .bind(
        input.status,
        input.actedBy,
        input.startedAt,
        input.completedAt,
        input.skippedAt,
        input.note,
        input.taskTitleSnapshot ?? null,
        input.assignedUserIdSnapshot ?? null,
        input.assignedUserDisplayNameSnapshot ?? null,
        input.assignedUserColorSnapshot ?? null,
        input.assignedUserAvatarUrlSnapshot ?? null,
        input.now,
        householdId,
        id
      )
      .run();
    if ((result.meta.changes ?? 0) === 0) return null;
    return this.findById(householdId, id);
  }

  async insert(input: RecordStateInput): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO task_records (
          id, household_id, task_id, target_date, target_week_start, occurrence_key, period_key,
          status, acted_by, started_at, completed_at, skipped_at, note,
          task_title_snapshot, assigned_user_id_snapshot, assigned_user_display_name_snapshot,
          assigned_user_color_snapshot, assigned_user_avatar_url_snapshot, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.householdId,
        input.taskId,
        input.targetDate,
        input.targetWeekStart,
        input.occurrenceKey ?? null,
        input.periodKey ?? null,
        input.status,
        input.actedBy,
        input.startedAt,
        input.completedAt,
        input.skippedAt,
        input.note,
        input.taskTitleSnapshot ?? null,
        input.assignedUserIdSnapshot ?? null,
        input.assignedUserDisplayNameSnapshot ?? null,
        input.assignedUserColorSnapshot ?? null,
        input.assignedUserAvatarUrlSnapshot ?? null,
        input.now,
        input.now
      )
      .run();
  }

  async deleteByScope(
    householdId: string,
    taskId: string,
    scope: { targetDate?: string; targetWeekStart?: string; occurrenceKey?: string; periodKey?: string }
  ): Promise<boolean> {
    const result = scope.occurrenceKey
      ? await this.db.prepare("DELETE FROM task_records WHERE household_id = ? AND task_id = ? AND occurrence_key = ?").bind(householdId, taskId, scope.occurrenceKey).run()
      : scope.periodKey
      ? await this.db.prepare("DELETE FROM task_records WHERE household_id = ? AND task_id = ? AND period_key = ?").bind(householdId, taskId, scope.periodKey).run()
      : scope.targetDate
      ? await this.db
          .prepare("DELETE FROM task_records WHERE household_id = ? AND task_id = ? AND target_date = ?")
          .bind(householdId, taskId, scope.targetDate)
          .run()
      : await this.db
          .prepare(
            "DELETE FROM task_records WHERE household_id = ? AND task_id = ? AND target_week_start = ?"
          )
          .bind(householdId, taskId, scope.targetWeekStart)
          .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async deleteById(householdId: string, taskId: string, id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM task_records WHERE household_id = ? AND task_id = ? AND id = ?")
      .bind(householdId, taskId, id)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async findById(householdId: string, id: string): Promise<TaskRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${selectRecord}
         FROM task_records tr
         LEFT JOIN users u ON u.id = tr.acted_by
         WHERE tr.household_id = ? AND tr.id = ?`
      )
      .bind(householdId, id)
      .first<TaskRecordRow>();
    return toRecord(row);
  }

  async listHistory(householdId: string, taskId: string, limit: number): Promise<TaskRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT ${selectRecord}
         FROM task_records tr
         LEFT JOIN users u ON u.id = tr.acted_by
         WHERE tr.household_id = ? AND tr.task_id = ?
         ORDER BY tr.updated_at DESC
         LIMIT ?`
      )
      .bind(householdId, taskId, limit)
      .all<TaskRecordRow>();
    return (result.results ?? []).map((row) => toRecord(row)!);
  }
}
