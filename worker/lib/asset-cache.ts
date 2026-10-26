const FINGERPRINTED_SCRIPT_OR_STYLE = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/i;

/** Apply cache policy to the final static asset response, including SPA fallbacks. */
export const applyAssetCachePolicy = (request: Request, response: Response): Response => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const pathname = new URL(request.url).pathname;
  let cacheControl: string | null = null;

  if (contentType.split(";", 1)[0].trim() === "text/html") {
    // SPA routes all resolve to index.html; classify the final response instead
    // of enumerating routes or relying on _headers patterns that can overlap assets.
    cacheControl = "no-store";
  } else if (response.ok && FINGERPRINTED_SCRIPT_OR_STYLE.test(pathname)) {
    cacheControl = "public, max-age=31536000, immutable";
  }

  if (cacheControl === null) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};
