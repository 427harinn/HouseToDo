const returnableAppPaths = new Set(["/home", "/calendar", "/shopping", "/other"]);

export const isValidDateKey = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const currentLocationPath = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const formRouteWithReturnTo = (
  formPath: "/tasks/new" | "/shopping/new",
  params: Record<string, string | undefined> = {}
) => {
  const query = new URLSearchParams({ returnTo: currentLocationPath() });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, value);
  });
  return `${formPath}?${query.toString()}`;
};

export const resolveReturnTo = (search: string, fallback: string) => {
  const rawReturnTo = new URLSearchParams(search).get("returnTo");
  if (!rawReturnTo || rawReturnTo.startsWith("//")) return fallback;

  try {
    const target = new URL(rawReturnTo, window.location.origin);
    const isInternalPath = rawReturnTo.startsWith("/");
    const isSameOriginAbsoluteUrl = /^(?:https?:)\/\//i.test(rawReturnTo) && target.origin === window.location.origin;
    if ((!isInternalPath && !isSameOriginAbsoluteUrl) || target.origin !== window.location.origin || !returnableAppPaths.has(target.pathname)) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
};
