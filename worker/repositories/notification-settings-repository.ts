export type UserNotificationSettings = {
  userId: string;
  householdId: string;
  eveningSummaryEnabled: boolean;
  eveningSummaryTime: string;
  timezone: string;
  updatedAt: string;
};

type SettingsRow = {
  user_id: string;
  household_id: string;
  evening_summary_enabled: number;
  evening_summary_time: string;
  timezone: string;
  updated_at: string;
};

const toSettings = (row: SettingsRow): UserNotificationSettings => ({
  userId: row.user_id,
  householdId: row.household_id,
  eveningSummaryEnabled: row.evening_summary_enabled === 1,
  eveningSummaryTime: row.evening_summary_time,
  timezone: row.timezone,
  updatedAt: row.updated_at
});

export class NotificationSettingsRepository {
  constructor(private readonly db: D1Database) {}

  async find(userId: string, householdId: string): Promise<UserNotificationSettings | null> {
    const row = await this.db.prepare(
      `SELECT user_id, household_id, evening_summary_enabled, evening_summary_time, timezone, updated_at
       FROM user_notification_settings WHERE user_id = ? AND household_id = ?`
    ).bind(userId, householdId).first<SettingsRow>();
    return row ? toSettings(row) : null;
  }

  async listEnabled(): Promise<UserNotificationSettings[]> {
    const result = await this.db.prepare(
      `SELECT user_id, household_id, evening_summary_enabled, evening_summary_time, timezone, updated_at
       FROM user_notification_settings WHERE evening_summary_enabled = 1`
    ).all<SettingsRow>();
    return (result.results ?? []).map(toSettings);
  }

  async upsert(input: Omit<UserNotificationSettings, "updatedAt"> & { updatedAt: string }): Promise<UserNotificationSettings> {
    await this.db.prepare(
      `INSERT INTO user_notification_settings
       (user_id, household_id, evening_summary_enabled, evening_summary_time, timezone, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, household_id) DO UPDATE SET
       evening_summary_enabled = excluded.evening_summary_enabled,
       evening_summary_time = excluded.evening_summary_time,
       timezone = excluded.timezone, updated_at = excluded.updated_at`
    ).bind(input.userId, input.householdId, input.eveningSummaryEnabled ? 1 : 0,
      input.eveningSummaryTime, input.timezone, input.updatedAt).run();
    return (await this.find(input.userId, input.householdId))!;
  }
}
