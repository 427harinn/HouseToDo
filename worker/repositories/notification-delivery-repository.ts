export type DeliveryClaim = {
  id: string;
  userId: string;
  householdId: string;
  notificationType: string;
  targetKey: string;
  now: string;
};

export class NotificationDeliveryRepository {
  constructor(private readonly db: D1Database) {}

  async claim(input: DeliveryClaim): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO notification_deliveries
       (id, user_id, household_id, notification_type, target_key, sent_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'pending', ?)`
    ).bind(input.id, input.userId, input.householdId, input.notificationType, input.targetKey, input.now).run();
    return (result.meta.changes ?? 0) > 0;
  }

  async markSent(id: string, sentAt: string): Promise<void> {
    await this.db.prepare("UPDATE notification_deliveries SET status = 'sent', sent_at = ? WHERE id = ?")
      .bind(sentAt, id).run();
  }

  async release(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM notification_deliveries WHERE id = ? AND status = 'pending'")
      .bind(id).run();
  }
}
