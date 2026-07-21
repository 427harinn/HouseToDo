export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export type HouseholdRole = "owner" | "member";

export type Household = {
  id: string;
  name: string;
  timezone: string;
  weekStartsOn: number;
  role: HouseholdRole;
};

export type HouseholdMember = {
  userId: string;
  displayName: string;
  role: HouseholdRole;
  color: string | null;
  joinedAt: string;
};

export type CreatedInvite = {
  code: string;
  expiresAt: string;
};

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthUser };

export type HouseholdState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; household: Household }
  | { status: "error"; message: string };
