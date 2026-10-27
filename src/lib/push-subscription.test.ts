import { describe, expect, it, vi } from "vitest";
import {
  createFreshPushSubscription,
  unsubscribePushSubscription
} from "./push-subscription";

const createSubscription = (
  endpoint: string,
  unsubscribe: () => Promise<boolean> = () => Promise.resolve(true)
) =>
  ({
    endpoint,
    unsubscribe,
    toJSON: () => ({ endpoint, keys: {} })
  }) as PushSubscription;

const createRegistration = (initial: PushSubscription | null) => {
  let current = initial;
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(current)),
    subscribe: vi.fn(() => {
      current = {
        ...createSubscription("https://push.example.test/new"),
        unsubscribe: () => {
          current = null;
          return Promise.resolve(true);
        }
      } as PushSubscription;
      return Promise.resolve(current);
    })
  };
  return {
    registration: { pushManager } as unknown as ServiceWorkerRegistration,
    pushManager,
    current: () => current,
    setCurrent: (value: PushSubscription | null) => {
      current = value;
    }
  };
};

describe("push subscription lifecycle", () => {
  it("unregisters from the server and unsubscribes locally before completing OFF", async () => {
    const existing = createSubscription("https://push.example.test/old");
    const fixture = createRegistration(existing);
    const unsubscribe = vi.fn(() => {
      fixture.setCurrent(null);
      return Promise.resolve(true);
    });
    existing.unsubscribe = unsubscribe;
    const unregister = vi.fn(() => Promise.resolve({ removed: true }));

    await unsubscribePushSubscription(fixture.registration, existing, unregister);

    expect(unregister).toHaveBeenCalledWith(existing.endpoint);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(fixture.current()).toBeNull();
  });

  it("keeps the browser subscription when server deletion fails so OFF can be retried", async () => {
    const existing = createSubscription("https://push.example.test/old");
    const fixture = createRegistration(existing);
    const unsubscribe = vi.fn(() => {
      fixture.setCurrent(null);
      return Promise.resolve(true);
    });
    existing.unsubscribe = unsubscribe;

    await expect(
      unsubscribePushSubscription(
        fixture.registration,
        existing,
        vi.fn().mockRejectedValue(new Error("network"))
      )
    ).rejects.toThrow("push-server-unregister-failed");

    expect(unsubscribe).not.toHaveBeenCalled();
    expect(fixture.current()).toBe(existing);
  });

  it("refuses to complete when the browser still has a subscription", async () => {
    const existing = createSubscription(
      "https://push.example.test/old",
      () => Promise.resolve(false)
    );
    const fixture = createRegistration(existing);

    await expect(
      unsubscribePushSubscription(
        fixture.registration,
        existing,
        vi.fn().mockResolvedValue({ removed: true })
      )
    ).rejects.toThrow("push-browser-unsubscribe-incomplete");
  });

  it("replaces any existing subscription using the current API VAPID key", async () => {
    const existing = createSubscription("https://push.example.test/old");
    const fixture = createRegistration(existing);
    const unsubscribe = vi.fn(() => {
      fixture.setCurrent(null);
      return Promise.resolve(true);
    });
    existing.unsubscribe = unsubscribe;
    const unregister = vi.fn(() => Promise.resolve({ removed: true }));
    const register = vi.fn(() => Promise.resolve({ registered: true }));
    const publicKey = "AQIDBA";

    const created = await createFreshPushSubscription(
      fixture.registration,
      publicKey,
      register,
      unregister
    );

    expect(unregister).toHaveBeenCalledWith(existing.endpoint);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(fixture.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3, 4])
    });
    expect(created).toBe(fixture.current());
    expect(created).not.toBe(existing);
    expect(register).toHaveBeenCalledWith(created);
  });

  it("cleans up the new browser subscription if server registration fails", async () => {
    const fixture = createRegistration(null);
    const unregister = vi.fn(() => Promise.resolve({ removed: true }));
    const register = vi.fn().mockRejectedValue(new Error("server rejected"));

    await expect(
      createFreshPushSubscription(fixture.registration, "AQIDBA", register, unregister)
    ).rejects.toThrow("server rejected");

    expect(unregister).toHaveBeenCalledWith("https://push.example.test/new");
    expect(fixture.current()).toBeNull();
  });
});
