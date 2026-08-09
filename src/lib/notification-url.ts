export const fallbackNotificationUrl = "/";

export function resolveNotificationUrl(value: unknown, origin = "https://housetodo.invalid"): string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("//")) {
    return fallbackNotificationUrl;
  }

  try {
    decodeURI(value);
    const url = new URL(value, origin);
    if (url.origin !== origin || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return fallbackNotificationUrl;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackNotificationUrl;
  }
}
