/* global document, HTMLElement, HTMLInputElement, window */
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { setInterval as setIntervalTimer, clearInterval as clearIntervalTimer } from "node:timers";
import { mkdir, rm, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("docs/evidence/m6");
const productionRoot = path.join(root, "production");
const mockupRoot = path.join(root, "mockup");
const motionRoot = path.join(root, "motion");
const previewRoot = path.join(motionRoot, "previews");
const reviewRoot = path.join(root, "review-upload");
const productionBase = process.env.M6_PRODUCTION_BASE_URL ?? "http://127.0.0.1:5173";
const mockupBase = process.env.M6_MOCKUP_BASE_URL ?? "http://127.0.0.1:5175";
const productionSha = process.env.M6_PRODUCTION_SHA ?? "working-tree-m6";
const mockupSha = process.env.M6_MOCKUP_SHA ?? "db8941dc3056f07862014242a349ae366da59e9c";
const geometryPath = path.join(root, "geometry.json");

const user = { id: "m6-user", email: "m6@example.test", displayName: "M6 User" };
const household = { id: "m6-household", name: "M6 House", timezone: "Asia/Tokyo", weekStartsOn: 1, role: "owner" };
const emptyDashboard = { date: "2026-08-26", household, summary: { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 }, todayTasks: [], homeTasks: [], weeklyTasks: [], completedRecords: [], passedRecords: [], shopping: { pendingCount: 0, previewItems: [] }, members: [] };

const response = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: true, data, requestId: "m6-evidence" }) });
const failure = (route, code, status) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code, message: "fixture error" }, requestId: "m6-evidence" }) });

const makeState = (overrides = {}) => ({ authenticated: false, currentHousehold: null, validInvite: false, loginFailure: false, ...overrides });

async function installProductionApi(page, state) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return state.authenticated ? response(route, { user }) : failure(route, "UNAUTHENTICATED", 401);
    if (url.pathname === "/api/auth/login") {
      if (state.loginFailure) return failure(route, "UNAUTHENTICATED", 401);
      state.authenticated = true;
      return response(route, { user });
    }
    if (url.pathname === "/api/auth/register") {
      state.authenticated = true;
      return response(route, { user }, 201);
    }
    if (url.pathname === "/api/households/current") return response(route, { household: state.currentHousehold });
    if (url.pathname === "/api/households/invites/validate") return response(route, { valid: state.validInvite });
    if (url.pathname === "/api/households/join") {
      const body = JSON.parse(request.postData() ?? "{}");
      if (body.code !== "VALID-CODE") return failure(route, "INVALID_INVITE", 400);
      state.currentHousehold = household;
      return response(route, { household });
    }
    if (url.pathname === "/api/households") {
      state.currentHousehold = household;
      return response(route, { household }, 201);
    }
    if (url.pathname === "/api/dashboard/today") return response(route, emptyDashboard);
    return failure(route, "NOT_FOUND", 404);
  });
}

async function neutralize(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.addStyleTag({ content: "* { caret-color: transparent !important; }" });
  await page.mouse.move(8, 8);
  await page.waitForTimeout(250);
  const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? "BODY");
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(activeTag)) {
    throw new Error(`Evidence capture retained focus on ${activeTag}`);
  }
}

async function clearVisualValues(page, ids) {
  await page.evaluate((inputIds) => {
    for (const id of inputIds) {
      const input = document.getElementById(id);
      if (input instanceof HTMLInputElement) input.value = "";
    }
  }, ids);
}

async function fillRegister(page, code = "") {
  await page.getByLabel("表示名").fill("M6 User");
  await page.getByLabel("メールアドレス").fill("m6@example.test");
  await page.getByLabel("パスワード").fill("very-long-password");
  if (code) await page.getByLabel("招待コード（任意）").fill(code);
}

async function assertProductionState(page, kind, state) {
  const headings = { login: "ログイン", register: "新規登録", "household-create": "家庭を作る", "household-join": "招待から参加" };
  await page.getByRole("heading", { name: headings[kind] }).waitFor({ state: "visible" });
  if (kind === "login") {
    if (state === "error") {
      await page.getByLabel("メールアドレス").fill("bad@example.test");
      await page.getByLabel("パスワード").fill("wrong-password");
      await page.getByRole("button", { name: "ログイン" }).click();
      await page.getByRole("alert").filter({ hasText: "メールアドレスまたはパスワードが正しくありません" }).waitFor();
      if (await page.getByLabel("パスワード").getAttribute("aria-invalid") !== "true") throw new Error("login error state was not semantic");
    }
  } else if (kind === "register") {
    if (state === "error") {
      await page.getByRole("button", { name: "新規登録" }).click();
      await page.getByRole("alert").filter({ hasText: "入力内容を確認してください" }).waitFor();
    } else if (state === "invite-code") {
      await page.getByLabel("招待コード（任意）").fill("HT-2026");
      if (await page.getByLabel("招待コード（任意）").inputValue() !== "HT-2026") throw new Error("register invite fixture did not render");
    } else if (state === "invalid-invite-code") {
      await page.getByLabel("表示名").fill("M6 User");
      await page.getByLabel("メールアドレス").fill("m6@example.test");
      await page.getByLabel("パスワード").fill("very-long-password");
      await page.getByLabel("招待コード（任意）").fill("INVALID");
      await page.getByRole("button", { name: "新規登録" }).click();
      await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).waitFor();
      if (await page.getByLabel("招待コード（任意）").getAttribute("aria-invalid") !== "true") throw new Error("register invite error was not semantic");
    }
  } else if (kind === "household-join" && state === "invalid-code") {
    await page.getByLabel("招待コード").fill("INVALID");
    await page.getByRole("button", { name: "参加する" }).click();
    await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).waitFor();
    if (await page.getByLabel("招待コード").getAttribute("aria-invalid") !== "true") throw new Error("join error state was not semantic");
  }
}

async function assertMockupState(page, kind, state) {
  await page.locator("[data-uilab-component='Entry.Page']").waitFor({ state: "visible" });
  const heading = { login: "ログイン", register: "新規登録", "household-create": "家庭を作る", "household-join": "招待から参加" }[kind];
  await page.getByRole("heading", { name: heading }).waitFor({ state: "visible" });
  if (kind === "login" && state === "error") {
    if (await page.getByRole("alert").filter({ hasText: "メールアドレスまたはパスワードが正しくありません" }).count() !== 1) throw new Error("Mockup login error mismatch");
  }
  if (kind === "register" && state === "error") await page.getByRole("alert").filter({ hasText: "入力内容を確認してください" }).waitFor();
  if (kind === "register" && state === "invite-code" && await page.getByLabel("招待コード（任意）").inputValue() !== "HT-2026") throw new Error("Mockup invite state mismatch");
  if (kind === "register" && state === "invalid-invite-code") {
    await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).waitFor();
    if (await page.getByLabel("招待コード（任意）").getAttribute("aria-invalid") !== "true") throw new Error("Mockup invite error mismatch");
  }
  if (kind === "household-join" && state === "invalid-code") {
    await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).waitFor();
    if (await page.getByLabel("招待コード").getAttribute("aria-invalid") !== "true") throw new Error("Mockup join error mismatch");
  }
}

const matrix = [
  ["login", "normal"], ["login", "error"], ["register", "normal"], ["register", "error"], ["register", "invite-code"], ["register", "invalid-invite-code"], ["household-create", "normal"], ["household-join", "normal"], ["household-join", "invalid-code"]
];

async function captureEntryGeometry(page, source, kind, state) {
  const geometry = await page.evaluate(() => {
    const rect = (element) => element?.getBoundingClientRect();
    const inputs = [...document.querySelectorAll(".entry-page input")].map((input) => {
      const style = window.getComputedStyle(input);
      const field = input.closest(".form-field, .form-control");
      const marker = field?.firstElementChild;
      const inputRect = rect(input);
      const markerRect = rect(marker);
      return {
        height: inputRect?.height ?? null,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
        labelToInputGap: inputRect && markerRect ? inputRect.top - markerRect.bottom : null
      };
    });
    const buttonRect = rect(document.querySelector(".entry-primary-action"));
    const linkRect = rect(document.querySelector(".entry-link-row"));
    return {
      inputs,
      buttonToSecondaryLinkGap: buttonRect && linkRect ? linkRect.top - buttonRect.bottom : null
    };
  });
  return { source, kind, state, ...geometry };
}

async function captureScreenshots(browser) {
  const geometry = [];
  const production = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const [kind, state] of matrix) {
    const auth = kind.startsWith("household") ? makeState({ authenticated: true }) : makeState();
    if (kind === "login" && state === "error") auth.loginFailure = true;
    if (kind === "register" && state === "invalid-invite-code") auth.validInvite = false;
    await installProductionApi(production, auth);
    await production.goto(`${productionBase}/${kind === "household-create" ? "household/create" : kind === "household-join" ? "household/join" : kind}?m6Evidence=${state}`);
    await assertProductionState(production, kind, state);
    geometry.push(await captureEntryGeometry(production, "production", kind, state));
    if (kind === "login" && state === "error") await clearVisualValues(production, ["login-email", "login-password"]);
    if (kind === "register" && state === "error") await clearVisualValues(production, ["register-name", "register-email", "register-password", "register-invite-code"]);
    if (kind === "register" && state === "invalid-invite-code") await clearVisualValues(production, ["register-name", "register-email", "register-password"]);
    await neutralize(production);
    await production.screenshot({ path: path.join(productionRoot, `${kind}-${state}.png`), animations: "disabled" });
    await production.unroute("**/api/**");
  }
  await production.close();

  const mockup = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const [kind, state] of matrix) {
    const pathName = kind === "household-create" ? "household/create" : kind === "household-join" ? "household/join" : kind;
    await mockup.goto(`${mockupBase}/#/${pathName}?uilabState=${state}`);
    await assertMockupState(mockup, kind, state);
    geometry.push(await captureEntryGeometry(mockup, "mockup", kind, state));
    await neutralize(mockup);
    await mockup.screenshot({ path: path.join(mockupRoot, `${kind}-${state}.png`), animations: "disabled" });
  }
  await mockup.close();
  const parity = matrix.filter(([, state]) => state === "normal").map(([kind]) => {
    const productionGeometry = geometry.find((item) => item.source === "production" && item.kind === kind && item.state === "normal");
    const mockupGeometry = geometry.find((item) => item.source === "mockup" && item.kind === kind && item.state === "normal");
    const productionComparable = { inputs: productionGeometry?.inputs, buttonToSecondaryLinkGap: productionGeometry?.buttonToSecondaryLinkGap };
    const mockupComparable = { inputs: mockupGeometry?.inputs, buttonToSecondaryLinkGap: mockupGeometry?.buttonToSecondaryLinkGap };
    if (JSON.stringify(productionComparable) !== JSON.stringify(mockupComparable)) {
      throw new Error(`Entry geometry parity mismatch for ${kind}: ${JSON.stringify({ production: productionComparable, mockup: mockupComparable })}`);
    }
    return { kind, production: productionComparable, mockup: mockupComparable, matches: true };
  });
  await writeFile(geometryPath, JSON.stringify({ viewport: { width: 390, height: 844 }, productionSha, mockupSha, captures: geometry, parity }, null, 2));
}

async function recordFlow(browser, name, flow) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: motionRoot, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  const frameDir = path.join(motionRoot, "frames", name.replace(/\.webm$/, ""));
  await mkdir(frameDir, { recursive: true });
  const frames = [];
  let frameIndex = 0;
  const captureFrame = async () => {
    const framePath = path.join(frameDir, `${String(frameIndex++).padStart(4, "0")}.png`);
    frames.push(framePath);
    await page.screenshot({ path: framePath, animations: "disabled" });
  };
  await captureFrame();
  const frameTimer = setIntervalTimer(() => { void captureFrame(); }, 250);
  await flow(page);
  clearIntervalTimer(frameTimer);
  await captureFrame();
  const video = page.video();
  const videoPath = video ? await video.path() : null;
  await context.close();
  if (!videoPath) throw new Error(`No video recorded for ${name}`);
  await copyFile(videoPath, path.join(motionRoot, name));
  await rm(videoPath, { force: true });
  await makeGif(frames, path.join(previewRoot, name.replace(/\.webm$/, ".gif")));
}

async function makeGif(frames, output) {
  const width = 390;
  const height = 844;
  const rawFrames = [];
  for (const frame of frames) {
    rawFrames.push(await sharp(frame).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer());
  }
  if (rawFrames.length === 0) throw new Error(`No GIF frames for ${output}`);
  const joined = Buffer.concat(rawFrames);
  await sharp(joined, { raw: { width, height: height * rawFrames.length, channels: 3, pageHeight: height } })
    .gif({ delay: rawFrames.map(() => 250), loop: 0 })
    .toFile(output);
}

async function recordFlows(browser) {
  await recordFlow(browser, "login-flow.webm", async (page) => {
    const state = makeState({ currentHousehold: household, loginFailure: true });
    await installProductionApi(page, state);
    await page.goto(`${productionBase}/login`);
    await page.getByRole("heading", { name: "ログイン" }).waitFor();
    await page.getByLabel("メールアドレス").fill("m6@example.test");
    await page.getByLabel("パスワード").fill("wrong-password");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.getByRole("alert").filter({ hasText: "メールアドレスまたはパスワードが正しくありません" }).waitFor();
    await page.waitForTimeout(700);
    state.loginFailure = false;
    await page.getByLabel("パスワード").fill("very-long-password");
    if (await page.getByRole("alert").filter({ hasText: "メールアドレスまたはパスワードが正しくありません" }).count() !== 0) throw new Error("login error did not clear after corrected credentials");
    if (await page.getByLabel("パスワード").getAttribute("aria-invalid") !== "false") throw new Error("login aria-invalid did not clear after corrected credentials");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.getByRole("heading", { name: "やること" }).waitFor();
    await page.waitForTimeout(700);
  });
  await recordFlow(browser, "register-create-household.webm", async (page) => {
    const state = makeState();
    await installProductionApi(page, state);
    await page.goto(`${productionBase}/register`);
    await fillRegister(page);
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "新規登録" }).click();
    await page.getByRole("heading", { name: "家庭を作る" }).waitFor();
    await page.waitForTimeout(500);
    await page.getByLabel("家庭名").fill("M6 Home");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "家庭を作る" }).click();
    await page.getByRole("heading", { name: "やること" }).waitFor();
    await page.waitForTimeout(700);
  });
  await recordFlow(browser, "register-invite.webm", async (page) => {
    const state = makeState({ validInvite: false });
    await installProductionApi(page, state);
    await page.goto(`${productionBase}/register`);
    await fillRegister(page, "INVALID-CODE");
    await page.getByRole("button", { name: "新規登録" }).click();
    await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).waitFor();
    await page.waitForTimeout(700);
    state.validInvite = true;
    await page.getByLabel("招待コード（任意）").fill("VALID-CODE");
    if (await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).count() !== 0) throw new Error("register invite error did not clear after input change");
    if (await page.getByLabel("招待コード（任意）").getAttribute("aria-invalid") !== "false") throw new Error("register invite aria-invalid did not clear after input change");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "新規登録" }).click();
    await page.getByRole("heading", { name: "やること" }).waitFor();
    await page.waitForTimeout(700);
  });
  await recordFlow(browser, "household-entry.webm", async (page) => {
    const state = makeState({ authenticated: true, validInvite: true });
    await installProductionApi(page, state);
    await page.goto(`${productionBase}/household/join`);
    await page.getByLabel("招待コード").fill("INVALID-CODE");
    await page.getByRole("button", { name: "参加する" }).click();
    await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).waitFor();
    await page.waitForTimeout(700);
    await page.getByLabel("招待コード").fill("VALID-CODE");
    if (await page.getByRole("alert").filter({ hasText: "招待コードを確認してください" }).count() !== 0) throw new Error("join invite error did not clear after input change");
    if (await page.getByLabel("招待コード").getAttribute("aria-invalid") !== "false") throw new Error("join invite aria-invalid did not clear after input change");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "参加する" }).click();
    await page.getByRole("heading", { name: "やること" }).waitFor();
    await page.waitForTimeout(700);
  });
}

async function buildBoards() {
  const boardSpecs = [
    ["01-login.png", ["login normal", "login-error"].map((stateLabel) => ({ stateLabel: stateLabel === "login normal" ? "login normal" : "login error", name: stateLabel === "login normal" ? "login-normal" : "login-error" }))],
    ["02-register.png", ["register normal", "register error"].map((stateLabel) => ({ stateLabel, name: stateLabel === "register normal" ? "register-normal" : "register-error" }))],
    ["03-register-invite.png", ["register invite-code", "register invalid-invite-code"].map((stateLabel) => ({ stateLabel, name: stateLabel === "register invite-code" ? "register-invite-code" : "register-invalid-invite-code" }))],
    ["04-household-entry.png", [
      { stateLabel: "household create normal", name: "household-create-normal" },
      { stateLabel: "household join normal", name: "household-join-normal" },
      { stateLabel: "household join invalid-code", name: "household-join-invalid-code" }
    ]]
  ];
  for (const [file, rows] of boardSpecs) {
    const panelWidth = 390;
    const panelHeight = 844;
    const headerHeight = 96;
    const rowHeight = headerHeight + panelHeight;
    const boardWidth = panelWidth * 2;
    const boardHeight = rowHeight * rows.length;
    const composites = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (const [columnIndex, sourceKind] of ["production", "mockup"].entries()) {
        const evidence = sourceKind === "production" && row.name === "register-error"
          ? "Production validation detail"
          : sourceKind === "production" ? "Production fixture"
            : "Mockup canonical";
        const sourceLabel = sourceKind === "production" ? "Production" : "Mockup";
        const svg = Buffer.from(`<svg width="390" height="96" xmlns="http://www.w3.org/2000/svg"><rect width="390" height="96" fill="#303531"/><text x="12" y="22" fill="white" font-family="Arial" font-size="14">${sourceLabel} / ${row.stateLabel}</text><text x="12" y="43" fill="#b8d9ca" font-family="monospace" font-size="8.5">Production SHA: ${productionSha}</text><text x="12" y="61" fill="#f0d998" font-family="monospace" font-size="8.5">Mockup SHA: ${mockupSha}</text><text x="12" y="80" fill="#d5ded7" font-family="Arial" font-size="9">Evidence: ${evidence}</text></svg>`);
        const source = sourceKind === "production" ? path.join(productionRoot, `${row.name}.png`) : path.join(mockupRoot, `${row.name}.png`);
        composites.push({ input: svg, left: columnIndex * panelWidth, top: rowIndex * rowHeight });
        composites.push({ input: await sharp(source).png().toBuffer(), left: columnIndex * panelWidth, top: rowIndex * rowHeight + headerHeight });
      }
    }
    await sharp({ create: { width: boardWidth, height: boardHeight, channels: 4, background: "#ffffff" } }).composite(composites).png().toFile(path.join(reviewRoot, file));
  }
}

async function main() {
  await rm(root, { recursive: true, force: true });
  await Promise.all([productionRoot, mockupRoot, motionRoot, previewRoot, reviewRoot].map((directory) => mkdir(directory, { recursive: true })));
  const browser = await chromium.launch({ headless: true });
  try {
    await captureScreenshots(browser);
    await recordFlows(browser);
  } finally {
    await browser.close();
  }
  await buildBoards();
  const packageFiles = ["01-login.png", "02-register.png", "03-register-invite.png", "04-household-entry.png", "login-flow.webm", "register-create-household.webm", "register-invite.webm", "household-entry.webm"];
  for (const file of packageFiles.slice(4)) await copyFile(path.join(motionRoot, file), path.join(reviewRoot, file));
  console.log(`M6 screenshot and motion evidence captured at ${root}`);
}

await main();
