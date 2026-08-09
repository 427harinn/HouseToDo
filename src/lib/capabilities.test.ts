import { describe, expect, it, vi } from "vitest";
import { getBrowserCapabilities } from "./capabilities";

describe("getBrowserCapabilities", () => {
  it("reports supported browser capabilities and permission", () => {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
    Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);

    expect(getBrowserCapabilities()).toEqual({
      serviceWorkerSupported: true,
      pushManagerSupported: true,
      notificationSupported: true,
      notificationPermission: "granted",
      standalone: true
    });
  });

  it.each(["default", "denied"] as const)("reports notification permission %s", (permission) => {
    vi.stubGlobal("Notification", { permission });
    expect(getBrowserCapabilities().notificationPermission).toBe(permission);
  });

  it("handles unsupported APIs without requesting permission", () => {
    vi.stubGlobal("Notification", undefined);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    Object.defineProperty(window, "PushManager", { configurable: true, value: undefined });
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);

    expect(getBrowserCapabilities()).toEqual({
      serviceWorkerSupported: false,
      pushManagerSupported: false,
      notificationSupported: false,
      notificationPermission: "unsupported",
      standalone: false
    });
  });
});
