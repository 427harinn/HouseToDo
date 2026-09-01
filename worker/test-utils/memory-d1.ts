import type {
  HouseholdRole,
  NotificationSlot,
  TaskAssignmentType,
  TaskRecurrenceType,
  TaskRecordStatus
} from "../types/domain";
import type { ShoppingItemStatus } from "../types/domain";

const toText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  throw new Error("MemoryD1 expected a scalar bind value.");
};

const toNullableText = (value: unknown): string | null =>
  value === null ? null : toText(value);

export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  avatar_type?: string | null;
  avatar_value?: string | null;
  avatar_size_bytes?: number | null;
  avatar_width?: number | null;
  avatar_height?: number | null;
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
  model_recurrence_type?: Exclude<TaskRecurrenceType, "scheduled" | "weekly"> | null;
  assignment_type: TaskAssignmentType;
  assigned_user_id: string | null;
  scheduled_time: string | null;
  notification_slot: NotificationSlot;
  notification_time: string | null;
  weekly_target_count: number | null;
  start_date?: string | null;
  target_date?: string | null;
  deadline_time?: string | null;
  notification_offset_minutes?: number | null;
  weekly_deadline_weekday?: number | null;
  monthly_day_of_month?: number | null;
  monthly_deadline_type?: "month_end" | "day_of_month" | null;
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
  occurrence_key?: string | null;
  period_key?: string | null;
  calendar_action_date?: string | null;
  status: TaskRecordStatus;
  acted_by: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  note: string | null;
  task_title_snapshot?: string | null;
  assigned_user_id_snapshot?: string | null;
  assigned_user_display_name_snapshot?: string | null;
  assigned_user_color_snapshot?: string | null;
  assigned_user_avatar_url_snapshot?: string | null;
  created_at: string;
  updated_at: string;
};

export type ShoppingItemDbRecord = {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  planned_purchase_date?: string | null;
  status: ShoppingItemStatus;
  added_by: string;
  purchased_by: string | null;
  purchased_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ShoppingTemplateDbRecord = {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  active: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskTemplateDbRecord = {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  model_recurrence_type: Exclude<
    TaskRecurrenceType,
    "scheduled" | "weekly" | "model_only"
  >;
  assignment_type: TaskAssignmentType;
  assigned_user_id: string | null;
  weekdays_json: string;
  deadline_time: string | null;
  notification_offset_minutes: number | null;
  weekly_deadline_weekday: number | null;
  monthly_day_of_month: number | null;
  monthly_deadline_type: "month_end" | "day_of_month" | null;
  active: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ShoppingItemImageDbRecord = {
  id: string;
  shopping_item_id: string;
  household_id: string;
  r2_key: string;
  content_type: "image/webp";
  size_bytes: number;
  width: number;
  height: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type OrphanR2ObjectDbRecord = {
  id: string;
  r2_key: string;
  source_type: string;
  source_id: string | null;
  household_id: string | null;
  byte_size: number | null;
  reason: string;
  status: string;
  attempt_count: number;
  first_failed_at: string;
  last_attempted_at: string | null;
  next_attempt_at: string;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};
export type HouseholdImageUsageDbRecord = {
  household_id: string;
  active_count: number;
  active_bytes: number;
  reserved_count: number;
  reserved_bytes: number;
  pending_cleanup_bytes: number;
  daily_upload_date: string | null;
  daily_upload_count: number;
  updated_at: string;
};
export type ImageUploadReservationDbRecord = {
  id: string;
  household_id: string;
  shopping_item_id: string;
  operation: string;
  status: string;
  r2_key: string;
  byte_size: number;
  old_image_id: string | null;
  old_r2_key: string | null;
  old_size_bytes: number | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};
export type PushSubscriptionDbRecord = {
  id: string;
  user_id: string;
  household_id: string;
  endpoint: string;
  endpoint_hash: string | null;
  p256dh: string;
  auth: string;
  user_agent_summary: string | null;
  enabled: number;
  created_at: string;
  updated_at: string | null;
  last_seen_at: string | null;
  disabled_at: string | null;
};

export type NotificationDeliveryDbRecord = {
  id: string;
  user_id: string;
  household_id: string;
  notification_type: string;
  target_key: string;
  sent_at: string | null;
  status: "pending" | "sent";
  claimed_at: string;
  created_at: string;
};

export type UserNotificationSettingsDbRecord = {
  user_id: string;
  household_id: string;
  evening_summary_enabled: number;
  evening_summary_time: string;
  timezone: string;
  updated_at: string;
  morning_summary_enabled?: number;
  morning_summary_time?: string;
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
    this.db.beforeRun(this.sql);
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
  readonly shoppingItems = new Map<string, ShoppingItemDbRecord>();
  readonly shoppingTemplates = new Map<string, ShoppingTemplateDbRecord>();
  readonly taskTemplates = new Map<string, TaskTemplateDbRecord>();
  readonly shoppingItemImages = new Map<string, ShoppingItemImageDbRecord>();
  readonly orphanR2Objects = new Map<string, OrphanR2ObjectDbRecord>();
  readonly householdImageUsage = new Map<string, HouseholdImageUsageDbRecord>();
  readonly imageUploadReservations = new Map<string, ImageUploadReservationDbRecord>();
  readonly pushSubscriptions = new Map<string, PushSubscriptionDbRecord>();
  readonly notificationDeliveries = new Map<string, NotificationDeliveryDbRecord>();
  readonly notificationSettings = new Map<string, UserNotificationSettingsDbRecord>();
  private lastDeletedReservation = false;
  private lastChanges = 0;

  constructor(private readonly failure?: (sql: string) => void) {}

  beforeRun(sql: string): void {
    this.failure?.(sql);
  }

  prepare(sql: string): D1PreparedStatement {
    return new MemoryPreparedStatement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const maps: Map<unknown, unknown>[] = [
      this.users,
      this.sessions,
      this.households,
      this.members,
      this.invites,
      this.tasks,
      this.taskWeekdays,
      this.taskRecords,
      this.shoppingItems,
      this.shoppingTemplates,
      this.taskTemplates,
      this.shoppingItemImages,
      this.orphanR2Objects,
      this.householdImageUsage,
      this.imageUploadReservations,
      this.pushSubscriptions,
      this.notificationDeliveries,
      this.notificationSettings
    ];
    const snapshots = maps.map((map) => new Map<unknown, unknown>(map));
    const results: D1Result<T>[] = [];
    try {
      for (const statement of statements) results.push(await statement.run());
    } catch (error) {
      maps.forEach((map, index) => {
        map.clear();
        for (const [key, value] of snapshots[index]) map.set(key, value);
      });
      throw error;
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
    | ShoppingItemDbRecord
    | ShoppingTemplateDbRecord
    | TaskTemplateDbRecord
    | ShoppingItemImageDbRecord
    | OrphanR2ObjectDbRecord
    | HouseholdImageUsageDbRecord
    | ImageUploadReservationDbRecord
    | PushSubscriptionDbRecord
    | NotificationDeliveryDbRecord
    | UserNotificationSettingsDbRecord
    | {
        create_count: number;
        create_bytes: number;
        active_bytes: number;
        today_count: number;
      }
    | { count: number }
    | null {
    if (sql.includes("FROM users WHERE id")) {
      return this.users.get(String(values[0])) ?? null;
    }
    if (sql.includes("FROM users WHERE email")) {
      return (
        Array.from(this.users.values()).find((user) => user.email === values[0]) ?? null
      );
    }
    if (sql.includes("FROM sessions WHERE token_hash")) {
      return (
        Array.from(this.sessions.values()).find(
          (session) =>
            session.token_hash === values[0] && session.expires_at > String(values[1])
        ) ?? null
      );
    }
    if (sql.includes("COUNT(*) AS count FROM household_members")) {
      return {
        count: Array.from(this.members.values()).filter(
          (member) => member.user_id === values[0]
        ).length
      } as unknown as HouseholdMemberRecord;
    }
    if (sql.includes("FROM households h") && sql.includes("WHERE hm.user_id")) {
      const member = Array.from(this.members.values())
        .filter((item) => item.user_id === values[0])
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0];
      const household = member ? this.households.get(member.household_id) : null;
      return household
        ? ({ ...household, role: member.role } as HouseholdRecord)
        : null;
    }
    if (sql.includes("FROM households WHERE id")) {
      return this.households.get(String(values[0])) ?? null;
    }
    if (sql.includes("FROM household_members hm") && sql.includes("hm.user_id = ?")) {
      const member = this.members.get(`${toText(values[0])}:${toText(values[1])}`);
      const user = member ? this.users.get(member.user_id) : null;
      return member && user
        ? ({
            household_id: member.household_id,
            user_id: member.user_id,
            role: member.role,
            color: member.color,
            joined_at: member.joined_at,
            display_name: user.display_name,
            avatar_type: user.avatar_type,
            avatar_value: user.avatar_value,
            avatar_size_bytes: user.avatar_size_bytes,
            avatar_width: user.avatar_width,
            avatar_height: user.avatar_height,
            avatar_updated_at: user.updated_at
          } as unknown as HouseholdMemberRecord)
        : null;
    }
    if (sql.includes("FROM household_members WHERE household_id")) {
      return this.members.get(`${toText(values[0])}:${toText(values[1])}`) ?? null;
    }
    if (
      sql.includes(
        "FROM user_notification_settings WHERE user_id = ? AND household_id = ?"
      )
    ) {
      return (
        this.notificationSettings.get(`${String(values[0])}:${String(values[1])}`) ??
        null
      );
    }
    if (sql.includes("FROM household_invites WHERE code_hash")) {
      const invite =
        Array.from(this.invites.values()).find(
          (item) => item.code_hash === values[0]
        ) ?? null;
      if (
        invite &&
        sql.includes("expires_at >") &&
        !(invite.expires_at > String(values[1]) && invite.used_at === null)
      ) {
        return null;
      }
      return invite;
    }
    if (
      sql.includes("FROM tasks") &&
      sql.includes("WHERE household_id = ? AND id = ?")
    ) {
      const task = this.tasks.get(toText(values[1]));
      if (!task || task.household_id !== values[0]) return null;
      return task;
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.task_id = ? AND tr.target_date")
    ) {
      const record =
        Array.from(this.taskRecords.values()).find(
          (item) => item.task_id === values[0] && item.target_date === values[1]
        ) ?? null;
      return record ? this.withActedByName(record) : null;
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.task_id = ? AND tr.occurrence_key")
    ) {
      const record =
        Array.from(this.taskRecords.values()).find(
          (item) => item.task_id === values[0] && item.occurrence_key === values[1]
        ) ?? null;
      return record ? this.withActedByName(record) : null;
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.task_id = ? AND tr.target_week_start")
    ) {
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
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("WHERE tr.household_id = ? AND tr.id = ?")
    ) {
      const record = this.taskRecords.get(toText(values[1]));
      if (!record || record.household_id !== values[0]) return null;
      return this.withActedByName(record);
    }
    if (sql.includes("COUNT(*) AS count FROM shopping_items")) {
      return {
        count: Array.from(this.shoppingItems.values()).filter(
          (item) => item.household_id === values[0] && item.status === "pending"
        ).length
      } as unknown as ShoppingItemDbRecord;
    }
    if (sql.includes("MAX(sort_order)") && sql.includes("FROM shopping_items")) {
      const max = Math.max(
        0,
        ...Array.from(this.shoppingItems.values())
          .filter((item) => item.household_id === values[0])
          .map((item) => item.sort_order)
      );
      return { max_sort_order: max } as unknown as ShoppingItemDbRecord;
    }
    if (
      sql.includes("FROM shopping_items si") &&
      sql.includes("WHERE si.household_id = ? AND si.id = ?")
    ) {
      const item = this.shoppingItems.get(toText(values[1]));
      if (!item || item.household_id !== values[0]) return null;
      return this.withPurchasedByName(item);
    }
    if (sql.includes("MAX(sort_order)") && sql.includes("FROM shopping_templates")) {
      const max = Math.max(
        0,
        ...Array.from(this.shoppingTemplates.values())
          .filter((template) => template.household_id === values[0])
          .map((template) => template.sort_order)
      );
      return { max_sort_order: max } as unknown as ShoppingTemplateDbRecord;
    }
    if (
      sql.includes("FROM shopping_templates") &&
      sql.includes("WHERE household_id = ? AND id = ?")
    ) {
      const template = this.shoppingTemplates.get(toText(values[1]));
      if (!template || template.household_id !== values[0]) return null;
      return template;
    }
    if (
      sql.includes("FROM task_templates") &&
      sql.includes("WHERE household_id = ? AND id = ?")
    ) {
      const template = this.taskTemplates.get(toText(values[1]));
      if (!template || template.household_id !== values[0]) return null;
      return template;
    }
    if (sql.includes("MAX(sort_order)") && sql.includes("FROM task_templates")) {
      const max = Math.max(
        0,
        ...Array.from(this.taskTemplates.values())
          .filter((template) => template.household_id === values[0])
          .map((template) => template.sort_order)
      );
      return { max_sort_order: max } as unknown as TaskTemplateDbRecord;
    }
    if (
      sql.includes("FROM shopping_item_images") &&
      sql.includes("shopping_item_id = ?")
    ) {
      return (
        Array.from(this.shoppingItemImages.values()).find(
          (image) =>
            image.household_id === values[0] && image.shopping_item_id === values[1]
        ) ?? null
      );
    }
    if (sql.includes("FROM shopping_item_images") && sql.includes("r2_key = ?"))
      return (
        Array.from(this.shoppingItemImages.values()).find(
          (image) => image.r2_key === values[0]
        ) ?? null
      );
    if (sql.includes("FROM orphan_r2_objects") && sql.includes("r2_key = ?"))
      return (
        Array.from(this.orphanR2Objects.values()).find(
          (row) => row.r2_key === values[0]
        ) ?? null
      );
    if (
      sql.includes("FROM household_image_usage") &&
      sql.includes("WHERE household_id = ?")
    )
      return this.householdImageUsage.get(String(values[0])) ?? null;
    if (sql.includes("FROM image_upload_reservations") && sql.includes("WHERE id = ?"))
      return this.imageUploadReservations.get(String(values[0])) ?? null;
    if (sql.includes("FROM push_subscriptions") && sql.includes("WHERE endpoint = ?"))
      return (
        Array.from(this.pushSubscriptions.values()).find(
          (row) => row.endpoint === values[0]
        ) ?? null
      );
    if (
      sql.includes("FROM image_upload_reservations") &&
      sql.includes("shopping_item_id = ?")
    )
      return (
        Array.from(this.imageUploadReservations.values()).find(
          (row) =>
            row.shopping_item_id === values[0] &&
            ["reserved", "r2_written", "cleanup_pending"].includes(row.status)
        ) ?? null
      );
    if (sql.includes("COUNT(*) AS count FROM orphan_r2_objects"))
      return {
        count: Array.from(this.orphanR2Objects.values()).filter(
          (row) =>
            row.household_id === values[0] &&
            row.byte_size === null &&
            ["pending", "retry", "abandoned"].includes(row.status)
        ).length
      };
    if (sql.includes("SUM(CASE WHEN operation")) {
      const rows = Array.from(this.imageUploadReservations.values()).filter(
        (row) =>
          row.household_id === values[2] &&
          ["reserved", "r2_written", "cleanup_pending"].includes(row.status)
      );
      return {
        create_count: rows.filter((row) => row.operation === "create").length,
        create_bytes: rows
          .filter((row) => row.operation === "create")
          .reduce((sum, row) => sum + row.byte_size, 0),
        active_bytes: rows.reduce(
          (sum, row) =>
            sum +
            (row.operation === "create"
              ? row.byte_size
              : row.byte_size - (row.old_size_bytes ?? 0)),
          0
        ),
        today_count: rows.filter(
          (row) =>
            row.created_at >= String(values[0]) && row.created_at < String(values[1])
        ).length
      };
    }
    if (
      sql.includes("COUNT(*) FROM image_upload_reservations") ||
      sql.includes("COUNT(*) AS count FROM image_upload_reservations")
    )
      return {
        count: Array.from(this.imageUploadReservations.values()).filter(
          (row) =>
            row.household_id === values[0] &&
            ["reserved", "r2_written", "cleanup_pending"].includes(row.status)
        ).length
      };
    return null;
  }

  all(sql: string, values: unknown[]): unknown[] {
    if (sql.includes("FROM households") && !sql.includes("household_members")) {
      return Array.from(this.households.values());
    }
    if (sql.includes("FROM user_notification_settings")) {
      return Array.from(this.notificationSettings.values()).filter(
        (setting) =>
          setting.evening_summary_enabled === 1 || setting.morning_summary_enabled === 1
      );
    }
    if (
      sql.includes("FROM push_subscriptions") &&
      sql.includes("user_id = ?") &&
      sql.includes("household_id = ?")
    ) {
      return Array.from(this.pushSubscriptions.values()).filter(
        (row) =>
          row.user_id === values[0] &&
          row.household_id === values[1] &&
          row.enabled === 1 &&
          row.disabled_at === null
      );
    }
    if (sql.includes("FROM household_members hm")) {
      return Array.from(this.members.values())
        .filter((member) => member.household_id === values[0])
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
        .map((member) => ({
          ...member,
          display_name: this.users.get(member.user_id)?.display_name ?? ""
        }));
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.completed_at >= ? AND tr.completed_at < ?") &&
      sql.includes("tr.skipped_at >= ? AND tr.skipped_at < ?")
    ) {
      const from = String(values[1]);
      const to = String(values[2]);
      return Array.from(this.taskRecords.values())
        .filter((item) => item.household_id === values[0])
        .filter((item) => {
          const actionAt = item.status === "completed"
            ? item.completed_at
            : item.status === "skipped"
              ? item.skipped_at
              : item.updated_at;
          return typeof actionAt === "string" && actionAt >= from && actionAt < to;
        })
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((item) => this.withActedByName(item));
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("WHERE tr.household_id = ? ORDER BY tr.updated_at DESC")
    ) {
      return Array.from(this.taskRecords.values())
        .filter((item) => item.household_id === values[0])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((item) => this.withActedByName(item));
    }
    if (sql.includes("FROM tasks") && sql.includes("WHERE household_id = ?")) {
      let rows = Array.from(this.tasks.values())
        .filter((task) => task.household_id === values[0])
        .filter((task) => (sql.includes("AND active = 1") ? task.active === 1 : true))
        .filter((task) =>
          sql.includes("model_recurrence_type IS NOT NULL")
            ? task.model_recurrence_type !== null &&
              task.model_recurrence_type !== undefined
            : true
        )
        .sort((a, b) =>
          sql.includes("created_at DESC")
            ? b.created_at.localeCompare(a.created_at) ||
              b.updated_at.localeCompare(a.updated_at)
            : a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
        );
      if (sql.includes("LIMIT ?"))
        rows = rows.slice(0, Number(values[values.length - 1]));
      return rows;
    }
    if (sql.includes("FROM task_weekdays")) {
      const taskIds = sql.includes(" IN (") ? values.map(String) : [String(values[0])];
      return Array.from(this.taskWeekdays.values())
        .filter((item) => taskIds.includes(item.task_id))
        .sort((a, b) => a.task_id.localeCompare(b.task_id) || a.weekday - b.weekday);
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.household_id = ?") &&
      sql.includes("tr.target_date >= ? AND tr.target_date <= ?")
    ) {
      const periodKeys = values.slice(7).map(String);
      return Array.from(this.taskRecords.values())
        .filter((item) => item.household_id === values[0])
        .filter(
          (item) =>
            (item.target_date !== null &&
              item.target_date >= String(values[1]) &&
              item.target_date <= String(values[2])) ||
            item.target_date === String(values[3]) ||
            (item.calendar_action_date != null &&
              item.calendar_action_date >= String(values[4]) &&
              item.calendar_action_date <= String(values[5])) ||
            (item.calendar_action_date != null && item.calendar_action_date === String(values[6])) ||
            (item.period_key !== null && periodKeys.includes(item.period_key ?? ""))
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((item) => this.withActedByName(item));
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.household_id = ? AND tr.target_date")
    ) {
      return Array.from(this.taskRecords.values())
        .filter(
          (item) => item.household_id === values[0] && item.target_date === values[1]
        )
        .map((item) => this.withActedByName(item));
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.household_id = ? AND tr.period_key IN")
    ) {
      const keys = values.slice(1).map(String);
      return Array.from(this.taskRecords.values())
        .filter(
          (item) =>
            item.household_id === values[0] &&
            typeof item.period_key === "string" &&
            keys.includes(item.period_key)
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((item) => this.withActedByName(item));
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.task_id = ? AND tr.period_key")
    ) {
      return Array.from(this.taskRecords.values())
        .filter((item) => item.task_id === values[0] && item.period_key === values[1])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((item) => this.withActedByName(item));
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.household_id = ? AND tr.target_week_start")
    ) {
      return Array.from(this.taskRecords.values())
        .filter(
          (item) =>
            item.household_id === values[0] && item.target_week_start === values[1]
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((item) => this.withActedByName(item));
    }
    if (
      sql.includes("FROM task_records tr") &&
      sql.includes("tr.household_id = ? AND tr.task_id = ?")
    ) {
      return Array.from(this.taskRecords.values())
        .filter((item) => item.household_id === values[0] && item.task_id === values[1])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, Number(values[2]))
        .map((item) => this.withActedByName(item));
    }
    if (sql.includes("FROM shopping_items si")) {
      let rows = Array.from(this.shoppingItems.values()).filter(
        (item) => item.household_id === values[0]
      );
      if (sql.includes("si.planned_purchase_date >= ?")) {
        rows = rows.filter(
          (item) =>
            typeof item.planned_purchase_date === "string" &&
            item.planned_purchase_date >= String(values[1]) &&
            item.planned_purchase_date <= String(values[2])
        );
      }
      if (sql.includes("si.planned_purchase_date IS NULL")) {
        rows = rows.filter((item) => item.planned_purchase_date == null);
      }
      if (
        sql.includes("AND si.status = 'pending'") ||
        sql.includes("AND status = 'pending'")
      ) {
        rows = rows.filter((item) => item.status === "pending");
      }
      if (sql.includes("NOT EXISTS")) {
        const seen = new Set<string>();
        rows = rows
          .sort(
            (a, b) =>
              b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
          )
          .filter((item) => {
            const key = item.name.trim().toLocaleLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      }
      if (sql.includes("LIMIT ?")) rows = rows.slice(0, Number(values[1]));
      if (sql.includes("NOT EXISTS"))
        return rows.map((item) => this.withPurchasedByName(item));
      return rows
        .sort((a, b) =>
          a.status === b.status
            ? a.status === "pending"
              ? a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
              : (b.purchased_at ?? "").localeCompare(a.purchased_at ?? "")
            : a.status === "pending"
              ? -1
              : 1
        )
        .map((item) => this.withPurchasedByName(item));
    }
    if (
      sql.includes("FROM shopping_templates") &&
      sql.includes("WHERE household_id = ?")
    ) {
      return Array.from(this.shoppingTemplates.values())
        .filter((template) => template.household_id === values[0])
        .filter((template) =>
          sql.includes("AND active = 1") ? template.active === 1 : true
        )
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }
    if (sql.includes("FROM task_templates") && sql.includes("WHERE household_id = ?")) {
      return Array.from(this.taskTemplates.values())
        .filter((template) => template.household_id === values[0])
        .filter((template) =>
          sql.includes("AND active = 1") ? template.active === 1 : true
        )
        .sort(
          (a, b) =>
            a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
        );
    }
    if (
      sql.includes("FROM shopping_item_images") &&
      (sql.includes("WHERE household_id = ?") ||
        sql.includes("WHERE sii.household_id = ?"))
    ) {
      let rows = Array.from(this.shoppingItemImages.values()).filter(
        (image) => image.household_id === values[0]
      );
      if (sql.includes("si.status = 'purchased'"))
        rows = rows.filter(
          (image) =>
            this.shoppingItems.get(image.shopping_item_id)?.status === "purchased"
        );
      return rows;
    }
    if (sql.includes("FROM orphan_r2_objects")) {
      return Array.from(this.orphanR2Objects.values())
        .filter(
          (row) =>
            (row.status === "pending" || row.status === "retry") &&
            row.next_attempt_at <= String(values[0]) &&
            row.attempt_count < Number(values[1])
        )
        .sort(
          (a, b) =>
            a.next_attempt_at.localeCompare(b.next_attempt_at) ||
            a.first_failed_at.localeCompare(b.first_failed_at)
        )
        .slice(0, Number(values[2]));
    }
    if (sql.includes("FROM image_upload_reservations"))
      return Array.from(this.imageUploadReservations.values())
        .filter(
          (row) =>
            ["reserved", "r2_written", "cleanup_pending"].includes(row.status) &&
            row.expires_at <= String(values[0])
        )
        .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
        .slice(0, sql.includes("LIMIT ?") ? Number(values[1]) : undefined);
    return [];
  }

  run(sql: string, values: unknown[]): D1Result {
    let changes = 1;

    if (sql.startsWith("INSERT INTO notification_deliveries")) {
      const existing = Array.from(this.notificationDeliveries.values()).find(
        (row) =>
          row.user_id === values[1] &&
          row.household_id === values[2] &&
          row.notification_type === values[3] &&
          row.target_key === values[4]
      );
      if (!existing) {
        this.notificationDeliveries.set(String(values[0]), {
          id: String(values[0]),
          user_id: String(values[1]),
          household_id: String(values[2]),
          notification_type: String(values[3]),
          target_key: String(values[4]),
          sent_at: null,
          status: "pending",
          claimed_at: String(values[5]),
          created_at: String(values[6])
        });
      } else if (
        existing.status === "pending" &&
        existing.claimed_at <= String(values[7])
      ) {
        this.notificationDeliveries.delete(existing.id);
        this.notificationDeliveries.set(String(values[0]), {
          ...existing,
          id: String(values[0]),
          sent_at: null,
          status: "pending",
          claimed_at: String(values[5])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("UPDATE notification_deliveries SET status = 'sent'")) {
      const row = this.notificationDeliveries.get(String(values[1]));
      if (row && row.status === "pending")
        this.notificationDeliveries.set(row.id, {
          ...row,
          status: "sent",
          sent_at: String(values[0])
        });
      else changes = 0;
    }
    if (sql.startsWith("DELETE FROM notification_deliveries")) {
      const row = this.notificationDeliveries.get(String(values[0]));
      if (row && row.status === "pending") this.notificationDeliveries.delete(row.id);
      else changes = 0;
    }

    if (sql.startsWith("INSERT INTO push_subscriptions")) {
      if (
        Array.from(this.pushSubscriptions.values()).some(
          (row) =>
            row.endpoint === values[3] ||
            (row.endpoint_hash !== null && row.endpoint_hash === values[4])
        )
      )
        throw new Error("UNIQUE constraint failed");
      this.pushSubscriptions.set(String(values[0]), {
        id: String(values[0]),
        user_id: String(values[1]),
        household_id: String(values[2]),
        endpoint: String(values[3]),
        endpoint_hash: String(values[4]),
        p256dh: String(values[5]),
        auth: String(values[6]),
        user_agent_summary: values[7] as string | null,
        enabled: 1,
        created_at: String(values[8]),
        updated_at: String(values[9]),
        last_seen_at: String(values[10]),
        disabled_at: null
      });
    }
    if (sql.startsWith("UPDATE push_subscriptions SET user_id")) {
      const row = Array.from(this.pushSubscriptions.values()).find(
        (item) => item.id === values[8]
      );
      if (row)
        this.pushSubscriptions.set(row.id, {
          ...row,
          user_id: String(values[0]),
          household_id: String(values[1]),
          endpoint_hash: String(values[2]),
          p256dh: String(values[3]),
          auth: String(values[4]),
          user_agent_summary: values[5] as string | null,
          updated_at: String(values[6]),
          last_seen_at: String(values[7]),
          disabled_at: null
        });
      else changes = 0;
    }
    if (sql.startsWith("DELETE FROM push_subscriptions")) {
      const row = Array.from(this.pushSubscriptions.values()).find(
        (item) =>
          item.user_id === values[0] &&
          item.household_id === values[1] &&
          item.endpoint === values[2]
      );
      if (row) this.pushSubscriptions.delete(row.id);
      else changes = 0;
    }
    if (sql.startsWith("UPDATE push_subscriptions SET enabled = 0")) {
      const row = this.pushSubscriptions.get(String(values[3]));
      if (row)
        this.pushSubscriptions.set(row.id, {
          ...row,
          enabled: 0,
          disabled_at: String(values[0])
        });
      else changes = 0;
    }
    if (sql.startsWith("UPDATE push_subscriptions SET last_success_at")) {
      const row = this.pushSubscriptions.get(String(values[2]));
      if (row) this.pushSubscriptions.set(row.id, { ...row });
      else changes = 0;
    }

    if (sql.startsWith("INSERT INTO users")) {
      this.users.set(String(values[0]), {
        id: String(values[0]),
        email: String(values[1]),
        password_hash: String(values[2]),
        display_name: String(values[3]),
        created_at: String(values[4]),
        updated_at: String(values[5]),
        avatar_type: null,
        avatar_value: null,
        avatar_size_bytes: null,
        avatar_width: null,
        avatar_height: null
      });
    }
    if (sql.startsWith("INSERT INTO user_notification_settings")) {
      const key = `${String(values[0])}:${String(values[1])}`;
      this.notificationSettings.set(key, {
        user_id: String(values[0]),
        household_id: String(values[1]),
        evening_summary_enabled: Number(values[2]),
        evening_summary_time: String(values[3]),
        morning_summary_enabled: Number(values[4]),
        morning_summary_time: String(values[5]),
        timezone: String(values[6]),
        updated_at: String(values[7])
      });
    }
    if (sql.startsWith("UPDATE users SET display_name")) {
      const user = this.users.get(String(values[2]));
      if (user) {
        this.users.set(user.id, {
          ...user,
          display_name: String(values[0]),
          updated_at: String(values[1])
        });
      } else changes = 0;
    }
    if (sql.startsWith("UPDATE users SET avatar_type = 'r2'")) {
      const user = this.users.get(String(values[5]));
      const expectedType = values[6] as string | null;
      const expectedKey = values[7] as string | null;
      if (
        user &&
        (user.avatar_type ?? null) === expectedType &&
        (user.avatar_value ?? null) === expectedKey
      ) {
        this.users.set(user.id, {
          ...user,
          avatar_type: "r2",
          avatar_value: String(values[0]),
          avatar_size_bytes: Number(values[1]),
          avatar_width: Number(values[2]),
          avatar_height: Number(values[3]),
          updated_at: String(values[4])
        });
      } else changes = 0;
    }
    if (sql.startsWith("UPDATE users SET avatar_type = NULL")) {
      const user = this.users.get(String(values[1]));
      if (user && user.avatar_type === "r2" && user.avatar_value === values[2])
        this.users.set(user.id, {
          ...user,
          avatar_type: null,
          avatar_value: null,
          avatar_size_bytes: null,
          avatar_width: null,
          avatar_height: null,
          updated_at: String(values[0])
        });
      else changes = 0;
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
      const household = this.households.get(String(values[4]));
      if (household) {
        this.households.set(household.id, {
          ...household,
          name: String(values[0]),
          timezone: String(values[1]),
          week_starts_on: Number(values[2]),
          updated_at: String(values[3])
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
        model_recurrence_type: values[5] as Exclude<
          TaskRecurrenceType,
          "scheduled" | "weekly"
        > | null,
        assignment_type: values[6] as TaskAssignmentType,
        assigned_user_id: toNullableText(values[7]),
        scheduled_time: toNullableText(values[8]),
        notification_slot: values[9] as NotificationSlot,
        notification_time: toNullableText(values[10]),
        weekly_target_count: values[11] === null ? null : Number(values[11]),
        start_date: toNullableText(values[12]),
        target_date: toNullableText(values[13]),
        deadline_time: toNullableText(values[14]),
        notification_offset_minutes: values[15] === null ? null : Number(values[15]),
        weekly_deadline_weekday: values[16] === null ? null : Number(values[16]),
        monthly_day_of_month: values[17] === null ? null : Number(values[17]),
        monthly_deadline_type: values[18] as "month_end" | "day_of_month" | null,
        active: 1,
        sort_order: Number(values[19]),
        created_by: toText(values[20]),
        created_at: toText(values[21]),
        updated_at: toText(values[22])
      });
    }
    if (sql.startsWith("UPDATE tasks") && sql.includes("SET title")) {
      const task = this.tasks.get(toText(values[20]));
      if (task && task.household_id === values[19]) {
        this.tasks.set(task.id, {
          ...task,
          title: toText(values[0]),
          description: toNullableText(values[1]),
          recurrence_type: values[2] as TaskRecurrenceType,
          model_recurrence_type: values[3] as Exclude<
            TaskRecurrenceType,
            "scheduled" | "weekly"
          > | null,
          assignment_type: values[4] as TaskAssignmentType,
          assigned_user_id: toNullableText(values[5]),
          scheduled_time: toNullableText(values[6]),
          notification_slot: values[7] as NotificationSlot,
          notification_time: toNullableText(values[8]),
          weekly_target_count: values[9] === null ? null : Number(values[9]),
          start_date: toNullableText(values[10]),
          target_date: toNullableText(values[11]),
          deadline_time: toNullableText(values[12]),
          notification_offset_minutes: values[13] === null ? null : Number(values[13]),
          weekly_deadline_weekday: values[14] === null ? null : Number(values[14]),
          monthly_day_of_month: values[15] === null ? null : Number(values[15]),
          monthly_deadline_type: values[16] as "month_end" | "day_of_month" | null,
          sort_order: Number(values[17]),
          updated_at: toText(values[18])
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
    if (sql.startsWith("UPDATE tasks") && sql.includes("active = 1")) {
      const task = this.tasks.get(toText(values[2]));
      if (task && task.household_id === values[1]) {
        this.tasks.set(task.id, { ...task, active: 1, updated_at: toText(values[0]) });
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
        occurrence_key: toNullableText(values[5]),
        period_key: toNullableText(values[6]),
        calendar_action_date: toNullableText(values[7]),
        status: values[8] as TaskRecordStatus,
        acted_by: toText(values[9]),
        started_at: toNullableText(values[10]),
        completed_at: toNullableText(values[11]),
        skipped_at: toNullableText(values[12]),
        note: toNullableText(values[13]),
        task_title_snapshot: toNullableText(values[14]),
        assigned_user_id_snapshot: toNullableText(values[15]),
        assigned_user_display_name_snapshot: toNullableText(values[16]),
        assigned_user_color_snapshot: toNullableText(values[17]),
        assigned_user_avatar_url_snapshot: toNullableText(values[18]),
        created_at: toText(values[19]),
        updated_at: toText(values[20])
      });
    }
    if (sql.startsWith("UPDATE task_records")) {
      const id = sql.includes("WHERE household_id = ? AND id = ?")
        ? toText(values[14])
        : toText(values[13]);
      const record = this.taskRecords.get(id);
      if (
        record &&
          (!sql.includes("WHERE household_id = ? AND id = ?") ||
          record.household_id === values[13])
      ) {
        this.taskRecords.set(id, {
          ...record,
          status: values[0] as TaskRecordStatus,
          acted_by: toText(values[1]),
          started_at: toNullableText(values[2]),
          completed_at: toNullableText(values[3]),
          skipped_at: toNullableText(values[4]),
          note: toNullableText(values[5]),
          task_title_snapshot: sql.includes("task_title_snapshot") ? toNullableText(values[6]) : record.task_title_snapshot,
          assigned_user_id_snapshot: sql.includes("assigned_user_id_snapshot") ? toNullableText(values[7]) : record.assigned_user_id_snapshot,
          assigned_user_display_name_snapshot: sql.includes("assigned_user_display_name_snapshot") ? toNullableText(values[8]) : record.assigned_user_display_name_snapshot,
          assigned_user_color_snapshot: sql.includes("assigned_user_color_snapshot") ? toNullableText(values[9]) : record.assigned_user_color_snapshot,
          assigned_user_avatar_url_snapshot: sql.includes("assigned_user_avatar_url_snapshot") ? toNullableText(values[10]) : record.assigned_user_avatar_url_snapshot,
          calendar_action_date: sql.includes("calendar_action_date") ? toNullableText(values[11]) : record.calendar_action_date,
          updated_at: toText(values[sql.includes("task_title_snapshot") ? 12 : 6])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("DELETE FROM task_records")) {
      if (sql.includes("AND id = ?")) {
        const record = this.taskRecords.get(toText(values[2]));
        if (record && record.household_id === values[0] && record.task_id === values[1]) this.taskRecords.delete(record.id);
        else changes = 0;
        this.lastChanges = changes;
        return { success: true, meta: { changes } } as D1Result;
      }
      const before = this.taskRecords.size;
      for (const [id, record] of this.taskRecords) {
        const dateMatches =
          sql.includes("target_date") && record.target_date === values[2];
        const weekMatches =
          sql.includes("target_week_start") && record.target_week_start === values[2];
        const occurrenceMatches =
          sql.includes("occurrence_key") && record.occurrence_key === values[2];
        const periodMatches =
          sql.includes("period_key") && record.period_key === values[2];
        if (
          record.household_id === values[0] &&
          record.task_id === values[1] &&
          (dateMatches || weekMatches || occurrenceMatches || periodMatches)
        ) {
          this.taskRecords.delete(id);
        }
      }
      changes = before - this.taskRecords.size;
    }
    if (sql.startsWith("INSERT INTO shopping_items")) {
      this.shoppingItems.set(toText(values[0]), {
        id: toText(values[0]),
        household_id: toText(values[1]),
        name: toText(values[2]),
        quantity: toNullableText(values[3]),
        note: toNullableText(values[4]),
        planned_purchase_date: toNullableText(values[5]),
        status: "pending",
        added_by: toText(values[6]),
        purchased_by: null,
        purchased_at: null,
        sort_order: Number(values[7]),
        created_at: toText(values[8]),
        updated_at: toText(values[9])
      });
    }
    if (sql.startsWith("UPDATE shopping_items") && sql.includes("SET name")) {
      const item = this.shoppingItems.get(toText(values[6]));
      if (item && item.household_id === values[5]) {
        this.shoppingItems.set(item.id, {
          ...item,
          name: toText(values[0]),
          quantity: toNullableText(values[1]),
          note: toNullableText(values[2]),
          planned_purchase_date: toNullableText(values[3]),
          updated_at: toText(values[4])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("UPDATE shopping_items") && sql.includes("SET sort_order")) {
      const item = this.shoppingItems.get(toText(values[3]));
      if (item && item.household_id === values[2] && item.status === "pending") {
        this.shoppingItems.set(item.id, {
          ...item,
          sort_order: Number(values[0]),
          updated_at: toText(values[1])
        });
      } else {
        changes = 0;
      }
    }
    if (
      sql.startsWith("UPDATE shopping_items") &&
      sql.includes("status = 'purchased'")
    ) {
      const item = this.shoppingItems.get(toText(values[4]));
      if (item && item.household_id === values[3] && item.status === "pending") {
        this.shoppingItems.set(item.id, {
          ...item,
          status: "purchased",
          purchased_by: toText(values[0]),
          purchased_at: toText(values[1]),
          updated_at: toText(values[2])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("UPDATE shopping_items") && sql.includes("status = 'pending'")) {
      const item = this.shoppingItems.get(toText(values[2]));
      if (item && item.household_id === values[1]) {
        this.shoppingItems.set(item.id, {
          ...item,
          status: "pending",
          purchased_by: null,
          purchased_at: null,
          updated_at: toText(values[0])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("DELETE FROM shopping_items")) {
      const before = this.shoppingItems.size;
      for (const [id, item] of this.shoppingItems) {
        const matchesItemDelete =
          sql.includes("AND id = ?") &&
          item.household_id === values[0] &&
          item.id === values[1] &&
          (!sql.includes("EXISTS") ||
            Array.from(this.shoppingItemImages.values()).some(
              (image) =>
                image.household_id === values[2] &&
                image.shopping_item_id === values[3] &&
                image.id === values[4] &&
                image.size_bytes === Number(values[5])
            ));
        const matchesClear =
          sql.includes("status = 'purchased'") &&
          item.household_id === values[0] &&
          item.status === "purchased" &&
          (sql.includes("NOT EXISTS")
            ? !Array.from(this.shoppingItemImages.values()).some(
                (image) =>
                  image.household_id === values[1] && image.shopping_item_id === item.id
              )
            : !sql.includes("EXISTS") ||
              Array.from(this.shoppingItemImages.values()).some(
                (image) =>
                  image.household_id === values[2] &&
                  image.shopping_item_id === values[3] &&
                  image.id === values[4] &&
                  image.size_bytes === Number(values[5])
              ));
        if (matchesItemDelete || matchesClear) {
          this.shoppingItems.delete(id);
          for (const [imageId, image] of this.shoppingItemImages)
            if (image.shopping_item_id === id) this.shoppingItemImages.delete(imageId);
        }
      }
      changes = before - this.shoppingItems.size;
    }
    if (sql.startsWith("INSERT INTO shopping_item_images")) {
      if (
        sql.includes("WHERE EXISTS") &&
        this.imageUploadReservations.get(String(values[11]))?.status !== "finalized"
      ) {
        changes = 0;
        this.lastChanges = changes;
        return { success: true, meta: { changes } } as D1Result;
      }
      const record = {
        id: toText(values[0]),
        shopping_item_id: toText(values[1]),
        household_id: toText(values[2]),
        r2_key: toText(values[3]),
        content_type: values[4] as "image/webp",
        size_bytes: Number(values[5]),
        width: Number(values[6]),
        height: Number(values[7]),
        created_by: toText(values[8]),
        created_at: toText(values[9]),
        updated_at: toText(values[10])
      };
      for (const [key, image] of this.shoppingItemImages)
        if (image.shopping_item_id === record.shopping_item_id)
          this.shoppingItemImages.delete(key);
      this.shoppingItemImages.set(record.id, record);
    }
    if (sql.startsWith("DELETE FROM shopping_item_images")) {
      const before = this.shoppingItemImages.size;
      for (const [key, image] of this.shoppingItemImages)
        if (
          image.household_id === values[0] &&
          image.shopping_item_id === values[1] &&
          (!sql.includes("AND id = ?") ||
            (image.id === values[2] && image.size_bytes === Number(values[3])))
        )
          this.shoppingItemImages.delete(key);
      changes = before - this.shoppingItemImages.size;
    }
    if (sql.startsWith("INSERT INTO orphan_r2_objects")) {
      const existing = Array.from(this.orphanR2Objects.values()).find(
        (row) => row.r2_key === values[1]
      );
      if (existing)
        this.orphanR2Objects.set(existing.id, {
          ...existing,
          source_type: String(values[2]),
          source_id: values[3] as string | null,
          household_id: values[4] as string | null,
          byte_size: (values[5] as number | null) ?? existing.byte_size,
          reason: String(values[6]),
          updated_at: String(values[10])
        });
      else
        this.orphanR2Objects.set(String(values[0]), {
          id: String(values[0]),
          r2_key: String(values[1]),
          source_type: String(values[2]),
          source_id: values[3] as string | null,
          household_id: values[4] as string | null,
          reason: String(values[6]),
          status: "pending",
          attempt_count: 0,
          first_failed_at: String(values[7]),
          last_attempted_at: null,
          next_attempt_at: String(values[8]),
          last_error_code: null,
          last_error_message: null,
          created_at: String(values[9]),
          updated_at: String(values[10]),
          byte_size: values[5] as number | null
        });
    }
    if (sql.startsWith("UPDATE orphan_r2_objects SET status = 'retry'")) {
      const row = this.orphanR2Objects.get(String(values[6]));
      if (row)
        this.orphanR2Objects.set(row.id, {
          ...row,
          status: "retry",
          attempt_count: Number(values[0]),
          last_attempted_at: String(values[1]),
          next_attempt_at: String(values[2]),
          last_error_code: String(values[3]),
          last_error_message: String(values[4]),
          updated_at: String(values[5])
        });
    }
    if (sql.startsWith("UPDATE orphan_r2_objects SET status = 'abandoned'")) {
      const row = this.orphanR2Objects.get(String(values[5]));
      if (row)
        this.orphanR2Objects.set(row.id, {
          ...row,
          status: "abandoned",
          attempt_count: Number(values[0]),
          last_attempted_at: String(values[1]),
          last_error_code: String(values[2]),
          last_error_message: String(values[3]),
          updated_at: String(values[4])
        });
    }
    if (sql.startsWith("DELETE FROM orphan_r2_objects"))
      this.orphanR2Objects.delete(String(values[0]));
    if (sql.startsWith("INSERT INTO household_image_usage")) {
      if (!this.householdImageUsage.has(String(values[0])))
        this.householdImageUsage.set(String(values[0]), {
          household_id: String(values[0]),
          active_count: 0,
          active_bytes: 0,
          reserved_count: 0,
          reserved_bytes: 0,
          pending_cleanup_bytes: 0,
          daily_upload_date: null,
          daily_upload_count: 0,
          updated_at: String(values[1])
        });
    }
    if (
      sql.startsWith("UPDATE household_image_usage") &&
      sql.includes("daily_upload_date =")
    ) {
      const row = this.householdImageUsage.get(String(values[2]));
      if (
        row &&
        (row.daily_upload_date === null || row.daily_upload_date !== values[3])
      )
        this.householdImageUsage.set(row.household_id, {
          ...row,
          daily_upload_date: String(values[0]),
          daily_upload_count: 0,
          updated_at: String(values[1])
        });
    }
    if (
      sql.startsWith("UPDATE household_image_usage") &&
      sql.includes("daily_upload_date = CASE")
    ) {
      const row = this.householdImageUsage.get(String(values[7]));
      const reservation = this.imageUploadReservations.get(String(values[9]));
      const active =
        reservation &&
        ["reserved", "r2_written", "cleanup_pending"].includes(reservation.status) &&
        reservation.household_id === values[10];
      if (
        row &&
        active &&
        row.reserved_count > 0 &&
        row.reserved_bytes >= Number(values[8])
      ) {
        const date = String(values[3]);
        this.householdImageUsage.set(row.household_id, {
          ...row,
          active_count: Math.max(0, row.active_count + Number(values[0])),
          active_bytes: Math.max(0, row.active_bytes + Number(values[1])),
          reserved_count: Math.max(0, row.reserved_count - 1),
          reserved_bytes: Math.max(0, row.reserved_bytes - Number(values[2])),
          daily_upload_date:
            row.daily_upload_date === date ? row.daily_upload_date : date,
          daily_upload_count:
            row.daily_upload_date === date ? row.daily_upload_count + 1 : 1,
          updated_at: String(values[6])
        });
      } else changes = 0;
    }
    if (
      sql.startsWith("UPDATE household_image_usage") &&
      sql.includes("active_count = MAX(0, active_count -")
    ) {
      const householdId = String(values[2]);
      const row = this.householdImageUsage.get(householdId);
      if (row && this.lastChanges > 0)
        this.householdImageUsage.set(householdId, {
          ...row,
          active_count: Math.max(0, row.active_count - this.lastChanges),
          active_bytes: Math.max(0, row.active_bytes - Number(values[0])),
          updated_at: String(values[1])
        });
      else changes = 0;
    }
    if (
      sql.startsWith("UPDATE household_image_usage") &&
      sql.includes("active_count =") &&
      !sql.includes("daily_upload_date = CASE") &&
      !sql.includes("active_count = MAX(0, active_count -")
    ) {
      const householdId = String(values[3]);
      const row = this.householdImageUsage.get(householdId);
      if (row) {
        const images = Array.from(this.shoppingItemImages.values()).filter(
          (image) => image.household_id === householdId
        );
        this.householdImageUsage.set(householdId, {
          ...row,
          active_count: images.length,
          active_bytes: images.reduce((sum, image) => sum + image.size_bytes, 0),
          updated_at: String(values[2])
        });
      }
    }
    if (
      sql.startsWith("UPDATE household_image_usage") &&
      sql.includes("pending_cleanup_bytes =")
    ) {
      const householdId = String(values[2]);
      const row = this.householdImageUsage.get(householdId);
      if (row) {
        const bytes = Array.from(this.orphanR2Objects.values())
          .filter(
            (item) =>
              item.household_id === householdId &&
              item.byte_size !== null &&
              ["pending", "retry", "abandoned"].includes(item.status)
          )
          .reduce((sum, item) => sum + (item.byte_size ?? 0), 0);
        this.householdImageUsage.set(householdId, {
          ...row,
          pending_cleanup_bytes: bytes,
          updated_at: String(values[1])
        });
      }
    }
    if (
      sql.startsWith("UPDATE household_image_usage") &&
      sql.includes("reserved_count =")
    ) {
      const householdId = String(values[3]);
      const row = this.householdImageUsage.get(householdId);
      if (row) {
        const reservations = Array.from(this.imageUploadReservations.values()).filter(
          (item) =>
            item.household_id === householdId &&
            ["reserved", "r2_written", "cleanup_pending"].includes(item.status)
        );
        this.householdImageUsage.set(householdId, {
          ...row,
          reserved_count: reservations.length,
          reserved_bytes: reservations.reduce((sum, item) => sum + item.byte_size, 0),
          updated_at: String(values[2])
        });
      }
    }
    if (
      sql.startsWith(
        "UPDATE household_image_usage SET reserved_count = reserved_count + 1"
      )
    ) {
      const row = this.householdImageUsage.get(String(values[2]));
      const reservations = Array.from(this.imageUploadReservations.values()).filter(
        (item) =>
          item.household_id === values[2] &&
          ["reserved", "r2_written", "cleanup_pending"].includes(item.status)
      );
      const creates = reservations.filter((item) => item.operation === "create");
      const today = reservations.filter(
        (item) =>
          item.created_at >= String(values[12]) && item.created_at < String(values[13])
      ).length;
      const valid =
        row &&
        row.active_count + creates.length + Number(values[4]) <= Number(values[5]) &&
        row.active_bytes +
          reservations.reduce(
            (sum, item) =>
              sum +
              (item.operation === "create"
                ? item.byte_size
                : item.byte_size - (item.old_size_bytes ?? 0)),
            0
          ) +
          Number(values[7]) <=
          Number(values[8]) &&
        row.active_bytes +
          row.reserved_bytes +
          row.pending_cleanup_bytes +
          Number(values[9]) <=
          Number(values[10]) &&
        row.daily_upload_count + today < Number(values[14]);
      if (row && valid)
        this.householdImageUsage.set(row.household_id, {
          ...row,
          reserved_count: row.reserved_count + 1,
          reserved_bytes: row.reserved_bytes + Number(values[0]),
          updated_at: String(values[1])
        });
      else changes = 0;
    }
    if (sql.startsWith("UPDATE household_image_usage SET reserved_count = MAX")) {
      const row = this.householdImageUsage.get(String(values[2]));
      if (row && row.reserved_count > 0 && this.lastDeletedReservation)
        this.householdImageUsage.set(row.household_id, {
          ...row,
          reserved_count: Math.max(0, row.reserved_count - 1),
          reserved_bytes: Math.max(0, row.reserved_bytes - Number(values[0])),
          updated_at: String(values[1])
        });
      else changes = 0;
      this.lastDeletedReservation = false;
    }
    if (sql.startsWith("INSERT INTO image_upload_reservations")) {
      const usage = this.householdImageUsage.get(String(values[13]));
      if (
        sql.includes("WHERE EXISTS") &&
        (!usage ||
          usage.reserved_count !== Number(values[14]) ||
          usage.reserved_bytes !== Number(values[15]))
      ) {
        changes = 0;
        this.lastChanges = changes;
        return { success: true, meta: { changes } } as D1Result;
      }
      if (
        Array.from(this.imageUploadReservations.values()).some(
          (row) =>
            row.shopping_item_id === values[2] &&
            ["reserved", "r2_written", "cleanup_pending"].includes(row.status)
        )
      )
        throw new Error("UNIQUE constraint failed");
      this.imageUploadReservations.set(String(values[0]), {
        id: String(values[0]),
        household_id: String(values[1]),
        shopping_item_id: String(values[2]),
        operation: String(values[3]),
        status: String(values[4]),
        r2_key: String(values[5]),
        byte_size: Number(values[6]),
        old_image_id: values[7] as string | null,
        old_r2_key: values[8] as string | null,
        old_size_bytes: values[9] as number | null,
        expires_at: String(values[10]),
        created_at: String(values[11]),
        updated_at: String(values[12])
      });
    }
    if (sql.startsWith("UPDATE image_upload_reservations SET status = 'finalized'")) {
      const row = this.imageUploadReservations.get(String(values[1]));
      if (row && this.lastChanges > 0)
        this.imageUploadReservations.set(row.id, {
          ...row,
          status: "finalized",
          updated_at: String(values[0])
        });
      else changes = 0;
    }
    if (
      sql.startsWith("UPDATE image_upload_reservations SET status") &&
      !sql.includes("status = 'finalized'")
    ) {
      const row = this.imageUploadReservations.get(String(values[2]));
      if (row)
        this.imageUploadReservations.set(row.id, {
          ...row,
          status: String(values[0]),
          updated_at: String(values[1])
        });
    }
    if (sql.startsWith("DELETE FROM image_upload_reservations")) {
      const row = this.imageUploadReservations.get(String(values[0]));
      this.lastDeletedReservation = Boolean(
        row &&
          (!sql.includes("expires_at") ||
            row.expires_at <= String(values[values.length - 1]))
      );
      if (this.lastDeletedReservation)
        this.imageUploadReservations.delete(String(values[0]));
      else changes = 0;
    }
    if (sql.startsWith("INSERT INTO shopping_templates")) {
      this.shoppingTemplates.set(toText(values[0]), {
        id: toText(values[0]),
        household_id: toText(values[1]),
        name: toText(values[2]),
        quantity: toNullableText(values[3]),
        note: toNullableText(values[4]),
        active: 1,
        sort_order: Number(values[5]),
        created_by: toText(values[6]),
        created_at: toText(values[7]),
        updated_at: toText(values[8])
      });
    }
    if (sql.startsWith("INSERT INTO task_templates")) {
      this.taskTemplates.set(toText(values[0]), {
        id: toText(values[0]),
        household_id: toText(values[1]),
        title: toText(values[2]),
        description: toNullableText(values[3]),
        model_recurrence_type:
          values[4] as TaskTemplateDbRecord["model_recurrence_type"],
        assignment_type: values[5] as TaskAssignmentType,
        assigned_user_id: toNullableText(values[6]),
        weekdays_json: toText(values[7]),
        deadline_time: toNullableText(values[8]),
        notification_offset_minutes: values[9] === null ? null : Number(values[9]),
        weekly_deadline_weekday: values[10] === null ? null : Number(values[10]),
        monthly_day_of_month: values[11] === null ? null : Number(values[11]),
        monthly_deadline_type:
          values[12] as TaskTemplateDbRecord["monthly_deadline_type"],
        active: 1,
        sort_order: Number(values[13]),
        created_by: toText(values[14]),
        created_at: toText(values[15]),
        updated_at: toText(values[16])
      });
    }
    if (sql.startsWith("UPDATE task_templates") && sql.includes("SET title")) {
      const template = this.taskTemplates.get(toText(values[13]));
      if (template && template.household_id === values[12]) {
        this.taskTemplates.set(template.id, {
          ...template,
          title: toText(values[0]),
          description: toNullableText(values[1]),
          model_recurrence_type:
            values[2] as TaskTemplateDbRecord["model_recurrence_type"],
          assignment_type: values[3] as TaskAssignmentType,
          assigned_user_id: toNullableText(values[4]),
          weekdays_json: toText(values[5]),
          deadline_time: toNullableText(values[6]),
          notification_offset_minutes: values[7] === null ? null : Number(values[7]),
          weekly_deadline_weekday: values[8] === null ? null : Number(values[8]),
          monthly_day_of_month: values[9] === null ? null : Number(values[9]),
          monthly_deadline_type:
            values[10] as TaskTemplateDbRecord["monthly_deadline_type"],
          updated_at: toText(values[11])
        });
      } else changes = 0;
    }
    if (sql.startsWith("UPDATE task_templates") && sql.includes("active = 0")) {
      const template = this.taskTemplates.get(toText(values[2]));
      if (template && template.household_id === values[1])
        this.taskTemplates.set(template.id, {
          ...template,
          active: 0,
          updated_at: toText(values[0])
        });
      else changes = 0;
    }
    if (sql.startsWith("UPDATE shopping_templates") && sql.includes("SET name")) {
      const template = this.shoppingTemplates.get(toText(values[5]));
      if (template && template.household_id === values[4]) {
        this.shoppingTemplates.set(template.id, {
          ...template,
          name: toText(values[0]),
          quantity: toNullableText(values[1]),
          note: toNullableText(values[2]),
          updated_at: toText(values[3])
        });
      } else {
        changes = 0;
      }
    }
    if (sql.startsWith("UPDATE shopping_templates") && sql.includes("active = 0")) {
      const template = this.shoppingTemplates.get(toText(values[2]));
      if (template && template.household_id === values[1]) {
        this.shoppingTemplates.set(template.id, {
          ...template,
          active: 0,
          updated_at: toText(values[0])
        });
      } else {
        changes = 0;
      }
    }

    this.lastChanges = changes;
    return { success: true, meta: { changes } } as D1Result;
  }

  private withActedByName(record: TaskRecordDbRecord) {
    return {
      ...record,
      acted_by_display_name: this.users.get(record.acted_by)?.display_name ?? null,
      acted_by_avatar_url: this.users.get(record.acted_by)?.avatar_size_bytes ? `/api/users/${record.acted_by}/avatar` : null
    };
  }

  private withPurchasedByName(item: ShoppingItemDbRecord) {
    return {
      ...item,
      planned_purchase_date: item.planned_purchase_date ?? null,
      purchased_by_display_name: item.purchased_by
        ? (this.users.get(item.purchased_by)?.display_name ?? null)
        : null
    };
  }
}
