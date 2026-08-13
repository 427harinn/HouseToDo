import { HouseholdMemberRepository } from "./household-member-repository";
import { HouseholdRepository } from "./household-repository";
import { NotificationDeliveryRepository } from "./notification-delivery-repository";
import { NotificationSettingsRepository } from "./notification-settings-repository";
import { TaskRecordRepository } from "./task-record-repository";
import { TaskRepository } from "./task-repository";

export const createNotificationSchedulerRepositories = (db: D1Database) => ({
  households: new HouseholdRepository(db),
  members: new HouseholdMemberRepository(db),
  tasks: new TaskRepository(db),
  records: new TaskRecordRepository(db),
  settings: new NotificationSettingsRepository(db),
  deliveries: new NotificationDeliveryRepository(db)
});
