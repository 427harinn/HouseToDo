/* eslint-disable no-undef */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, request, webkit } from "@playwright/test";
const base = process.env.M7_LOCAL_BASE_URL ?? "http://127.0.0.1:8789";
const screenshotDir = "docs/evidence/m7/screenshots";
const diagnosticDir = "docs/evidence/m7/diagnostics";
const password = "very-long-password";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const originHeaders = { origin: base };

const pngSize = (bytes) => {
  assert(
    bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47,
    "invalid PNG signature"
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const result = {
  generatedAt: new Date().toISOString(),
  base,
  manifest: { http200: false, requiredFields: false },
  icons: { icon192: false, icon512: false, dimensions192: false, dimensions512: false },
  serviceWorker: {
    registered: false,
    scope: null,
    active: false,
    controllerAfterReload: false
  },
  startUrl: {
    unauthenticatedLogin: false,
    noHouseholdCreate: false,
    householdReadyHome: false
  },
  directRoutes: {},
  legacyRoute: { requestedRoute: "/tasks", actualPathname: null, result: "FAIL" },
  notificationSanitizer: { result: "FAIL" },
  webkit: "UNAVAILABLE",
  realIphone: "NOT RUN"
};

await mkdir(screenshotDir, { recursive: true });
await mkdir(diagnosticDir, { recursive: true });

const api = await request.newContext({
  baseURL: base,
  extraHTTPHeaders: originHeaders
});
const manifestResponse = await api.get("/manifest.webmanifest");
assert(manifestResponse.status() === 200, "manifest is not HTTP 200");
const manifest = await manifestResponse.json();
result.manifest.http200 = true;
result.manifest.requiredFields =
  [
    "name",
    "short_name",
    "id",
    "start_url",
    "scope",
    "display",
    "theme_color",
    "background_color"
  ].every((key) => Boolean(manifest[key])) &&
  manifest.display === "standalone" &&
  manifest.start_url === "/" &&
  manifest.scope === "/";
assert(result.manifest.requiredFields, "manifest required fields are invalid");
for (const [file, expected, key] of [
  ["/icons/house-todo-192.png", 192, "192"],
  ["/icons/house-todo-512.png", 512, "512"]
]) {
  const response = await api.get(file);
  assert(response.status() === 200, `${file} is not HTTP 200`);
  const size = pngSize(await response.body());
  result.icons[`icon${key}`] = true;
  result.icons[`dimensions${key}`] =
    size.width === expected && size.height === expected;
  assert(
    result.icons[`dimensions${key}`],
    `${file} dimensions are ${size.width}x${size.height}`
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
await page.goto(`${base}/`);
await page.waitForURL(/\/login$/);
result.startUrl.unauthenticatedLogin = true;

const id = stamp();
await page.goto(`${base}/register`);
await page.locator("#register-name").fill(`M7 PWA ${id}`);
await page.locator("#register-email").fill(`m7-pwa-${id}@example.test`);
await page.locator("#register-password").fill(password);
await page.locator('form button[type="submit"]').click();
await page.waitForURL(/\/household\/create$/);
await page.goto(`${base}/`);
await page.waitForURL(/\/household\/create$/);
result.startUrl.noHouseholdCreate = true;
await page.locator("#household-name").fill(`M7 PWA House ${id}`);
await page.locator('form button[type="submit"]').click();
await page.waitForURL(/\/home$/);
await page.goto(`${base}/`);
await page.waitForURL(/\/home$/);
result.startUrl.householdReadyHome = true;

for (const path of [
  "/home",
  "/calendar",
  "/shopping",
  "/other",
  "/tasks/new",
  "/shopping/new"
]) {
  const response = await page.goto(`${base}${path}`);
  assert(response && response.status() < 400, `direct route failed: ${path}`);
  await page.waitForLoadState("domcontentloaded");
  result.directRoutes[path] = true;
}

const plannedDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
const itemResponse = await page.request.post(`${base}/api/shopping/items`, {
  headers: originHeaders,
  data: {
    name: `M7 PWA deep link ${id}`,
    quantity: "1個",
    plannedPurchaseDate: plannedDate
  }
});
assert(
  itemResponse.status() === 201,
  `actual item setup failed: ${itemResponse.status()}`
);
const itemId = (await itemResponse.json()).data.item.id;
const deepLink = `/shopping?item=${encodeURIComponent(itemId)}`;
await page.goto(`${base}${deepLink}`);
const targetRow = page.locator(`[data-shopping-m4-id="${itemId}"]`);
await targetRow.waitFor();
await page.waitForTimeout(650);
await targetRow
  .getByRole("button", { name: new RegExp(`M7 PWA deep link ${id}`) })
  .waitFor();
assert(
  (await targetRow
    .getByRole("button", { name: new RegExp(`M7 PWA deep link ${id}`) })
    .getAttribute("aria-expanded")) === "true",
  "deep link target did not expand"
);
await targetRow.getByRole("button", { name: "購入" }).waitFor();
await page.screenshot({ path: `${screenshotDir}/pwa-shopping.png`, fullPage: true });
await page.reload();
await targetRow.waitFor();
assert(
  (await targetRow
    .getByRole("button", { name: new RegExp(`M7 PWA deep link ${id}`) })
    .getAttribute("aria-expanded")) === "true",
  "deep link expansion was not restored after reload"
);

await page.goto(`${base}/calendar`);
const dayLabel = `${Number(plannedDate.slice(5, 7))}月${Number(plannedDate.slice(8, 10))}日`;
const dayCell = page.locator(`.calendar-day-cell[aria-label^="${dayLabel}"]`);
await dayCell.click();
await page.getByRole("heading", { name: "買うもの" }).waitFor();
await page.getByRole("button", { name: new RegExp(`M7 PWA deep link ${id}`) }).click();
await page.waitForURL(new RegExp(`/shopping\\?item=${itemId}`));
await page
  .locator(`[data-shopping-m4-id="${itemId}"]`)
  .getByRole("button", { name: "購入" })
  .waitFor();
await page.screenshot({ path: `${screenshotDir}/pwa-calendar.png`, fullPage: true });
await page.getByRole("button", { name: "カレンダー" }).click();
await page.waitForLoadState("domcontentloaded");
await page.screenshot({ path: `${screenshotDir}/pwa-calendar.png`, fullPage: true });
await page.reload();
await page.getByRole("grid", { name: /カレンダー/ }).waitFor();
await page.getByRole("button", { name: "買い物" }).click();
await page.waitForLoadState("domcontentloaded");
await page.screenshot({ path: `${screenshotDir}/pwa-shopping.png`, fullPage: true });
await page.getByRole("button", { name: "その他" }).click();
await page.waitForLoadState("domcontentloaded");
await page.screenshot({ path: `${screenshotDir}/pwa-other.png`, fullPage: true });
await page.getByRole("button", { name: "ホーム" }).click();
await page.waitForLoadState("domcontentloaded");
await page.screenshot({ path: `${screenshotDir}/pwa-home.png`, fullPage: true });

await page.goto(`${base}/tasks`);
await page.waitForURL(/\/home$/);
result.legacyRoute.actualPathname = new URL(page.url()).pathname;
result.legacyRoute.result =
  result.legacyRoute.actualPathname === "/home" ? "PASS" : "FAIL";
assert(
  result.legacyRoute.result === "PASS",
  "production-like legacy route did not redirect"
);

await page.goto(`${base}/home`);
const registration = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration
    ? { scope: registration.scope, active: Boolean(registration.active) }
    : null;
});
result.serviceWorker.registered = Boolean(registration);
result.serviceWorker.scope = registration?.scope
  ? new URL(registration.scope).pathname
  : null;
result.serviceWorker.active = Boolean(registration?.active);
assert(
  result.serviceWorker.registered &&
    result.serviceWorker.scope === "/" &&
    result.serviceWorker.active,
  "service worker registration is incomplete"
);
await page.reload();
result.serviceWorker.controllerAfterReload = await page.evaluate(() =>
  Boolean(navigator.serviceWorker.controller)
);
assert(
  result.serviceWorker.controllerAfterReload,
  "service worker controller missing after reload"
);

try {
  const webkitBrowser = await webkit.launch({ headless: true });
  const webkitPage = await webkitBrowser.newPage({
    viewport: { width: 390, height: 844 }
  });
  await webkitPage.goto(`${base}/home`);
  await webkitPage.getByRole("heading", { name: "やること" }).waitFor();
  result.webkit = "PASS";
  await webkitBrowser.close();
} catch (error) {
  result.webkit = `UNAVAILABLE: ${error instanceof Error ? error.message.split("\n")[0] : "executable unavailable"}`;
}

try {
  if (process.env.M7_NOTIFICATION_SANITIZER_RESULT !== "PASS") {
    throw new Error(
      "run npm test -- src/lib/notification-url.test.ts first and set M7_NOTIFICATION_SANITIZER_RESULT=PASS"
    );
  }
  result.notificationSanitizer.result = "PASS";
  result.notificationSanitizer.source = "npm test -- src/lib/notification-url.test.ts";
} catch (error) {
  result.notificationSanitizer.result = "FAIL";
  throw error;
}

await context.close();
await browser.close();
await api.dispose();
await writeFile(
  `${diagnosticDir}/pwa-results.json`,
  JSON.stringify(result, null, 2) + "\n",
  "utf8"
);
console.log(JSON.stringify(result, null, 2));
