import { HouseholdMemberRepository } from "../repositories/household-member-repository";
import { NotificationDeliveryRepository } from "../repositories/notification-delivery-repository";
import type { ShoppingItem } from "../types/domain";
import { WebPushService } from "./web-push-service";

export type ShoppingNotificationEnvironment = Parameters<
  WebPushService["sendTest"]
>[2];

type PushSender = Pick<WebPushService, "sendPayload">;

export class ShoppingAddedNotificationService {
  private readonly members: HouseholdMemberRepository;
  private readonly deliveries: NotificationDeliveryRepository;

  constructor(
    db: D1Database,
    private readonly push: PushSender = new WebPushService(db)
  ) {
    this.members = new HouseholdMemberRepository(db);
    this.deliveries = new NotificationDeliveryRepository(db);
  }

  async notifyAdded(
    item: ShoppingItem,
    addedBy: string,
    addedByDisplayName: string,
    env: ShoppingNotificationEnvironment
  ): Promise<void> {
    const members = await this.members.listByHouseholdId(item.householdId);
    for (const member of members) {
      if (member.userId === addedBy) continue;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      if (
        !(await this.deliveries.claim({
          id,
          userId: member.userId,
          householdId: item.householdId,
          notificationType: "shopping_added",
          targetKey: `shopping:${item.id}`,
          now
        }))
      )
        continue;
      try {
        const result = await this.push.sendPayload(
          member.userId,
          item.householdId,
          {
            title: "買い物リストに追加されました",
            body: `${addedByDisplayName}さんが「${item.name}」を追加しました`,
            icon: "/icons/house-todo-v4-192.png",
            data: {
              kind: "shopping_added",
              shoppingItemId: item.id,
              url: "/shopping"
            }
          },
          env
        );
        if (result.sent > 0) await this.deliveries.markSent(id, now);
        else await this.deliveries.release(id);
      } catch (error) {
        await this.deliveries.release(id);
        console.error(
          JSON.stringify({
            event: "shopping_added_notification_failed",
            householdId: item.householdId,
            errorName: error instanceof Error ? error.name : "UnknownError"
          })
        );
      }
    }
  }
}
