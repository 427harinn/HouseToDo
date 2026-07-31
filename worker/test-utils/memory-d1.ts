import type {
  HouseholdRole,
  NotificationSlot,
  TaskAssignmentType,
  TaskRecurrenceType,
  TaskRecordStatus
} from "../types/domain";

const toText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  throw new Error("MemoryD1 expected a scalar bind value.");
};

const toNullableText = (value: unknown): string | null => (value === null ? null : toText(value));

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type SessionRecord = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_used_at: string;
};

export type HouseholdRecord = {
  id: string;
  name: string;
  timezone: string;
  week_starts_on: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type HouseholdMemberRecord = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  color: string | null;
  joined_at: string;
};

export type HouseholdInviteRecord = {
  id: string;
  household_id: string;
  code_hash: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
};

export type TaskDbRecord = {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  recurrence_type: TaskRecurrenceType;
  assignment_type: TaskAssignmentType;
  assigned_user_id: string | null;
  scheduled_time: string | null;
  notification_slot: NotificationSlot;
  weekly_target_count: number | null;
  active: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskWeekdayRecord = {
  task_id: string;
  weekday: number;
};

export type TaskRecordDbRecord = {
  id: string;
  household_id: string;
  task_id: string;
  target_date: string | null;
  target_week_start: string | null;
  status: TaskRecordStatus;
  acted_by: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

class MemoryPreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: MemoryD1,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  first<T = unknown>(): Promise<T | null> {
    return Promise.resolve(this.db.first(this.sql, this.values) as T | null);
  }

  all<T = unknown>(): Promise<D1Result<T>> {
    return Promise.resolve({
      success: true,
      results: this.db.all(this.sql, this.values) as T[],
      meta: {}
    } as D1Result<T>);
  }

  run(): Promise<D1Result> {
    return Promise.resolve(this.db.run(this.sql, this.values));
  }
}

export class MemoryD1 {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly households = new Map<string, HouseholdRecord>();
  readonly members = new Map<string, HouseholdMemberRecord>();
  readonly invites = new Map<string, HouseholdInviteRecord>();
  readonly tasks = new Map<string, TaskDbRecord>();
  readonly taskWeekdays = new Map<string, TaskWeekdayRecord>();
  readonly taskRecords = new Map<string, TaskRecordDbRecord>();

  prepare(sql: string): D1PreparedStatement {
    return new MemoryPreparedStatement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  first(
    sql: string,
    values: unknown[]
  ):
    | UserRecord
    | SessionRecord
    | HouseholdRecord
    | HouseholdMemberRecord
    | HouseholdInviteRecord
    | TaskDbRecord
    | TaskRecordDbRecord
    | null {
    if (sql.includes("FROM users WHERE id")) {
      return this.users.get(String(values[0])) ?? null;
    }
    if (sql.includes("FROM users WHERE email")) {
      return Array.from(this.users.values()).find((user) => user.email === values[0]) ?? null;
    }
    if (sql.includes("FROM sessions WHERE token_hash")) {
      return (
        Array.from(this.sessions.values()).find(
          (session) => session.token_hash === values[0] && session.expires_at > String(values[1])
        ) ?? null
      );
    }
    if (sql.includes("COUNT(*) AS count FROM household_members")) {
      return {
        count: Array.from(this.members.values()).filter((member) => member.user_id === values[0])
          .length
      } as unknown as HouseholdMemberRecord;
    }
    if (sql.includes("FROM households h") && sql.includes("WHERE hm.user_id")) {
      const member = Array.from(this.members.values())
        .filter((item) => item.user_id === values[0])
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0];
      const household = member ? this.households.get(member.household_id) : null;
      return household ? ({ ...household, role: member.role } as HouseholdRecord) : null;
    }
    if (sql.includes("FROM households WHERE id")) {
      return this.households.get(String(values[0])) ?? null;
    }
    if (sql.includes("FROM household_members WHERE household_id")) {
      return this.members.get(`${toText(values[0])}:${toText(values[1])}`) ?? null;
    }
    if (sql.includes("FROM household_invites WHERE code_hash")) {
      const invite =
        Array.from(this.invites.values()).find((item) => item.code_hash === values[0]) ?? null;
      if (
        invite &&
        sql.includes("expires_at >") &&
        !(invite.expires_at > String(values[1]) && invite.used_at === null)
      ) {
        return null;
      }
      return invite;
    }
    if (sql.includes("FROM tasks") && sql.includes("WHERE household_id = ? AND id = ?")) {
      const task = this.tasks.get(toText(values[1]));
      if (!task || task.household_id !== values[0]) return null;
      return task;
    }
    if (sql.includes("FROM task_records tr") && sql.includes("tr.task_id = ? AND tr.target_date")) {
      const record =
        Array.from(this.taskRecords.values()).find(
          (item) => item.task_id === values[0] && item.target_date === values[1]
        ) ?? null;
      return record ? this.withActedByName(record) : null;
    }
    if (sql.includes("FROM task_records tr") && sql.includes("tr.task_id = ? AND tr.target_week_start")) {
      const matches = Array.from(this.taskRecords.values())
        .filter(
          (item) =>
            item.task_id === values[0] &&
            item.target_week_start === values[1] &&
            (item.status === "in_progress" || item.status === "skipped")
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const record = matches.length > 0 ? matches[0] : null;
      return record ? this.withActedByName(record) : null;
    }
    if (sql.includes("FROM task_records tr") && sql.includes("WHERE tr.household_id = ? AND tr.id = ?")) {
      const record = this.taskRecords.get(toText(values[1]));
      if (!record || record.household_id !== values[0]) return null;
      return this.withActedByName(record);
    }
    return null;
  }

  all(sql: string, values: unknown[]): unknown[] {
    if (sql.includes("FROM household_members hm")) {
      return Array.from(this.members.values())
        .filter((member) => member.household_id === values[0])
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
        .map((member) => ({
          ...member,
          display_name: this.users.get(member.user_id)?.display_name ?? ""
        }));
    }
    if (sql.includes("FROM tasks") && sql.includes("WHERE household_id = ?")) {
      return Array.from(this.tasks.values())
        .filter((task) => task.household_id === values[0])
        .filter((task) => (sql.includes("AND active = 1") ? task.active === 1 : true))
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    }
    if (sql.includes("FROM task_weekdays")) {
      return Array.from(this.taskWeekdays.values())
        .filter((item) => item.task_id === values[0])
        .sort((a, b) => a.weekday - b.weekday);
    }
    if (sql.includes("FROM task_records tr") && sql.includes("tr.household_id = ? AND tr.target_date")) {
      return Array.from(this.taskRecords.values())
        .filter((item) => item.household_id === values[0] && item.target_date === values[1])
        .map((item) => this.withActedByName(item));
    }
    if (sql.includes("FROM task_records tr") && sql.includes("tr.household_id = ? AND tr.target_week_start")) {
      return Array.from(this.taskRecords.values())
        .filter((item) => item.household_id === values[0] && item.target_week_start === values[1])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((item) => this.withActedByName(item));
    }
    if (sql.includes("FROM task_records tr") && sql.includes("tr.household_id = ? AND tr.task_id = ?")) {
      return Array.from(this.taskRecords.values())
        .filter((item) => item.household_id === values[0] && item.task_id === values[1])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, Number(values[2]))
        .map((item) => this.withActedByName(item));
    }
    return [];
  }

  run(sql: string, values: unknown[]): D1Result {
    let changes = 1;

    if (sql.startsWith("INSERT INTO users")) {
      this.users.set(String(values[0]), {
        id: String(values[0]),
        email: String(values[1]),
        password_hash: String(values[2]),
        display_name: String(values[3]),
        created_at: String(values[4]),
        updated_at: String(values[5])
      });
    }
    if (sql.startsWith("INSERT INTO sessions")) {
      this.sessions.set(String(values[0]), {
        id: String(values[0]),
        user_id: String(values[1]),
        token_hash: String(values[2]),
        expires_at: String(values[3]),
        created_at: String(values[4]),
        last_used_at: String(values[5])
      });
    }
    if (sql.startsWith("DELETE FROM sessions WHERE token_hash")) {
      for (const [id, session] of this.sessions) {
        if (session.token_hash === values[0]) this.sessions.delete(id);
      }
    }
    if (sql.startsWith("INSERT INTO households")) {
      this.households.set(String(values[0]), {
        id: String(values[0]),
        name: String(values[1]),
        timezone: String(values[2]),
        week_starts_on: Number(values[3]),
        created_by: String(values[4]),
        created_at: String(values[5]),
        updated_at: String(values[6])
      });
    }
    if (sql.startsWith("INSERT INTO household_members")) {
      const key = `${toText(values[0])}:${toText(values[1])}`;
      if (this.members.has(key)) throw new Error("UNIQUE constraint failed");
      this.members.set(key, {
        household_id: String(values[0]),
        user_id: String(values[1]),
        role: values[2] as HouseholdRole,
        color: values[3] === null ? null : toText(values[3]),
        joined_at: String(values[4])
      });
    }
    if (sql.startsWith("UPDATE households")) {
      const household = this.households.get(String(values[3]));
      if (household) {
        this.households.set(household.id, {
          ...household,
          name: String(values[0]),
          week_starts_on: Number(values[1]),
          updated_at: String(values[2])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("INSERT INTO household_invites")) {
      this.invites.set(String(values[0]), {
        id: String(values[0]),
        household_id: String(values[1]),
        code_hash: String(values[2]),
        created_by: String(values[3]),
        expires_at: String(values[4]),
        used_at: null,
        used_by: null,
        created_at: String(values[5])
      });
    }
    if (sql.startsWith("UPDATE household_invites")) {
      const invite = this.invites.get(String(values[2]));
      if (invite && invite.used_at === null) {
        this.invites.set(invite.id, {
          ...invite,
          used_at: String(values[0]),
          used_by: String(values[1])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("INSERT INTO tasks")) {
      this.tasks.set(toText(values[0]), {
        id: toText(values[0]),
        household_id: toText(values[1]),
        title: toText(values[2]),
        description: toNullableText(values[3]),
        recurrence_type: values[4] as TaskRecurrenceType,
        assignment_type: values[5] as TaskAssignmentType,
        assigned_user_id: toNullableText(values[6]),
        scheduled_time: toNullableText(values[7]),
        notification_slot: values[8] as NotificationSlot,
        weekly_target_count: values[9] === null ? null : Number(values[9]),
        active: 1,
        sort_order: Number(values[10]),
        created_by: toText(values[11]),
        created_at: toText(values[12]),
        updated_at: toText(values[13])
      });
    }
    if (sql.startsWith("UPDATE tasks") && sql.includes("SET title")) {
      const task = this.tasks.get(toText(values[11]));
      if (task && task.household_id === values[10]) {
        this.tasks.set(task.id, {
          ...task,
          title: toText(values[0]),
          description: toNullableText(values[1]),
          recurrence_type: values[2] as TaskRecurrenceType,
          assignment_type: values[3] as TaskAssignmentType,
          assigned_user_id: toNullableText(values[4]),
          scheduled_time: toNullableText(values[5]),
          notification_slot: values[6] as NotificationSlot,
          weekly_target_count: values[7] === null ? null : Number(values[7]),
          sort_order: Number(values[8]),
          updated_at: toText(values[9])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("UPDATE tasks") && sql.includes("active = 0")) {
      const task = this.tasks.get(toText(values[2]));
      if (task && task.household_id === values[1]) {
        this.tasks.set(task.id, { ...task, active: 0, updated_at: toText(values[0]) });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("INSERT INTO task_weekdays")) {
      this.taskWeekdays.set(`${toText(values[0])}:${toText(values[1])}`, {
        task_id: toText(values[0]),
        weekday: Number(values[1])
      });
    }
    if (sql.startsWith("DELETE FROM task_weekdays")) {
      for (const [key, item] of this.taskWeekdays) {
        if (item.task_id === values[0]) this.taskWeekdays.delete(key);
      }
    }
    if (sql.startsWith("INSERT INTO task_records")) {
      this.taskRecords.set(toText(values[0]), {
        id: toText(values[0]),
        household_id: toText(values[1]),
        task_id: toText(values[2]),
        target_date: toNullableText(values[3]),
        target_week_start: toNullableText(values[4]),
        status: values[5] as TaskRecordStatus,
        acted_by: toText(values[6]),
        started_at: toNullableText(values[7]),
        completed_at: toNullableText(values[8]),
        skipped_at: toNullableText(values[9]),
        note: toNullableText(values[10]),
        created_at: toText(values[11]),
        updated_at: toText(values[12])
      });
    }
    if (sql.startsWith("UPDATE task_records")) {
      const id = sql.includes("WHERE household_id = ? AND id = ?")
        ? toText(values[8])
        : toText(values[7]);
      const record = this.taskRecords.get(id);
      if (record && (!sql.includes("WHERE household_id = ? AND id = ?") || record.household_id === values[7])) {
        this.taskRecords.set(id, {
          ...record,
          status: values[0] as TaskRecordStatus,
          acted_by: toText(values[1]),
          started_at: toNullableText(values[2]),
          completed_at: toNullableText(values[3]),
          skipped_at: toNullableText(values[4]),
          note: toNullableText(values[5]),
          updated_at: toText(values[6])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("DELETE FROM task_records")) {
      const before = this.taskRecords.size;
      for (const [id, record] of this.taskRecords) {
        const dateMatches = sql.includes("target_date") && record.target_date === values[2];
        const weekMatches = sql.includes("target_week_start") && record.target_week_start === values[2];
        if (record.household_id === values[0] && record.task_id === values[1] && (dateMatches || weekMatches)) {
          this.taskRecords.delete(id);
        }
      }
      changes = before - this.taskRecords.size;
    }

    return { success: true, meta: { changes } } as D1Result;
  }

  private withActedByName(record: TaskRecordDbRecord) {
    return {
      ...record,
      acted_by_display_name: this.users.get(record.acted_by)?.display_name ?? null
    };
  }
}
