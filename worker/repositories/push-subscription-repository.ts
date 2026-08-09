export type PushSubscriptionRecord = {
  id: string;
  user_id: string;
  household_id: string;
  endpoint: string;
  endpoint_hash: string | null;
  p256dh: string;
  auth: string;
  user_agent_summary: string | null;
  created_at: string;
  updated_at: string | null;
  last_seen_at: string | null;
  disabled_at: string | null;
};

export type SavePushSubscriptionInput = {
  id: string;
  userId: string;
  householdId: string;
  endpoint: string;
  endpointHash: string;
  p256dh: string;
  auth: string;
  userAgentSummary: string | null;
  now: string;
};

export class PushSubscriptionRepository {
  constructor(private readonly db: D1Database) {}

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionRecord | null> {
    return this.db.prepare("SELECT id, user_id, household_id, endpoint, endpoint_hash, p256dh, auth, user_agent_summary, created_at, updated_at, last_seen_at, disabled_at FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).first<PushSubscriptionRecord>();
  }

  async save(input: SavePushSubscriptionInput): Promise<void> {
    const existing = await this.findByEndpoint(input.endpoint);
    if (existing) {
      await this.db.prepare("UPDATE push_subscriptions SET user_id = ?, household_id = ?, endpoint_hash = ?, p256dh = ?, auth = ?, user_agent_summary = ?, updated_at = ?, last_seen_at = ?, disabled_at = NULL WHERE id = ?").bind(input.userId, input.householdId, input.endpointHash, input.p256dh, input.auth, input.userAgentSummary, input.now, input.now, existing.id).run();
      return;
    }
    await this.db.prepare("INSERT INTO push_subscriptions (id, user_id, household_id, endpoint, endpoint_hash, p256dh, auth, user_agent_summary, enabled, created_at, updated_at, last_seen_at, disabled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)").bind(input.id, input.userId, input.householdId, input.endpoint, input.endpointHash, input.p256dh, input.auth, input.userAgentSummary, input.now, input.now, input.now).run();
  }

  async deleteOwnedByEndpoint(userId: string, householdId: string, endpoint: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND household_id = ? AND endpoint = ?").bind(userId, householdId, endpoint).run();
    return (result.meta.changes ?? 0) > 0;
  }
}
