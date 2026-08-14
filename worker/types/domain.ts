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

export type LegacyTaskRecurrenceType = "daily" | "scheduled" | "weekly" | "model_only";
export type TaskModelRecurrenceType =
  | "once"
  | "daily"
  | "weekly_fixed"
  | "monthly_fixed"
  | "weekly_flexible"
  | "monthly_flexible";
export type TaskRecurrenceType = LegacyTaskRecurrenceType | TaskModelRecurrenceType;
export type MonthlyDeadlineType = "month_end" | "day_of_month";
export type TaskAssignmentType = "anyone" | "specific";
export type NotificationSlot = "morning" | "night" | "none";
export type TaskRecordStatus = "in_progress" | "completed" | "skipped";
export type TaskDisplayStatus = TaskRecordStatus | "pending";

export type Task = {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  recurrenceType: TaskRecurrenceType;
  modelRecurrenceType?: TaskModelRecurrenceType | null;
  assignmentType: TaskAssignmentType;
  assignedUserId: string | null;
  scheduledTime: string | null;
  notificationSlot: NotificationSlot;
  notificationTime: string | null;
  weeklyTargetCount: number | null;
  startDate?: string | null;
  targetDate?: string | null;
  deadlineTime?: string | null;
  notificationOffsetMinutes?: number | null;
  weeklyDeadlineWeekday?: number | null;
  monthlyDayOfMonth?: number | null;
  monthlyDeadlineType?: MonthlyDeadlineType | null;
  active: boolean;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  weekdays: number[];
};

export type TaskRecord = {
  id: string;
  householdId: string;
  taskId: string;
  targetDate: string | null;
  targetWeekStart: string | null;
  occurrenceKey?: string | null;
  periodKey?: string | null;
  status: TaskRecordStatus;
  actedBy: string;
  actedByDisplayName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShoppingItemStatus = "pending" | "purchased";

export type ShoppingItem = {
  id: string;
  householdId: string;
  name: string;
  quantity: string | null;
  note: string | null;
  status: ShoppingItemStatus;
  addedBy: string;
  purchasedBy: string | null;
  purchasedByDisplayName: string | null;
  purchasedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  image: ShoppingItemImageMetadata | null;
};

export type ShoppingItemImageMetadata = {
  available: true;
  width: number;
  height: number;
  size: number;
  updatedAt: string;
};

export type ShoppingItemImage = {
  id: string;
  shoppingItemId: string;
  householdId: string;
  r2Key: string;
  contentType: "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ShoppingTemplate = {
  id: string;
  householdId: string;
  name: string;
  quantity: string | null;
  note: string | null;
  active: boolean;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
