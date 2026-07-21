export type User = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string;
};

export type HouseholdRole = "owner" | "member";

export type Household = {
  id: string;
  name: string;
  timezone: string;
  weekStartsOn: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdWithRole = Household & {
  role: HouseholdRole;
};

export type HouseholdMember = {
  householdId: string;
  userId: string;
  role: HouseholdRole;
  color: string | null;
  joinedAt: string;
};

export type HouseholdMemberProfile = HouseholdMember & {
  displayName: string;
};

export type HouseholdInvite = {
  id: string;
  householdId: string;
  codeHash: string;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  createdAt: string;
};
