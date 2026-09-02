const fallbackUrl = "/";

function safeUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("//")) return fallbackUrl;

  try {
    decodeURI(value);
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return fallbackUrl;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackUrl;
  }
}

function safeAssetUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("//")) return undefined;

  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || (url.protocol !== "http:" && url.protocol !== "https:")) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function safeNotificationData(data) {
  const result = { url: safeUrl(data && data.url) };
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;

  if (
    data.kind === "summary" &&
    (data.period === "morning" || data.period === "evening") &&
    typeof data.localDate === "string"
  ) {
    result.kind = "summary";
    result.period = data.period;
    result.localDate = data.localDate;
    return result;
  }

  if (
    data.kind === "task" &&
    typeof data.taskId === "string" &&
    data.taskId.length > 0 &&
    data.taskId.length <= 128
  ) {
    result.kind = "task";
    result.taskId = data.taskId;
  }
  return result;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

  const title = typeof payload.title === "string" ? payload.title : "HouseToDo";
  const options = {};
  if (typeof payload.body === "string") options.body = payload.body;

  const icon = safeAssetUrl(payload.icon);
  const badge = safeAssetUrl(payload.badge);
  if (icon) options.icon = icon;
  if (badge) options.badge = badge;
  options.data = safeNotificationData(payload.data);

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const sameOriginClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOriginClient) {
        const currentUrl = new URL(sameOriginClient.url);
        const currentTarget = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
        if ("navigate" in sameOriginClient && currentTarget !== targetUrl) {
          return sameOriginClient.navigate(targetUrl).then(() => sameOriginClient.focus());
        }
        return sameOriginClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
