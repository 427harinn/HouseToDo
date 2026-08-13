export type DeliveryClaim = {
  id: string;
  userId: string;
  householdId: string;
  notificationType: string;
  targetKey: string;
  now: string;
};

export const NOTIFICATION_CLAIM_LEASE_MS = 10 * 60 * 1000;

const staleBefore = (now: string): string =>
  new Date(new Date(now).getTime() - NOTIFICATION_CLAIM_LEASE_MS).toISOString();

export class NotificationDeliveryRepository {
  constructor(private readonly db: D1Database) {}

  async claim(input: DeliveryClaim): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT INTO notification_deliveries
       (id, user_id, household_id, notification_type, target_key, sent_at, status, claimed_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'pending', ?, ?)
       ON CONFLICT (user_id, household_id, notification_type, target_key)
       DO UPDATE SET
         id = excluded.id,
         status = 'pending',
         sent_at = NULL,
         claimed_at = excluded.claimed_at
       WHERE notification_deliveries.status = 'pending'
         AND notification_deliveries.claimed_at <= ?`
    ).bind(
      input.id,
      input.userId,
      input.householdId,
      input.notificationType,
      input.targetKey,
      input.now,
      input.now,
      staleBefore(input.now)
    ).run();
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
