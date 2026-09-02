import type { ShoppingTemplate } from "../api/shopping";
import type { HouseholdMember } from "../types";

export type ShoppingSupportIdentity = { userId: string; householdId: string };

const templateMemory = new Map<string, ShoppingTemplate[]>();
const memberMemory = new Map<string, HouseholdMember[]>();
const supportKey = ({ userId, householdId }: ShoppingSupportIdentity) => `${userId}:${householdId}`;

export const readMemoryShoppingTemplates = (identity: ShoppingSupportIdentity) => templateMemory.get(supportKey(identity)) ?? null;
export const writeMemoryShoppingTemplates = (identity: ShoppingSupportIdentity, templates: ShoppingTemplate[]) => {
  templateMemory.set(supportKey(identity), [...templates]);
};
export const readMemoryShoppingMembers = (identity: ShoppingSupportIdentity) => memberMemory.get(supportKey(identity)) ?? null;
export const writeMemoryShoppingMembers = (identity: ShoppingSupportIdentity, members: HouseholdMember[]) => {
  memberMemory.set(supportKey(identity), [...members]);
};
export const clearMemoryShoppingSupport = () => {
  templateMemory.clear();
  memberMemory.clear();
};
