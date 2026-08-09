import { sha256Hex } from "../lib/crypto";
import { nowIso } from "../lib/date";
import { HouseholdService } from "./household-service";
import { PushSubscriptionRepository } from "../repositories/push-subscription-repository";
import type { PushSubscriptionInput } from "../lib/validation";

export class PushSubscriptionService {
  private readonly repository: PushSubscriptionRepository;
  private readonly households: HouseholdService;

  constructor(db: D1Database) {
    this.repository = new PushSubscriptionRepository(db);
    this.households = new HouseholdService(db);
  }

  async register(userId: string, input: PushSubscriptionInput, userAgentSummary: string | null): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    await this.repository.save({
      id: crypto.randomUUID(), userId, householdId: household.id, endpoint: input.endpoint,
      endpointHash: await sha256Hex(input.endpoint), p256dh: input.p256dh, auth: input.auth,
      userAgentSummary, now: nowIso()
    });
  }

  async unregister(userId: string, endpoint: string): Promise<void> {
    const household = await this.households.requireCurrentHousehold(userId);
    await this.repository.deleteOwnedByEndpoint(userId, household.id, endpoint);
  }
}
