export const fallbackNotificationUrl = "/";

export type HomeTaskQuery = {
  requested: boolean;
  taskId: string | null;
};

export function parseHomeTaskQuery(search: string): HomeTaskQuery {
  const params = new URLSearchParams(search);
  if (!params.has("task")) return { requested: false, taskId: null };
  const taskId = params.get("task");
  if (!taskId || taskId.length > 128) return { requested: true, taskId: null };
  return { requested: true, taskId };
}

export function homeTaskNotificationUrl(taskId: string): string {
  return `/home?task=${encodeURIComponent(taskId)}`;
}

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
