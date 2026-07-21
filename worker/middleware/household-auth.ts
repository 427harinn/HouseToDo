import { HouseholdService } from "../services/household-service";
import type { HouseholdRole } from "../types/domain";

export const requireCurrentHousehold = (db: D1Database, userId: string) =>
  new HouseholdService(db).requireCurrentHousehold(userId);

export const requireHouseholdRole = (db: D1Database, userId: string, role: HouseholdRole) =>
  new HouseholdService(db).requireHouseholdRole(userId, role);
