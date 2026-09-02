import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = await readFile("public/sw.js", "utf8");

function loadServiceWorker() {
  const listeners = new Map();
  const self = {
    location: { origin: "https://app.example" },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    skipWaiting() {},
    clients: undefined,
    registration: { showNotification: () => Promise.resolve() }
  };
  vm.runInNewContext(source, { self, URL, Promise, decodeURI });
  return { listeners, self };
}

async function clickNotification({ clients, data }) {
  const { listeners, self } = loadServiceWorker();
  self.clients = clients;
  let completion;
  listeners.get("notificationclick")({
    notification: { data, close: () => undefined },
    waitUntil(promise) {
      completion = promise;
    }
  });
  await completion;
}

describe("service worker notification clicks", () => {
  it("navigates an existing Home client when the task query differs", async () => {
    let target;
    const navigate = (url) => { target = url; return Promise.resolve(); };
    const focus = () => Promise.resolve();
    const client = { url: "https://app.example/home", navigate, focus };
    await clickNotification({
      clients: { matchAll: () => Promise.resolve([client]), openWindow: () => Promise.resolve() },
      data: { kind: "task", taskId: "abc", url: "/home?task=abc" }
    });
    expect(target).toBe("/home?task=abc");
  });

  it("uses the full pathname, query, and hash when deciding to focus", async () => {
    let navigated = false;
    let focused = false;
    const client = {
      url: "https://app.example/home?task=abc#details",
      navigate: () => { navigated = true; return Promise.resolve(); },
      focus: () => { focused = true; return Promise.resolve(); }
    };
    await clickNotification({
      clients: { matchAll: () => Promise.resolve([client]), openWindow: () => Promise.resolve() },
      data: { kind: "task", taskId: "abc", url: "/home?task=abc#details" }
    });
    expect(navigated).toBe(false);
    expect(focused).toBe(true);
  });

  it.each([
    "https://app.example/calendar",
    "https://app.example/shopping",
    "https://app.example/tasks/new"
  ])("navigates an existing client from %s to Home with the task query", async (currentUrl) => {
    let target;
    const client = {
      url: currentUrl,
      navigate: (url) => { target = url; return Promise.resolve(); },
      focus: () => Promise.resolve()
    };
    await clickNotification({
      clients: { matchAll: () => Promise.resolve([client]), openWindow: () => Promise.resolve() },
      data: { kind: "task", taskId: "abc", url: "/home?task=abc" }
    });
    expect(target).toBe("/home?task=abc");
  });

  it("opens the task URL when no window client exists", async () => {
    let target;
    await clickNotification({
      clients: { matchAll: () => Promise.resolve([]), openWindow: (url) => { target = url; return Promise.resolve(); } },
      data: { kind: "task", taskId: "abc", url: "/home?task=abc" }
    });
    expect(target).toBe("/home?task=abc");
  });

  it("falls back safely for a malicious URL", async () => {
    let target;
    await clickNotification({
      clients: { matchAll: () => Promise.resolve([]), openWindow: (url) => { target = url; return Promise.resolve(); } },
      data: { kind: "task", taskId: "abc", url: "https://evil.example/steal" }
    });
    expect(target).toBe("/");
  });

  it("keeps summary links at Home and task links at the task Home URL", async () => {
    const shown = [];
    const { listeners, self } = loadServiceWorker();
    self.registration.showNotification = (_title, options) => {
      shown.push(options);
      return Promise.resolve();
    };
    let completion;
    listeners.get("push")({
      data: { json: () => ({ title: "通知", data: { kind: "summary", period: "morning", localDate: "2026-09-02", url: "/home" } }) },
      waitUntil(promise) { completion = promise; }
    });
    await completion;
    listeners.get("push")({
      data: { json: () => ({ title: "通知", data: { kind: "task", taskId: "abc", url: "/home?task=abc" } }) },
      waitUntil(promise) { completion = promise; }
    });
    await completion;
    expect(shown.map((options) => options.data.url)).toEqual(["/home", "/home?task=abc"]);
  });
});
