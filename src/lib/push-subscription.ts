import { urlBase64ToUint8Array } from "./vapid";

type PushRegistration = Pick<ServiceWorkerRegistration, "pushManager">;
type UnregisterSubscription = (endpoint: string) => Promise<unknown>;
type RegisterSubscription = (subscription: PushSubscription) => Promise<unknown>;

export const unsubscribePushSubscription = async (
  registration: PushRegistration,
  subscription: PushSubscription,
  unregister: UnregisterSubscription
): Promise<void> => {
  try {
    await unregister(subscription.endpoint);
  } catch {
    throw new Error("push-server-unregister-failed");
  }
  await subscription.unsubscribe();
  const remaining = await registration.pushManager.getSubscription();

  if (remaining) {
    throw new Error("push-browser-unsubscribe-incomplete");
  }
};

export const createFreshPushSubscription = async (
  registration: PushRegistration,
  publicKey: string,
  register: RegisterSubscription,
  unregister: UnregisterSubscription
): Promise<PushSubscription> => {
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await unsubscribePushSubscription(registration, existing, unregister);
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  });
  try {
    await register(subscription);
  } catch (error) {
    try {
      await unsubscribePushSubscription(registration, subscription, unregister);
    } catch {
      console.error("push_subscription_registration_rollback_incomplete");
    }
    throw error;
  }
  return subscription;
};
