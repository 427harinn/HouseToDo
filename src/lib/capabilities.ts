export type NotificationPermissionState = NotificationPermission | "unsupported";

export type BrowserCapabilities = {
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  notificationSupported: boolean;
  notificationPermission: NotificationPermissionState;
  standalone: boolean;
};

export function getBrowserCapabilities(): BrowserCapabilities {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  const browserNavigator = typeof navigator === "undefined" ? undefined : navigator;
  const notificationSupported = typeof Notification !== "undefined";

  return {
    serviceWorkerSupported: Boolean(browserNavigator && typeof browserNavigator.serviceWorker !== "undefined"),
    pushManagerSupported: Boolean(browserWindow && typeof browserWindow.PushManager !== "undefined"),
    notificationSupported,
    notificationPermission: notificationSupported ? Notification.permission : "unsupported",
    standalone: Boolean(
      browserWindow?.matchMedia?.("(display-mode: standalone)").matches ||
        (browserNavigator as Navigator & { standalone?: boolean } | undefined)?.standalone
    )
  };
}
