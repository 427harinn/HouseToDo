import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, request } from "@playwright/test";

const base = process.env.M7_LOCAL_BASE_URL ?? "http://127.0.0.1:8789";
const outputDir = "docs/evidence/m7/motion";
const rawDir = `${outputDir}/raw`;
const password = "very-long-password";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const settled = (page) => page.waitForTimeout(650);
const origin = { origin: base };

await mkdir(rawDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

async function setupPair(label) {
  const id = stamp();
  const apiA = await request.newContext({ baseURL: base, extraHTTPHeaders: origin });
  const apiB = await request.newContext({ baseURL: base, extraHTTPHeaders: origin });
  const nameA = `M7 ${label} Owner ${id}`;
  const nameB = `M7 ${label} Member ${id}`;
  const registerA = await apiA.post("/api/auth/register", {
    data: {
      email: `m7-motion-a-${label}-${id}@example.test`,
      displayName: nameA,
      password
    }
  });
  if (registerA.status() !== 201)
    throw new Error(`owner register failed: ${registerA.status()}`);
  const household = await apiA.post("/api/households", {
    data: { name: `M7 ${label} House ${id}` }
  });
  if (household.status() !== 201)
    throw new Error(`household create failed: ${household.status()}`);
  const invite = await apiA.post("/api/households/current/invites", { data: {} });
  if (invite.status() !== 201)
    throw new Error(`invite create failed: ${invite.status()}`);
  const code = (await invite.json()).data.invite.code;
  const registerB = await apiB.post("/api/auth/register", {
    data: {
      email: `m7-motion-b-${label}-${id}@example.test`,
      displayName: nameB,
      password
    }
  });
  if (registerB.status() !== 201)
    throw new Error(`member register failed: ${registerB.status()}`);
  const join = await apiB.post("/api/households/join", { data: { code } });
  if (join.status() !== 200) throw new Error(`member join failed: ${join.status()}`);
  const pair = {
    id,
    nameA,
    nameB,
    stateA: await apiA.storageState(),
    stateB: await apiB.storageState(),
    apiA,
    apiB
  };
  return pair;
}

async function recordPair(kind, action) {
  const pair = await setupPair(kind);
  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext({
    storageState: pair.stateA,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: rawDir, size: { width: 390, height: 844 } }
  });
  const contextB = await browser.newContext({
    storageState: pair.stateB,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: rawDir, size: { width: 390, height: 844 } }
  });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const videoA = pageA.video();
  const videoB = pageB.video();
  try {
    await action(pageA, pageB, pair);
  } finally {
    await contextA.close();
    await contextB.close();
    await browser.close();
    await pair.apiA.dispose();
    await pair.apiB.dispose();
  }
  if (!videoA || !videoB) throw new Error(`${kind}: both browser videos are required`);
  const sourceA = await videoA.path();
  const sourceB = await videoB.path();
  const rawA = `${rawDir}/user-a-${kind}.webm`;
  const rawB = `${rawDir}/user-b-${kind}.webm`;
  await copyFile(sourceA, rawA);
  await copyFile(sourceB, rawB);
  return { rawA, rawB };
}

async function composeSideBySide(rawA, rawB, output) {
  const videoA = `data:video/webm;base64,${(await readFile(rawA)).toString("base64")}`;
  const videoB = `data:video/webm;base64,${(await readFile(rawB)).toString("base64")}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const encoded = await page.evaluate(
    async ({ sourceA, sourceB }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 780;
      canvas.height = 900;
      document.body.append(canvas);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      const videos = [document.createElement("video"), document.createElement("video")];
      for (const video of videos) {
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
      }
      videos[0].src = sourceA;
      videos[1].src = sourceB;
      await Promise.all(
        videos.map(
          (video) =>
            new Promise((resolve, reject) => {
              video.addEventListener("loadedmetadata", resolve, { once: true });
              video.addEventListener(
                "error",
                () => reject(new Error("raw video decode failed")),
                { once: true }
              );
            })
        )
      );
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const duration = Math.max(...videos.map((video) => video.duration || 1));
      const draw = () => {
        context.fillStyle = "#123c3a";
        context.fillRect(0, 0, 780, 56);
        context.fillStyle = "white";
        context.font = "bold 22px Arial";
        context.fillText("USER A / OWNER", 18, 36);
        context.fillText("USER B / MEMBER", 408, 36);
        context.fillStyle = "#f7faf9";
        context.fillRect(0, 56, 780, 844);
        context.drawImage(videos[0], 0, 56, 390, 844);
        context.drawImage(videos[1], 390, 56, 390, 844);
        if (!videos.every((video) => video.ended)) requestAnimationFrame(draw);
      };
      recorder.start(100);
      await Promise.all(videos.map((video) => video.play()));
      draw();
      await new Promise((resolve) =>
        setTimeout(resolve, Math.ceil(duration * 1000) + 900)
      );
      recorder.stop();
      await new Promise((resolve) => {
        recorder.addEventListener("stop", resolve, { once: true });
      });
      const blob = new Blob(chunks, { type: "video/webm" });
      const buffer = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    },
    { sourceA: videoA, sourceB: videoB }
  );
  await writeFile(output, Buffer.from(encoded));
  await browser.close();
}

async function createTask(page, name, assignee) {
  await page.goto(`${base}/tasks/new`);
  await page.locator("#m2-task-title").fill(name);
  await page.locator("#m2-task-description").fill("M7 motion task");
  await page.getByRole("button", { name: "担当: 誰でも" }).click();
  await page.getByRole("dialog").getByRole("button", { name: assignee }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL(/\/home$/);
}

const taskPair = await recordPair("task", async (pageA, pageB, pair) => {
  const title = `M7 motion task ${pair.id}`;
  await pageA.goto(`${base}/home`);
  await pageB.goto(`${base}/home`);
  await Promise.all([settled(pageA), settled(pageB)]);
  await createTask(pageA, title, pair.nameB);
  await settled(pageA);
  await pageB.reload();
  await pageB.getByRole("button", { name: `${title}を完了` }).waitFor();
  await settled(pageB);
  await pageB.getByRole("button", { name: `${title}を完了` }).click();
  await pageB.getByRole("button", { name: /完了済み 1/ }).waitFor();
  await settled(pageB);
  await pageA.reload();
  await pageA.getByRole("button", { name: /完了済み 1/ }).click();
  await pageA
    .locator(".m2-home__history-list .m2-home__row", { hasText: title })
    .getByRole("img", { name: `完了者: ${pair.nameB}` })
    .waitFor();
  await settled(pageA);
  const rowA = pageA.locator(".m2-home__history-list .m2-home__row", {
    hasText: title
  });
  const box = await rowA.boundingBox();
  if (!box) throw new Error("task completed row not visible");
  await pageA.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await pageA.mouse.down();
  await pageA.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, {
    steps: 8
  });
  await pageA.mouse.up();
  await rowA.getByRole("button", { name: "戻す" }).click();
  await settled(pageA);
  await pageB.reload();
  await pageB.getByRole("button", { name: `${title}を完了` }).waitFor();
  await settled(pageB);
});
await composeSideBySide(
  taskPair.rawA,
  taskPair.rawB,
  `${outputDir}/two-user-task-sync.webm`
);

const shoppingPair = await recordPair("shopping", async (pageA, pageB, pair) => {
  const item = `M7 motion item ${pair.id}`;
  const second = `M7 motion second ${pair.id}`;
  const planned = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  await pageA.goto(`${base}/shopping/new`);
  await pageA.locator("#shopping-name").fill(item);
  await pageA.locator("#shopping-quantity").fill("1個");
  await pageA.locator("#shopping-planned-purchase-date").fill(planned);
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await pageA.waitForURL(/\/shopping\?item=/);
  await settled(pageA);
  await pageB.goto(`${base}/shopping`);
  await pageB.locator("[data-shopping-m4-id]", { hasText: item }).waitFor();
  await settled(pageB);
  await pageA.goto(`${base}/shopping/new`);
  await pageA.locator("#shopping-name").fill(second);
  await pageA.locator("#shopping-quantity").fill("1個");
  await pageA.getByRole("button", { name: "保存", exact: true }).click();
  await pageA.goto(`${base}/shopping`);
  const first = pageA.locator("[data-shopping-m4-id]", { hasText: item });
  const secondRow = pageA.locator("[data-shopping-m4-id]", { hasText: second });
  const firstBox = await first.boundingBox();
  const secondBox = await secondRow.boundingBox();
  if (!firstBox || !secondBox) throw new Error("shopping reorder rows not visible");
  await pageA.mouse.move(
    firstBox.x + firstBox.width / 2,
    firstBox.y + firstBox.height / 2
  );
  await pageA.mouse.down();
  await pageA.waitForTimeout(420);
  await pageA.mouse.move(
    secondBox.x + secondBox.width / 2,
    secondBox.y + secondBox.height / 2,
    { steps: 10 }
  );
  await pageA.mouse.up();
  await settled(pageA);
  await pageB.reload();
  await pageB.locator("[data-shopping-m4-id]", { hasText: second }).waitFor();
  await settled(pageB);
  const itemRowB = pageB.locator("[data-shopping-m4-id]", { hasText: item });
  await itemRowB.getByRole("button", { name: new RegExp(item) }).click();
  await itemRowB.getByRole("button", { name: "購入" }).click();
  await pageB.getByRole("button", { name: /購入済み 1件/ }).waitFor();
  await settled(pageB);
  await pageA.reload();
  await pageA.getByRole("button", { name: /購入済み 1件/ }).click();
  await pageA
    .locator("[data-shopping-m4-id]", { hasText: item })
    .getByRole("img", { name: `購入者: ${pair.nameB}` })
    .waitFor();
  await settled(pageA);
  const purchasedA = pageA.locator("[data-shopping-m4-id]", { hasText: item });
  await purchasedA.getByRole("button", { name: new RegExp(item) }).click();
  await purchasedA.getByRole("button", { name: "戻す" }).click();
  await settled(pageA);
  await pageB.reload();
  await pageB.locator("[data-shopping-m4-id]", { hasText: item }).waitFor();
  await pageB
    .locator("[data-shopping-m4-id]", { hasText: item })
    .getByRole("button", { name: new RegExp(item) })
    .click();
  await pageB
    .locator("[data-shopping-m4-id]", { hasText: item })
    .getByText(/購入予定日/)
    .waitFor();
  await settled(pageB);
});
await composeSideBySide(
  shoppingPair.rawA,
  shoppingPair.rawB,
  `${outputDir}/two-user-shopping-sync.webm`
);

const navPair = await setupPair("navigation");
const navBrowser = await chromium.launch({ headless: true });
const navContext = await navBrowser.newContext({
  storageState: navPair.stateA,
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: rawDir, size: { width: 390, height: 844 } }
});
const navPage = await navContext.newPage();
await navPage.goto(`${base}/home`);
await settled(navPage);
await navPage.getByRole("button", { name: "カレンダー" }).click();
await navPage.getByRole("grid", { name: /カレンダー/ }).waitFor();
await settled(navPage);
await navPage.getByRole("button", { name: "追加" }).click();
await navPage.getByRole("dialog").waitFor();
await settled(navPage);
await navPage.getByRole("button", { name: "閉じる", exact: true }).click();
await navPage.getByRole("button", { name: "買い物" }).click();
await navPage.getByRole("heading", { name: "買い物" }).waitFor();
await settled(navPage);
await navPage.getByRole("button", { name: "その他" }).click();
await navPage.getByRole("heading", { name: "その他" }).waitFor();
await settled(navPage);
await navPage.getByRole("button", { name: "ホーム" }).click();
await navPage.getByRole("heading", { name: "やること" }).waitFor();
await settled(navPage);
const navVideo = navPage.video();
await navContext.close();
await navBrowser.close();
await navPair.apiA.dispose();
await navPair.apiB.dispose();
if (!navVideo) throw new Error("canonical navigation video missing");
await copyFile(await navVideo.path(), `${outputDir}/canonical-navigation.webm`);

const pwaPair = await setupPair("pwa");
const pwaItem = await pwaPair.apiA.post("/api/shopping/items", {
  data: {
    name: `M7 PWA motion ${pwaPair.id}`,
    quantity: "1個",
    plannedPurchaseDate: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date())
  }
});
if (pwaItem.status() !== 201)
  throw new Error(`pwa item setup failed: ${pwaItem.status()}`);
const pwaItemId = (await pwaItem.json()).data.item.id;
const pwaBrowser = await chromium.launch({ headless: true });
const pwaContext = await pwaBrowser.newContext({
  storageState: pwaPair.stateA,
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: rawDir, size: { width: 390, height: 844 } }
});
const pwaPage = await pwaContext.newPage();
await pwaPage.goto(`${base}/shopping?item=${pwaItemId}`);
const pwaRow = pwaPage.locator(`[data-shopping-m4-id="${pwaItemId}"]`);
await pwaRow.waitFor();
await pwaRow
  .getByRole("button", { name: new RegExp(`M7 PWA motion ${pwaPair.id}`) })
  .waitFor();
if (
  (await pwaRow
    .getByRole("button", { name: new RegExp(`M7 PWA motion ${pwaPair.id}`) })
    .getAttribute("aria-expanded")) !== "true"
)
  throw new Error("PWA deep link target is not expanded");
await pwaRow.getByRole("button", { name: "購入" }).waitFor();
await settled(pwaPage);
await pwaPage.reload();
await pwaRow.getByRole("button", { name: "購入" }).waitFor();
await settled(pwaPage);
await pwaPage.getByRole("button", { name: "カレンダー" }).click();
await pwaPage.getByRole("grid", { name: /カレンダー/ }).waitFor();
await settled(pwaPage);
await pwaPage.reload();
await pwaPage.getByRole("grid", { name: /カレンダー/ }).waitFor();
await settled(pwaPage);
await pwaPage.getByRole("button", { name: "ホーム" }).click();
await pwaPage.getByRole("heading", { name: "やること" }).waitFor();
await settled(pwaPage);
const pwaVideo = pwaPage.video();
await pwaContext.close();
await pwaBrowser.close();
await pwaPair.apiA.dispose();
await pwaPair.apiB.dispose();
if (!pwaVideo) throw new Error("PWA motion video missing");
await copyFile(await pwaVideo.path(), `${outputDir}/pwa-reload-deeplink.webm`);

console.log(
  JSON.stringify({
    base,
    raw: [taskPair.rawA, taskPair.rawB, shoppingPair.rawA, shoppingPair.rawB],
    outputs: [
      "canonical-navigation.webm",
      "two-user-task-sync.webm",
      "two-user-shopping-sync.webm",
      "pwa-reload-deeplink.webm"
    ]
  })
);
