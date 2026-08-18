import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const stagingProject = process.env.STAGING_E2E_PROJECT === "1";
const requiredStagingEnv = [
  "STAGING_E2E_BASE_URL",
  "STAGING_E2E_OWNER_EMAIL",
  "STAGING_E2E_OWNER_PASSWORD",
  "STAGING_E2E_MEMBER_EMAIL",
  "STAGING_E2E_MEMBER_PASSWORD",
  "STAGING_E2E_CROSS_EMAIL",
  "STAGING_E2E_CROSS_PASSWORD"
] as const;
const missingStagingEnv = requiredStagingEnv.filter((name) => !process.env[name]);
const stagingE2eReady = stagingProject && missingStagingEnv.length === 0;
const stagingSkipReason = stagingProject
  ? `staging E2E skipped: ${missingStagingEnv.join(", ")} are not set`
  : "staging-only E2E; run npm run test:e2e:staging with staging URL and credentials";

const artifactDir = path.resolve(
  process.env.PLAYWRIGHT_ARTIFACT_DIR ?? "artifacts/playwright/staging-e2e-remaining"
);
const fixture = path.resolve("e2e/fixtures/shopping-item-replacement.webp");
const imageWidth = 640;
const imageHeight = 400;
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const testEmail = (name: string) => {
  const value = env(name);
  if (!/@(?:example\.invalid|example\.test)$/i.test(value))
    throw new Error(`${name} must use a reserved test domain`);
  return value;
};
const password = (name: string) => env(name);
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const origin = (page: Page) => ({ origin: new URL(page.url()).origin });
const json = async (response: Awaited<ReturnType<Page["request"]["get"]>>) =>
  response.json() as Promise<Record<string, any>>;
const sanitizeMessage = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/(?:password|cookie|session|token|authorization|secret|invite)/gi, "[redacted]")
        .slice(0, 240)
    : undefined;
const diagnoseUploadFailure = async (input: {
  response: Awaited<ReturnType<Page["request"]["put"]>>;
  endpoint: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
}) => {
  const contentType = input.response.headers()["content-type"] ?? "";
  let code: string | undefined;
  let message: string | undefined;
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const body = (await input.response.json()) as { error?: { code?: unknown; message?: unknown } };
      code = typeof body.error?.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(body.error.code)
        ? body.error.code
        : undefined;
      message = sanitizeMessage(body.error?.message);
    } catch {
      // Keep diagnostics safe when the response is not valid JSON.
    }
  }
  console.error("staging image upload failure", JSON.stringify({
    status: input.response.status(),
    contentType,
    endpoint: input.endpoint,
    code,
    message,
    filename: input.filename,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height
  }));
};
const validateWebpFixture = async () => {
  const file = await readFile(fixture);
  expect(path.extname(fixture)).toBe(".webp");
  expect(file.byteLength).toBeGreaterThan(0);
  expect(file.byteLength).toBeLessThan(10 * 1024 * 1024);
  expect(file.subarray(0, 4).toString()).toBe("RIFF");
  expect(file.subarray(8, 12).toString()).toBe("WEBP");
  return file;
};
const makeDifferentSizeWebp = (source: Buffer) => {
  const chunk = Buffer.alloc(12);
  chunk.write("JUNK", 0, 4, "ascii");
  chunk.writeUInt32LE(4, 4);
  Buffer.from([1, 2, 3, 4]).copy(chunk, 8);
  const replacement = Buffer.concat([source, chunk]);
  replacement.writeUInt32LE(replacement.byteLength - 8, 4);
  expect(replacement.byteLength).not.toBe(source.byteLength);
  expect(replacement.subarray(0, 4).toString()).toBe("RIFF");
  expect(replacement.subarray(8, 12).toString()).toBe("WEBP");
  return replacement;
};

type ImageUsage = {
  activeCount: number;
  activeCountLimit: number;
  activeBytes: number;
  activeBytesLimit: number;
  reservedCount: number;
  reservedBytes: number;
  pendingCleanupBytes: number;
  pendingCleanupUnknownCount: number;
  storedBytes: number;
  storedBytesKnown: boolean;
  storedBytesLimit: number;
  dailyUploadDate: string;
  dailyUploadCount: number;
  dailyUploadLimit: number;
};

const currentImageUsage = async (page: Page) => {
  const response = await page.request.get("/api/households/current/image-usage");
  expect(response.status(), "image usage status").toBe(200);
  return (await json(response)).data as ImageUsage;
};

const uploadWebp = async (
  page: Page,
  itemId: string,
  buffer: Buffer,
  filename: string,
  diagnoseFailure = true
) => {
  const endpoint = `/api/shopping/items/${itemId}/image`;
  const response = await page.request.put(endpoint, {
    headers: origin(page),
    multipart: {
      image: { name: filename, mimeType: "image/webp", buffer },
      width: String(imageWidth),
      height: String(imageHeight)
    }
  });
  if (diagnoseFailure && response.status() >= 400) {
    await diagnoseUploadFailure({
      response,
      endpoint,
      filename,
      mimeType: "image/webp",
      byteSize: buffer.byteLength,
      width: imageWidth,
      height: imageHeight
    });
  }
  return response;
};
const diagnoseTaskFailure = async (input: {
  response: Awaited<ReturnType<Page["request"]["post"]>>;
  endpoint: string;
  recurrenceType: "daily" | "weekly";
  assignmentType: "anyone";
  scheduledTime: string | null;
  notificationSlot: "none";
  hasWeekdays: boolean;
  weekdaysCount: number;
  weeklyTargetCount: number | null;
}) => {
  const contentType = input.response.headers()["content-type"] ?? "";
  let code: string | undefined;
  let message: string | undefined;
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const body = (await input.response.json()) as { error?: { code?: unknown; message?: unknown } };
      code = typeof body.error?.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(body.error.code)
        ? body.error.code
        : undefined;
      message = sanitizeMessage(body.error?.message);
    } catch {
      // Keep diagnostics safe when the response is not valid JSON.
    }
  }
  console.error("staging task creation failure", JSON.stringify({
    status: input.response.status(),
    contentType,
    endpoint: input.endpoint,
    recurrenceType: input.recurrenceType,
    assignmentType: input.assignmentType,
    scheduledTimeIsNull: input.scheduledTime === null,
    notificationSlot: input.notificationSlot,
    hasWeekdays: input.hasWeekdays,
    weekdaysCount: input.weekdaysCount,
    weeklyTargetCount: input.weeklyTargetCount,
    code,
    message
  }));
};

type User = { email: string; password: string; name: string };
type Contexts = {
  owner: BrowserContext;
  member: BrowserContext;
  unauth: BrowserContext;
  cross: BrowserContext;
};

const users = (): { owner: User; member: User; cross: User } => ({
  owner: {
    email: testEmail("STAGING_E2E_OWNER_EMAIL"),
    password: password("STAGING_E2E_OWNER_PASSWORD"),
    name: `Staging Owner ${stamp()}`
  },
  member: {
    email: testEmail("STAGING_E2E_MEMBER_EMAIL"),
    password: password("STAGING_E2E_MEMBER_PASSWORD"),
    name: `Staging Member ${stamp()}`
  },
  cross: {
    email: testEmail("STAGING_E2E_CROSS_EMAIL"),
    password: password("STAGING_E2E_CROSS_PASSWORD"),
    name: `Staging Cross ${stamp()}`
  }
});

const loginApi = async (page: Page, user: User) => {
  const response = await page.request.post("/api/auth/login", {
    headers: origin(page),
    data: { email: user.email, password: user.password }
  });
  expect(response.status()).toBe(200);
};

const currentHousehold = async (page: Page) => {
  const response = await page.request.get("/api/households/current");
  expect(response.status()).toBe(200);
  return (await json(response)).data.household as { id: string; name: string } | null;
};

const createHousehold = async (page: Page, name: string) => {
  const response = await page.request.post("/api/households", {
    headers: origin(page),
    data: { name }
  });
  expect(response.status()).toBe(201);
};

const invite = async (page: Page) => {
  const response = await page.request.post("/api/households/current/invites", {
    headers: origin(page),
    data: {}
  });
  expect(response.status()).toBe(201);
  return (await json(response)).data.invite.code as string;
};

const join = async (page: Page, code: string) => {
  const response = await page.request.post("/api/households/join", {
    headers: origin(page),
    data: { code }
  });
  expect(response.status()).toBe(200);
};

const createTask = async (
  page: Page,
  title: string,
  recurrenceType: "daily" | "weekly"
) => {
  const hasWeekdays = recurrenceType === "daily";
  const weekdaysField = hasWeekdays ? [] : undefined;
  const payload = {
    title,
    description: `staging E2E ${title}`,
    recurrenceType,
    assignmentType: "anyone" as const,
    assignedUserId: null,
    scheduledTime: null,
    notificationSlot: "none" as const,
    ...(hasWeekdays ? { weekdays: weekdaysField } : {}),
    weeklyTargetCount: recurrenceType === "weekly" ? 2 : null
  };
  const response = await page.request.post("/api/tasks", {
    headers: origin(page),
    data: payload
  });
  if (response.status() >= 400) {
    await diagnoseTaskFailure({
      response,
      endpoint: "/api/tasks",
      recurrenceType,
      assignmentType: "anyone",
      scheduledTime: null,
      notificationSlot: "none",
      hasWeekdays,
      weekdaysCount: Array.isArray(weekdaysField) ? weekdaysField.length : 0,
      weeklyTargetCount: recurrenceType === "weekly" ? 2 : null
    });
  }
  expect(response.status()).toBe(201);
  return (await json(response)).data.task as { id: string; title: string };
};

const changeTask = async (page: Page, id: string, action: "complete" | "skip") => {
  const response = await page.request.post(`/api/tasks/${id}/${action}`, {
    headers: origin(page),
    data: {
      targetDate: new Date().toISOString().slice(0, 10),
      note: action === "skip" ? "staging E2E skip" : null
    }
  });
  expect(response.ok()).toBeTruthy();
};

const screenshot = async (page: Page, name: string) => {
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true });
};

type BrowserContextName = "owner" | "member" | "unauth" | "cross";
type BrowserSignal = {
  context: BrowserContextName;
  type: string;
  message: string;
  pathname: string;
  scriptPathname?: string;
  line?: number;
  column?: number;
  phase: string;
  argumentCount?: number;
  method?: string;
  requestGeneration?: number;
  navigationGeneration?: number;
};

const sanitizeBrowserText = (value: string) =>
  value
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, "[email]")
    .replace(/STAGING_E2E_[A-Za-z0-9_-]+/g, "[test-data]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[id]")
    .replace(/(password|cookie|session|token|authorization|invite code)\s*[:=]?\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 300);

const signalLocation = (page: Page, url: string) => {
  try {
    return {
      pathname: new URL(page.url()).pathname,
      scriptPathname: new URL(url).pathname
    };
  } catch {
    return { pathname: "[unknown]", scriptPathname: "[unknown]" };
  }
};

const collectBrowserSignals = (page: Page, context: BrowserContextName) => {
  let phase = "setup";
  let navigationGeneration = 0;
  const errors: BrowserSignal[] = [];
  const warnings: BrowserSignal[] = [];
  const pageErrors: BrowserSignal[] = [];
  const requestFailures: BrowserSignal[] = [];
  const requestGenerations = new WeakMap<object, number>();
  const record = (message: string, type: string, url: string, location: { lineNumber?: number; columnNumber?: number }, argumentCount?: number): BrowserSignal => {
    const paths = signalLocation(page, url);
    return {
      context,
      type,
      message: sanitizeBrowserText(message || "[empty]"),
      pathname: paths.pathname,
      scriptPathname: paths.scriptPathname,
      line: location.lineNumber,
      column: location.columnNumber,
      phase,
      ...(argumentCount === undefined ? {} : { argumentCount })
    };
  };
  page.on("console", (message) => {
    const location = message.location();
    const signal = record(message.text(), `console.${message.type()}`, location.url, location, message.args().length);
    if (message.type() === "error") errors.push(signal);
    if (message.type() === "warning") warnings.push(signal);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(record(error.message, "pageerror", page.url(), {}));
  });
  page.on("request", (request) => {
    requestGenerations.set(request, navigationGeneration);
  });
  page.on("requestfailed", (request) => {
    const requestGeneration = requestGenerations.get(request);
    const signal = record(request.failure()?.errorText ?? "[request failed]", "requestfailed", request.url(), {});
    requestFailures.push({
      ...signal,
      method: request.method(),
      requestGeneration,
      navigationGeneration
    });
  });
  return {
    errors,
    warnings,
    pageErrors,
    requestFailures,
    setPhase: (nextPhase: string) => { phase = nextPhase; },
    beginNavigation: () => { navigationGeneration += 1; },
    getNavigationGeneration: () => navigationGeneration
  };
};

test.describe("staging remaining E2E", () => {
  test.skip(!stagingE2eReady, stagingSkipReason);

  test("isolates owner, member, unauthenticated, and cross-house contexts", async ({
    browser
  }) => {
    const id = `STAGING_E2E_${stamp()}`;
    const user = users();
    const contexts: Contexts = {
      owner: await browser.newContext(),
      member: await browser.newContext(),
      unauth: await browser.newContext(),
      cross: await browser.newContext()
    };
    const pages: Record<BrowserContextName, Page> = {
      owner: await contexts.owner.newPage(),
      member: await contexts.member.newPage(),
      unauth: await contexts.unauth.newPage(),
      cross: await contexts.cross.newPage()
    };
    const signals = Object.fromEntries(
      (Object.entries(pages) as [BrowserContextName, Page][]).map(([name, page]) => [name, collectBrowserSignals(page, name)])
    ) as Record<BrowserContextName, ReturnType<typeof collectBrowserSignals>>;
    const completed = {
      login: false,
      sameHouseImage: false,
      unauthenticatedRejection: false,
      crossHouseRejection: false,
      deletedImage: false,
      taskSync: false,
      shoppingSync: false
    };

    try {
      for (const signal of Object.values(signals)) signal.setPhase("login");
      for (const signal of Object.values(signals)) signal.beginNavigation();
      await Promise.all(Object.values(pages).map((page) => page.goto("/login")));
      await Promise.all([
        loginApi(pages.owner, user.owner),
        loginApi(pages.member, user.member),
        loginApi(pages.cross, user.cross)
      ]);
      if (!(await currentHousehold(pages.owner)))
        await createHousehold(pages.owner, `${id} Owner Household`);
      if (!(await currentHousehold(pages.cross)))
        await createHousehold(pages.cross, `${id} Cross Household`);
      const code = await invite(pages.owner);
      const ownerHousehold = await currentHousehold(pages.owner);
      const memberHousehold = await currentHousehold(pages.member);
      if (!ownerHousehold) throw new Error("owner household setup failed");
      if (!memberHousehold) await join(pages.member, code);
      else if (memberHousehold.id !== ownerHousehold.id)
        throw new Error("member is not in the owner household");
      const resolvedMemberHousehold = memberHousehold ?? await currentHousehold(pages.member);
      if (!resolvedMemberHousehold || resolvedMemberHousehold.id !== ownerHousehold.id)
        throw new Error("member household setup failed");
      const crossHousehold = await currentHousehold(pages.cross);
      if (!crossHousehold || crossHousehold.id === ownerHousehold.id)
        throw new Error("cross-house context is not isolated");
      completed.login = true;

      const ownerUsageStart = await currentImageUsage(pages.owner);
      const memberUsageStart = await currentImageUsage(pages.member);
      const crossUsageStart = await currentImageUsage(pages.cross);
      expect(memberUsageStart, "owner/member image usage must match").toEqual(ownerUsageStart);
      expect(ownerUsageStart.reservedCount).toBe(0);
      expect(ownerUsageStart.reservedBytes).toBe(0);
      expect(ownerUsageStart.activeCountLimit).toBe(50);
      expect(ownerUsageStart.activeBytesLimit).toBe(52_428_800);
      expect(ownerUsageStart.storedBytesLimit).toBe(78_643_200);
      expect(ownerUsageStart.dailyUploadLimit).toBe(20);
      expect(crossHousehold.id).not.toBe(ownerHousehold.id);

      for (const signal of Object.values(signals)) signal.setPhase("image-create");
      const imageItemResponse = await pages.owner.request.post("/api/shopping/items", {
        headers: origin(pages.owner),
        data: { name: `${id} image item`, quantity: "1" }
      });
      expect(imageItemResponse.status()).toBe(201);
      const imageItemId = (await json(imageItemResponse)).data.item.id as string;
      const imageBuffer = await validateWebpFixture();
      const replacementBuffer = makeDifferentSizeWebp(imageBuffer);
      const usageBeforeCreate = await currentImageUsage(pages.owner);
      const upload = await uploadWebp(
        pages.owner,
        imageItemId,
        imageBuffer,
        "shopping-item-create.webp"
      );
      expect(upload.status()).toBe(200);
      const createdImage = await pages.owner.request.get(
        `/api/shopping/items/${imageItemId}/image`
      );
      expect(createdImage.status()).toBe(200);
      const createdImageBody = await createdImage.body();
      expect(createdImageBody.byteLength).toBe(imageBuffer.byteLength);
      expect(createdImageBody.equals(imageBuffer)).toBeTruthy();
      const usageAfterCreate = await currentImageUsage(pages.owner);
      expect(usageAfterCreate.activeCount).toBe(usageBeforeCreate.activeCount + 1);
      expect(usageAfterCreate.activeBytes).toBe(
        usageBeforeCreate.activeBytes + imageBuffer.byteLength
      );
      expect(usageAfterCreate.dailyUploadCount).toBe(
        usageBeforeCreate.dailyUploadCount + 1
      );
      expect(usageAfterCreate.reservedCount).toBe(0);
      expect(usageAfterCreate.reservedBytes).toBe(0);
      expect(usageAfterCreate.pendingCleanupBytes).toBe(
        usageBeforeCreate.pendingCleanupBytes
      );
      expect(usageAfterCreate.storedBytes).toBe(
        usageBeforeCreate.storedBytes + imageBuffer.byteLength
      );
      expect(await currentImageUsage(pages.member)).toEqual(usageAfterCreate);
      expect(await currentImageUsage(pages.cross)).toEqual(crossUsageStart);

      for (const signal of Object.values(signals)) signal.setPhase("same-house-image");
      const item = await json(
        await pages.owner.request.get(`/api/shopping/items/${imageItemId}`)
      );
      const imagePath = `/api/shopping/items/${imageItemId}/image?v=${item.data.item.image.updatedAt}`;
      const ownerImage = await pages.owner.request.get(imagePath);
      expect(ownerImage.status()).toBe(200);
      expect(ownerImage.headers()["content-type"]).toMatch(/^image\//);
      expect((await ownerImage.body()).byteLength).toBeGreaterThan(0);
      const memberImage = await pages.member.request.get(imagePath);
      expect(memberImage.status()).toBe(200);

      for (const signal of Object.values(signals)) signal.setPhase("image-replace");
      const usageBeforeReplace = await currentImageUsage(pages.owner);
      const replace = await uploadWebp(
        pages.owner,
        imageItemId,
        replacementBuffer,
        "shopping-item-replacement.webp"
      );
      expect(replace.status()).toBe(200);
      const replacedItem = await json(
        await pages.owner.request.get(`/api/shopping/items/${imageItemId}`)
      );
      const replacedImagePath = `/api/shopping/items/${imageItemId}/image?v=${replacedItem.data.item.image.updatedAt}`;
      const replacedImage = await pages.owner.request.get(replacedImagePath);
      expect(replacedImage.status()).toBe(200);
      const replacedImageBody = await replacedImage.body();
      expect(replacedImageBody.byteLength).toBe(replacementBuffer.byteLength);
      expect(replacedImageBody.equals(replacementBuffer)).toBeTruthy();
      expect(replacedImageBody.equals(imageBuffer)).toBeFalsy();
      const usageAfterReplace = await currentImageUsage(pages.owner);
      expect(usageAfterReplace.activeCount).toBe(usageBeforeReplace.activeCount);
      expect(usageAfterReplace.activeBytes).toBe(
        usageBeforeReplace.activeBytes + replacementBuffer.byteLength - imageBuffer.byteLength
      );
      expect(usageAfterReplace.dailyUploadCount).toBe(
        usageBeforeReplace.dailyUploadCount + 1
      );
      expect(usageAfterReplace.reservedCount).toBe(0);
      expect(usageAfterReplace.reservedBytes).toBe(0);
      expect(usageAfterReplace.pendingCleanupBytes).toBe(
        usageBeforeReplace.pendingCleanupBytes
      );

      signals.unauth.setPhase("unauthenticated-image");
      const unauthImage = await pages.unauth.request.get(replacedImagePath);
      expect([401, 404]).toContain(unauthImage.status());
      completed.unauthenticatedRejection = true;
      signals.cross.setPhase("cross-house-image");
      const ownerUsageBeforeCross = await currentImageUsage(pages.owner);
      const crossUsageBeforeOperations = await currentImageUsage(pages.cross);
      const crossImage = await pages.cross.request.get(replacedImagePath);
      expect([403, 404]).toContain(crossImage.status());
      const crossUpload = await uploadWebp(
        pages.cross,
        imageItemId,
        imageBuffer,
        "cross-house-denied.webp",
        false
      );
      expect([403, 404]).toContain(crossUpload.status());
      const crossDelete = await pages.cross.request.delete(
        `/api/shopping/items/${imageItemId}/image`,
        { headers: origin(pages.cross), data: {} }
      );
      expect([403, 404]).toContain(crossDelete.status());
      expect(await currentImageUsage(pages.owner)).toEqual(ownerUsageBeforeCross);
      expect(await currentImageUsage(pages.cross)).toEqual(crossUsageBeforeOperations);
      completed.crossHouseRejection = true;
      signals.owner.beginNavigation();
      await pages.owner.goto(`/shopping/items/${imageItemId}`);
      await expect(
        pages.owner.locator(`img[src^="/api/shopping/items/${imageItemId}/image"]`)
      ).toHaveCount(1);
      await screenshot(pages.owner, "same-house-image-success.png");
      signals.member.beginNavigation();
      await pages.member.goto(`/shopping/items/${imageItemId}`);
      await expect(
        pages.member.locator(`img[src^="/api/shopping/items/${imageItemId}/image"]`)
      ).toHaveCount(1);
      await screenshot(pages.member, "member-shopping-reflection.png");
      completed.sameHouseImage = true;
      signals.unauth.beginNavigation();
      await pages.unauth.goto(`/shopping/items/${imageItemId}`);
      signals.cross.beginNavigation();
      await pages.cross.goto(`/shopping/items/${imageItemId}`);
      await screenshot(pages.unauth, "unauthenticated-image-denied.png");
      await screenshot(pages.cross, "cross-house-image-denied.png");
      signals.owner.setPhase("deleted-image");
      const usageBeforeDelete = await currentImageUsage(pages.owner);
      const deleteImage = await pages.owner.request.delete(
        `/api/shopping/items/${imageItemId}/image`,
        { headers: origin(pages.owner), data: {} }
      );
      expect(deleteImage.status()).toBe(200);
      expect((await pages.owner.request.get(replacedImagePath)).status()).toBe(404);
      const usageAfterDelete = await currentImageUsage(pages.owner);
      expect(usageAfterDelete.activeCount).toBe(usageBeforeDelete.activeCount - 1);
      expect(usageAfterDelete.activeBytes).toBe(
        usageBeforeDelete.activeBytes - replacementBuffer.byteLength
      );
      expect(usageAfterDelete.dailyUploadCount).toBe(usageBeforeDelete.dailyUploadCount);
      expect(usageAfterDelete.reservedCount).toBe(usageBeforeDelete.reservedCount);
      expect(usageAfterDelete.reservedBytes).toBe(usageBeforeDelete.reservedBytes);
      expect(usageAfterDelete.pendingCleanupBytes).toBe(
        usageBeforeDelete.pendingCleanupBytes
      );
      const secondDeleteImage = await pages.owner.request.delete(
        `/api/shopping/items/${imageItemId}/image`,
        { headers: origin(pages.owner), data: {} }
      );
      expect(secondDeleteImage.status()).toBe(200);
      expect(await currentImageUsage(pages.owner)).toEqual(usageAfterDelete);
      signals.owner.beginNavigation();
      await pages.owner.goto(`/shopping/items/${imageItemId}`);
      await screenshot(pages.owner, "deleted-image-denied.png");
      completed.deletedImage = true;

      for (const signal of Object.values(signals)) signal.setPhase("image-item-delete");
      const itemDeleteResponse = await pages.owner.request.post("/api/shopping/items", {
        headers: origin(pages.owner),
        data: { name: `${id} item delete`, quantity: "1" }
      });
      expect(itemDeleteResponse.status()).toBe(201);
      const itemDeleteId = (await json(itemDeleteResponse)).data.item.id as string;
      const usageBeforeItemUpload = await currentImageUsage(pages.owner);
      const itemDeleteUpload = await uploadWebp(
        pages.owner,
        itemDeleteId,
        imageBuffer,
        "shopping-item-delete.webp"
      );
      expect(itemDeleteUpload.status()).toBe(200);
      const usageAfterItemUpload = await currentImageUsage(pages.owner);
      expect(usageAfterItemUpload.activeCount).toBe(usageBeforeItemUpload.activeCount + 1);
      expect(usageAfterItemUpload.activeBytes).toBe(
        usageBeforeItemUpload.activeBytes + imageBuffer.byteLength
      );
      expect(usageAfterItemUpload.dailyUploadCount).toBe(
        usageBeforeItemUpload.dailyUploadCount + 1
      );
      const deleteItem = await pages.owner.request.delete(
        `/api/shopping/items/${itemDeleteId}`,
        { headers: origin(pages.owner), data: {} }
      );
      expect(deleteItem.status()).toBe(200);
      const usageAfterItemDelete = await currentImageUsage(pages.owner);
      expect(usageAfterItemDelete.activeCount).toBe(usageAfterItemUpload.activeCount - 1);
      expect(usageAfterItemDelete.activeBytes).toBe(
        usageAfterItemUpload.activeBytes - imageBuffer.byteLength
      );
      expect(usageAfterItemDelete.dailyUploadCount).toBe(
        usageAfterItemUpload.dailyUploadCount
      );
      expect(usageAfterItemDelete.pendingCleanupBytes).toBe(
        usageAfterItemUpload.pendingCleanupBytes
      );
      expect((await pages.owner.request.get(`/api/shopping/items/${imageItemId}`)).status()).toBe(200);

      for (const signal of Object.values(signals)) signal.setPhase("task-sync");
      const daily = await createTask(pages.owner, `${id} daily`, "daily");
      const weekly = await createTask(pages.owner, `${id} weekly`, "weekly");
      signals.member.beginNavigation();
      await pages.member.goto("/tasks");
      await expect(pages.member.getByText(daily.title)).toBeVisible();
      await expect(pages.member.getByText(weekly.title)).toBeVisible();
      await pages.member.goto(`/tasks/${daily.id}`);
      await expect(
        pages.member.getByRole("heading", { name: daily.title })
      ).toBeVisible();
      await changeTask(pages.member, daily.id, "complete");
      await changeTask(pages.member, weekly.id, "skip");
      await expect(
        (await pages.owner.request.get(`/api/tasks/${daily.id}`)).status()
      ).toBe(200);
      await screenshot(pages.member, "member-task-reflection.png");
      const disable = await pages.owner.request.delete(`/api/tasks/${weekly.id}`, {
        headers: origin(pages.owner),
        data: {}
      });
      expect(disable.status()).toBe(200);
      signals.member.beginNavigation();
      await pages.member.reload();
      await expect(pages.member.getByText(weekly.title)).toHaveCount(0);
      completed.taskSync = true;

      for (const signal of Object.values(signals)) signal.setPhase("shopping-sync");
      const shopping = await pages.owner.request.post("/api/shopping/items", {
        headers: origin(pages.owner),
        data: { name: `${id} shopping`, quantity: "1" }
      });
      expect(shopping.status()).toBe(201);
      const shoppingId = (await json(shopping)).data.item.id as string;
      const edit = await pages.owner.request.patch(
        `/api/shopping/items/${shoppingId}`,
        {
          headers: origin(pages.owner),
          data: { name: `${id} shopping edited`, quantity: "2" }
        }
      );
      expect(edit.status()).toBe(200);
      signals.member.beginNavigation();
      await pages.member.goto("/shopping");
      await expect(pages.member.getByText(`${id} shopping edited`)).toBeVisible();
      const purchase = await pages.member.request.post(
        `/api/shopping/items/${shoppingId}/purchase`,
        {
          headers: origin(pages.member),
          data: {}
        }
      );
      expect(purchase.status()).toBe(200);
      signals.owner.setPhase("final-navigation");
      signals.owner.beginNavigation();
      await pages.owner.goto("/shopping");
      await expect(pages.owner).toHaveURL(/\/shopping$/);
      await expect(pages.owner.getByText(`${id} shopping edited`)).toBeVisible();
      await screenshot(pages.member, "member-shopping-state-reflection.png");
      completed.shoppingSync = true;

      // Do not call clear-purchased in persistent staging households: existing purchased
      // items may be present. Local tests jointly cover multi-image count/byte decrements,
      // R2 deletion failures and orphan queuing, and idempotent cleanup behavior.
      const deleteImageItem = await pages.owner.request.delete(
        `/api/shopping/items/${imageItemId}`,
        { headers: origin(pages.owner), data: {} }
      );
      expect(deleteImageItem.status()).toBe(200);
      const ownerUsageFinal = await currentImageUsage(pages.owner);
      const memberUsageFinal = await currentImageUsage(pages.member);
      const crossUsageFinal = await currentImageUsage(pages.cross);
      expect(memberUsageFinal).toEqual(ownerUsageFinal);
      expect(ownerUsageFinal.activeCount).toBe(ownerUsageStart.activeCount);
      expect(ownerUsageFinal.activeBytes).toBe(ownerUsageStart.activeBytes);
      expect(ownerUsageFinal.reservedCount).toBe(0);
      expect(ownerUsageFinal.reservedBytes).toBe(0);
      expect(ownerUsageFinal.pendingCleanupBytes).toBe(
        ownerUsageStart.pendingCleanupBytes
      );
      expect(ownerUsageFinal.storedBytes).toBe(ownerUsageStart.storedBytes);
      expect(ownerUsageFinal.dailyUploadCount).toBe(
        ownerUsageStart.dailyUploadCount + 3
      );
      expect(crossUsageFinal).toEqual(crossUsageStart);

      const expectedLoginAuth401: BrowserSignal[] = [];
      const expectedUnauthenticatedImageAuth401: BrowserSignal[] = [];
      const expectedCrossHouseItem404: BrowserSignal[] = [];
      const expectedBenignReadAborts: Array<{ signal: BrowserSignal; apiKind: string; pagePattern: string; apiPattern: string }> = [];
      const unexpectedConsoleErrors: BrowserSignal[] = [];
      const unexpectedRequestFailures: BrowserSignal[] = [];
      const contextNames = new Set<BrowserContextName>(["owner", "member", "unauth", "cross"]);
      const allSignals = Object.values(signals).flatMap((signal) => [
        ...signal.errors,
        ...signal.warnings,
        ...signal.pageErrors,
        ...signal.requestFailures
      ]);
      expect(
        allSignals.every((signal) => signal.context !== undefined && contextNames.has(signal.context)),
        "browser signal context must be defined"
      ).toBeTruthy();
      const expectedCountsByContext = (signals: BrowserSignal[]) => {
        const counts = new Map<string, number>();
        for (const signal of signals) counts.set(signal.context, (counts.get(signal.context) ?? 0) + 1);
        return counts;
      };
      const isExpectedLoginAuthCheck401 = (signal: BrowserSignal) =>
        signal.type === "console.error" &&
        signal.phase === "login" &&
        signal.pathname === "/login" &&
        signal.scriptPathname === "/api/auth/me" &&
        signal.message.includes("Failed to load resource") &&
        signal.message.includes("401") &&
        signal.line === 0 &&
        signal.column === 0;
      const isExpectedUnauthenticatedImageAuth401 = (signal: BrowserSignal) =>
        signal.type === "console.error" &&
        signal.phase === "unauthenticated-image" &&
        /^\/shopping\/items\/[^/]+$/.test(signal.pathname) &&
        signal.scriptPathname === "/api/auth/me" &&
        signal.message.includes("Failed to load resource") &&
        signal.message.includes("401") &&
        signal.line === 0 &&
        signal.column === 0;
      const isExpectedCrossHouseItem404 = (signal: BrowserSignal) =>
        signal.type === "console.error" &&
        signal.phase === "cross-house-image" &&
        /^\/shopping\/items\/[^/]+$/.test(signal.pathname) &&
        /^\/api\/shopping\/items\/[^/]+$/.test(signal.scriptPathname ?? "") &&
        signal.message.includes("Failed to load resource") &&
        signal.message.includes("404") &&
        signal.line === 0 &&
        signal.column === 0;
      type BenignReadAbortRule = {
        phase: string;
        contexts: BrowserContextName[];
        page: RegExp;
        pagePattern: string;
        api: RegExp;
        apiPattern: string;
        apiKind: string;
        completed: boolean;
      };
      const itemPagePath = /^\/shopping\/items\/[^/]+$/;
      const itemApiPath = /^\/api\/shopping\/items\/[^/]+$/;
      const taskPagePath = /^\/tasks\/[^/]+$/;
      const taskApiPath = /^\/api\/tasks\/[^/]+$/;
      const shoppingPagePath = /^\/shopping$/;
      const benignReadAbortRules: BenignReadAbortRule[] = [
        { phase: "login", contexts: ["owner", "member", "unauth", "cross"], page: /^\/login$/, pagePattern: "/login", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.login },
        { phase: "same-house-image", contexts: ["owner", "member"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.sameHouseImage },
        { phase: "same-house-image", contexts: ["owner", "member"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: itemApiPath, apiPattern: "/api/shopping/items/[id]", apiKind: "shopping/items/[id]", completed: completed.sameHouseImage },
        { phase: "same-house-image", contexts: ["owner", "member"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: /^\/api\/households\/current\/members$/, apiPattern: "/api/households/current/members", apiKind: "households/current/members", completed: completed.sameHouseImage },
        { phase: "deleted-image", contexts: ["owner"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.deletedImage },
        { phase: "task-sync", contexts: ["owner"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: itemApiPath, apiPattern: "/api/shopping/items/[id]", apiKind: "shopping/items/[id]", completed: completed.taskSync },
        { phase: "task-sync", contexts: ["owner"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: /^\/api\/households\/current\/members$/, apiPattern: "/api/households/current/members", apiKind: "households/current/members", completed: completed.taskSync },
        { phase: "task-sync", contexts: ["member"], page: /^\/tasks$/, pagePattern: "/tasks", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.taskSync },
        { phase: "task-sync", contexts: ["member"], page: taskPagePath, pagePattern: "/tasks/[id]", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.taskSync },
        { phase: "task-sync", contexts: ["member"], page: /^\/tasks$/, pagePattern: "/tasks", api: /^\/api\/tasks$/, apiPattern: "/api/tasks", apiKind: "tasks", completed: completed.taskSync },
        { phase: "task-sync", contexts: ["member"], page: taskPagePath, pagePattern: "/tasks/[id]", api: taskApiPath, apiPattern: "/api/tasks/[id]", apiKind: "tasks/[id]", completed: completed.taskSync },
        { phase: "task-sync", contexts: ["member"], page: taskPagePath, pagePattern: "/tasks/[id]", api: /^\/api\/tasks$/, apiPattern: "/api/tasks", apiKind: "tasks", completed: completed.taskSync },
        { phase: "shopping-sync", contexts: ["member"], page: taskPagePath, pagePattern: "/tasks/[id]", api: taskApiPath, apiPattern: "/api/tasks/[id]", apiKind: "tasks/[id]", completed: completed.shoppingSync },
        { phase: "shopping-sync", contexts: ["member"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.shoppingSync },
        { phase: "shopping-sync", contexts: ["member"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/shopping\/items$/, apiPattern: "/api/shopping/items", apiKind: "shopping/items", completed: completed.shoppingSync },
        { phase: "shopping-sync", contexts: ["member"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/shopping\/templates$/, apiPattern: "/api/shopping/templates", apiKind: "shopping/templates", completed: completed.shoppingSync },
        { phase: "shopping-sync", contexts: ["member"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/households\/current\/members$/, apiPattern: "/api/households/current/members", apiKind: "households/current/members", completed: completed.shoppingSync },
        { phase: "final-navigation", contexts: ["owner"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.shoppingSync },
        { phase: "final-navigation", contexts: ["owner"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/shopping\/items$/, apiPattern: "/api/shopping/items", apiKind: "shopping/items", completed: completed.shoppingSync },
        { phase: "final-navigation", contexts: ["owner"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/shopping\/templates$/, apiPattern: "/api/shopping/templates", apiKind: "shopping/templates", completed: completed.shoppingSync },
        { phase: "final-navigation", contexts: ["owner"], page: shoppingPagePath, pagePattern: "/shopping", api: /^\/api\/households\/current\/members$/, apiPattern: "/api/households/current/members", apiKind: "households/current/members", completed: completed.shoppingSync },
        { phase: "unauthenticated-image", contexts: ["unauth"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.unauthenticatedRejection },
        { phase: "cross-house-image", contexts: ["cross"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: /^\/api\/auth\/me$/, apiPattern: "/api/auth/me", apiKind: "auth/me", completed: completed.crossHouseRejection },
        { phase: "cross-house-image", contexts: ["cross"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: itemApiPath, apiPattern: "/api/shopping/items/[id]", apiKind: "shopping/items/[id]", completed: completed.crossHouseRejection },
        { phase: "cross-house-image", contexts: ["cross"], page: itemPagePath, pagePattern: "/shopping/items/[id]", api: /^\/api\/households\/current\/members$/, apiPattern: "/api/households/current/members", apiKind: "households/current/members", completed: completed.crossHouseRejection }
      ];
      const classifyBenignReadAbort = (signal: BrowserSignal) => {
        if (
          signal.type !== "requestfailed" ||
          signal.message !== "net::ERR_ABORTED" ||
          (signal.method !== "GET" && signal.method !== "HEAD") ||
          signal.requestGeneration === undefined ||
          signal.navigationGeneration === undefined
        ) return null;
        const apiPath = signal.scriptPathname ?? "";
        return benignReadAbortRules.find((rule) =>
          rule.completed &&
          rule.phase === signal.phase &&
          rule.contexts.includes(signal.context) &&
          rule.page.test(signal.pathname) &&
          rule.api.test(apiPath)
        ) ?? null;
      };
      for (const signal of Object.values(signals)) {
        for (const error of signal.errors) {
          if (isExpectedLoginAuthCheck401(error)) {
            expectedLoginAuth401.push(error);
          } else if (error.context === "unauth" && isExpectedUnauthenticatedImageAuth401(error)) {
            expectedUnauthenticatedImageAuth401.push(error);
          } else if (error.context === "cross" && isExpectedCrossHouseItem404(error)) {
            expectedCrossHouseItem404.push(error);
          } else {
            unexpectedConsoleErrors.push(error);
          }
        }
        for (const failure of signal.requestFailures) {
          const rule = classifyBenignReadAbort(failure);
          if (rule) expectedBenignReadAborts.push({ signal: failure, apiKind: rule.apiKind, pagePattern: rule.pagePattern, apiPattern: rule.apiPattern });
          else unexpectedRequestFailures.push(failure);
        }
      }
      for (const [context, count] of expectedCountsByContext(expectedLoginAuth401)) {
        expect(count, `${context} expected login auth check 401 count`).toBeLessThanOrEqual(1);
      }
      expect(expectedCountsByContext(expectedUnauthenticatedImageAuth401).get("unauth") ?? 0, "unauth expected image auth 401 count").toBeLessThanOrEqual(1);
      expect(expectedCountsByContext(expectedCrossHouseItem404).get("cross") ?? 0, "cross expected item 404 count").toBeLessThanOrEqual(1);
      const normalizedNavigationPath = (value: string | undefined) =>
        value
          ?.replace(/^\/shopping\/items\/[^/]+$/, "/shopping/items/[id]")
          .replace(/^\/tasks\/[^/]+$/, "/tasks/[id]")
          .replace(/^\/api\/shopping\/items\/[^/]+$/, "/api/shopping/items/[id]")
          .replace(/^\/api\/tasks\/[^/]+$/, "/api/tasks/[id]") ?? "[unknown]";
      const navigationAbortCounts = new Map<string, number>();
      for (const abort of expectedBenignReadAborts) {
        const { signal } = abort;
        const key = `${signal.context}|${signal.phase}|${abort.pagePattern}|${signal.method}|${abort.apiPattern}|${signal.navigationGeneration}`;
        navigationAbortCounts.set(key, (navigationAbortCounts.get(key) ?? 0) + 1);
      }
      for (const [key, count] of navigationAbortCounts) {
        expect(count, `${key} expected benign read abort count`).toBeLessThanOrEqual(1);
      }
      console.log("staging expected console errors", JSON.stringify({
        expectedLoginAuth401: { count: expectedLoginAuth401.length, types: expectedLoginAuth401.map((error) => error.type) },
        expectedUnauthenticatedImageAuth401: { count: expectedUnauthenticatedImageAuth401.length, types: expectedUnauthenticatedImageAuth401.map((error) => error.type) },
        expectedCrossHouseItem404: { count: expectedCrossHouseItem404.length, types: expectedCrossHouseItem404.map((error) => error.type) }
      }));
      const expectedBenignReadAbortSummary = new Map<string, { context: BrowserContextName; phase: string; apiKind: string; count: number }>();
      for (const abort of expectedBenignReadAborts) {
        const { signal } = abort;
        const key = `${signal.context}|${signal.phase}|${abort.apiKind}`;
        const current = expectedBenignReadAbortSummary.get(key);
        expectedBenignReadAbortSummary.set(key, current
          ? { ...current, count: current.count + 1 }
          : { context: signal.context, phase: signal.phase, apiKind: abort.apiKind, count: 1 });
      }
      console.log("staging expected benign read aborts", JSON.stringify({
        count: expectedBenignReadAborts.length,
        summary: [...expectedBenignReadAbortSummary.values()]
      }));
      const safeRequestFailure = (failure: BrowserSignal) => ({
        context: failure.context,
        phase: failure.phase,
        method: failure.method,
        pathname: normalizedNavigationPath(failure.pathname),
        apiPathname: normalizedNavigationPath(failure.scriptPathname),
        message: failure.message,
        requestGeneration: failure.requestGeneration,
        navigationGeneration: failure.navigationGeneration
      });
      console.log("staging unexpected request failures", JSON.stringify({
        count: unexpectedRequestFailures.length,
        records: unexpectedRequestFailures.slice(0, 10).map(safeRequestFailure),
        remaining: Math.max(0, unexpectedRequestFailures.length - 10)
      }));
      expect(unexpectedConsoleErrors, "unexpected console errors").toEqual([]);
      expect(unexpectedRequestFailures.length, "unexpected request failures").toBe(0);
      for (const [name, signal] of Object.entries(signals)) {
        expect(signal.warnings, `${name} console warnings`).toEqual([]);
        expect(signal.pageErrors, `${name} page errors`).toEqual([]);
      }
    } finally {
      await Promise.all(Object.values(contexts).map((context) => context.close()));
    }
  });
});
