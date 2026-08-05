import { utcDateKey } from "../lib/date";
import { getImageLimits, type ImageLimits } from "../lib/image-limits";
import { HouseholdImageUsageRepository } from "../repositories/household-image-usage-repository";
import { HouseholdService } from "./household-service";

export type HouseholdImageUsageResponse = {
  activeCount: number;
  activeCountLimit: number;
  activeBytes: number;
  activeBytesLimit: number;
  reservedCount: number;
  reservedBytes: number;
  pendingCleanupBytes: number;
  pendingCleanupUnknownCount: number;
  storedBytes: number;
  storedBytesKnown: boolean;
  storedBytesLimit: number;
  dailyUploadDate: string;
  dailyUploadCount: number;
  dailyUploadLimit: number;
};

export class HouseholdImageUsageService {
  private readonly households: HouseholdService;
  private readonly usage: HouseholdImageUsageRepository;
  private readonly limits: ImageLimits;

  constructor(private readonly db: D1Database, env: Parameters<typeof getImageLimits>[0]) {
    this.households = new HouseholdService(db);
    this.usage = new HouseholdImageUsageRepository(db);
    this.limits = getImageLimits(env);
  }

  async getForUser(userId: string, now = new Date()): Promise<HouseholdImageUsageResponse> {
    const household = await this.households.requireCurrentHousehold(userId);
    const usage = await this.usage.resetDailyCounterIfNeeded(household.id, utcDateKey(now), now.toISOString());
    if (!usage) throw new Error("household image usage row was not created");
    const pendingCleanupUnknownCount = await this.usage.getUnknownPendingCleanupCount(household.id);
    return {
      activeCount: usage.activeCount,
      activeCountLimit: this.limits.activeCount,
      activeBytes: usage.activeBytes,
      activeBytesLimit: this.limits.activeBytes,
      reservedCount: usage.reservedCount,
      reservedBytes: usage.reservedBytes,
      pendingCleanupBytes: usage.pendingCleanupBytes,
      pendingCleanupUnknownCount,
      storedBytes: usage.activeBytes + usage.reservedBytes + usage.pendingCleanupBytes,
      storedBytesKnown: pendingCleanupUnknownCount === 0,
      storedBytesLimit: this.limits.storedBytes,
      dailyUploadDate: usage.dailyUploadDate ?? utcDateKey(now),
      dailyUploadCount: usage.dailyUploadCount,
      dailyUploadLimit: this.limits.dailyUploads
    };
  }
}
