const returnableAppPaths = new Set(["/home", "/calendar", "/shopping", "/other"]);

export const currentLocationPath = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const formRouteWithReturnTo = (formPath: "/tasks/new" | "/shopping/new") =>
  `${formPath}?returnTo=${encodeURIComponent(currentLocationPath())}`;

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
