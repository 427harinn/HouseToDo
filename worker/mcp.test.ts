import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { getLocalDate } from "./lib/date-time";
import { sha256Hex } from "./lib/crypto";
import { OAUTH_SCOPES } from "./services/oauth-service";
import { MemoryD1 } from "./test-utils/memory-d1";
import { MemoryR2 } from "./test-utils/memory-r2";
import type { Env } from "./types/env";

const ORIGIN = "https://example.test";
const CLIENT_ID = "housetodo-muse-staging";
const TOKEN = "mcp-test-access-token";

const envFor = (): Env =>
  ({
    DB: new MemoryD1() as unknown as D1Database,
    ATTACHMENTS: new MemoryR2(),
    ASSETS: { fetch: () => Promise.resolve(new Response("SPA asset")) },
    APP_ENV: "test",
    ALLOWED_ORIGINS: ORIGIN,
    OAUTH_ISSUER_URL: ORIGIN
  }) as unknown as Env;

const jsonPost = (path: string, body: unknown, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });

const addUser = async (env: Env, email: string) => {
  const registered = await createApp().fetch(
    jsonPost("/api/auth/register", {
      email,
      password: "very-long-password",
      displayName: "MCP test"
    }),
    env
  );
  const cookie = registered.headers.get("set-cookie") ?? "";
  const household = await createApp().fetch(
    jsonPost("/api/households", { name: "MCP household" }, cookie),
    env
  );
  expect(household.status).toBe(201);
  const me = await createApp().fetch(
    new Request(`${ORIGIN}/api/auth/me`, { headers: { cookie } }),
    env
  );
  const body: { data: { user: { id: string } } } = await me.json();
  const db = env.DB as unknown as MemoryD1;
  const hash = await sha256Hex(TOKEN + email);
  const grantId = `grant-${email}`;
  const scope = [...OAUTH_SCOPES].join(" ");
  db.oauthClients.set(CLIENT_ID, {
    client_id: CLIENT_ID,
    client_name: "Muse",
    client_secret_hash: "unused-hash",
    allowed_scopes: JSON.stringify(OAUTH_SCOPES),
    token_endpoint_auth_method: "client_secret_basic",
    enabled: 1
  });
  db.oauthGrants.set(grantId, {
    id: grantId,
    user_id: body.data.user.id,
    client_id: CLIENT_ID,
    scope,
    created_at: new Date().toISOString(),
    revoked_at: null
  });
  db.oauthAccessTokens.set(hash, {
    token_hash: hash,
    grant_id: grantId,
    client_id: CLIENT_ID,
    user_id: body.data.user.id,
    scope,
    resource: `${ORIGIN}/mcp`,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    revoked_at: null,
    created_at: new Date().toISOString()
  });
  return { cookie, userId: body.data.user.id, token: TOKEN + email };
};

const rpc = (token: string, body: unknown, modern = false) => {
  const requestBody = body as { method?: string; params?: { name?: string } };
  const method = requestBody.method ?? "";
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
  if (modern) {
    headers["mcp-protocol-version"] = "2026-07-28";
    headers["mcp-method"] = method;
    if (method === "tools/call" && requestBody.params?.name)
      headers["mcp-name"] = requestBody.params.name;
  }
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
};

const modernMeta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "Muse test", version: "1.0" },
  "io.modelcontextprotocol/clientCapabilities": {}
};
const call = (
  name: string,
  arguments_: Record<string, unknown> = {},
  modern = false
) => ({
  jsonrpc: "2.0",
  id: 7,
  method: "tools/call",
  params: { name, arguments: arguments_, ...(modern ? { _meta: modernMeta } : {}) }
});
const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};
const result = async (
  response: Response
): Promise<{
  result?: {
    content?: Array<{ text: string }>;
    structuredContent?: unknown;
    isError?: boolean;
    tools?: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
  };
  error?: { code: number };
}> => await response.json();

describe("MCP Streamable HTTP endpoint", () => {
  it("serves current protected resource metadata and routes through Worker instead of SPA assets", async () => {
    const env = envFor();
    const metadata = await createApp().fetch(
      new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`),
      env
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      resource: `${ORIGIN}/mcp`,
      authorization_servers: [ORIGIN],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ["header"]
    });
    const unauth = await createApp().fetch(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        })
      }),
      env
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("www-authenticate")).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    );
    expect(await unauth.text()).not.toContain(TOKEN);
  });

  it("supports legacy initialize and initialized without creating server-side sessions", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-init@example.test");
    const initialized = await createApp().fetch(
      rpc(token, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "Muse", version: "1" }
        }
      }),
      env
    );
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get("mcp-session-id")).toBeNull();
    expect(await initialized.json()).toMatchObject({
      result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "HouseToDo" }
      }
    });
    const notification = await createApp().fetch(
      rpc(token, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
      env
    );
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");
  });

  it("supports modern discovery and returns the task and shopping tools with usable schemas", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-list@example.test");
    const app = createApp();
    const discovery = await app.fetch(
      rpc(
        token,
        {
          jsonrpc: "2.0",
          id: "d",
          method: "server/discover",
          params: { _meta: modernMeta }
        },
        true
      ),
      env
    );
    expect(await discovery.json()).toMatchObject({
      result: { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } }
    });
    const listing = await app.fetch(
      rpc(
        token,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: { _meta: modernMeta }
        },
        true
      ),
      env
    );
    const listed = await result(listing);
    const toolList = listed.result?.tools ?? [];
    expect(toolList).toHaveLength(14);
    expect(
      toolList.find((tool) => tool.name === "create_task")?.inputSchema.required
    ).toEqual(["title"]);
    expect(toolList.map((tool) => tool.name)).toContain("update_task");
    expect(toolList.map((tool) => tool.name)).toContain("delete_task");
    expect(toolList.map((tool) => tool.name)).toContain("get_task_details");
    const updateShopping = toolList.find((tool) => tool.name === "update_shopping");
    expect(updateShopping?.inputSchema.required).toEqual(["itemId"]);
    expect(updateShopping?.inputSchema.properties).toMatchObject({
      itemId: { type: "string" },
      name: { type: "string" },
      quantity: { type: ["string", "null"] },
      note: { type: ["string", "null"] },
      plannedPurchaseDate: { type: ["string", "null"] }
    });
    expect(updateShopping?.description).toContain("get_shopping");
    expect(updateShopping?.description).toContain("ユーザーへ確認");
    expect(toolList.find((tool) => tool.name === "delete_shopping")?.description).toContain("削除");
    expect(toolList.find((tool) => tool.name === "unpurchase_shopping")?.description).toContain("未購入");
    const addShoppingTool = toolList.find((tool) => tool.name === "add_shopping");
    expect(addShoppingTool?.inputSchema.required).toEqual(["name"]);
    expect(addShoppingTool?.inputSchema.properties).toHaveProperty("quantity");
    expect(addShoppingTool?.inputSchema.properties).toHaveProperty("note");
    expect(addShoppingTool?.inputSchema.properties).toHaveProperty("plannedPurchaseDate");
    expect(addShoppingTool?.description).toContain("続けてupload_shopping_image");
    expect(addShoppingTool?.description).toContain("推測せずユーザーに確認");
    const imageTool = toolList.find((tool) => tool.name === "upload_shopping_image");
    expect(imageTool?.inputSchema.required).toEqual(["itemId", "image"]);
    expect(imageTool?.inputSchema.properties).toMatchObject({
      itemId: { type: "string" },
      image: {
        type: "object",
        required: ["dataBase64", "mimeType", "width", "height"],
        properties: {
          mimeType: { enum: ["image/jpeg", "image/webp"] },
          width: { type: "integer", minimum: 1, maximum: 1280 },
          height: { type: "integer", minimum: 1, maximum: 1280 }
        }
      }
    });
    expect(imageTool?.description).toContain("1280x1280以内へ縮小");
    expect(imageTool?.description).toContain("decoded後1MB以内");
    expect(imageTool?.description).toContain("既にitemIdを取得済みならadd_shoppingを再度呼ばず");
    expect(imageTool?.description).toContain("買い物項目は残ります");
    expect(
      toolList.find((tool) => tool.name === "get_tasks_by_date")?.inputSchema.properties
    ).toHaveProperty("date");
  });

  it("rejects invalid tokens and requires the scope of each tool", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-scope@example.test");
    const invalid = await createApp().fetch(
      rpc("wrong-token", call("get_today_tasks")),
      env
    );
    expect(invalid.status).toBe(401);
    const db = env.DB as unknown as MemoryD1;
    const hash = await sha256Hex(token);
    const row = db.oauthAccessTokens.get(hash);
    if (!row) throw new Error("access token fixture missing");
    row.scope = "tasks:read";
    const forbidden = await createApp().fetch(
      rpc(
        token,
        call("create_task", {
          title: "x",
          date: getLocalDate(new Date(), "Asia/Tokyo")
        })
      ),
      env
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope"'
    );
    expect(forbidden.headers.get("www-authenticate")).toContain('scope="tasks:write"');
    const listing = await createApp().fetch(
      rpc(token, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
      env
    );
    expect((await result(listing)).result?.tools?.map((tool) => tool.name)).toEqual([
      "get_today_tasks",
      "get_tasks_by_date",
      "get_task_details"
    ]);
  });

  it("accepts an OAuth token with no resource and rejects one addressed to another resource", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-resource@example.test");
    const db = env.DB as unknown as MemoryD1;
    const hash = await sha256Hex(token);
    const row = db.oauthAccessTokens.get(hash);
    if (!row) throw new Error("access token fixture missing");
    row.resource = null;
    const noResource = await createApp().fetch(
      rpc(token, call("get_today_tasks")),
      env
    );
    expect(noResource.status).toBe(200);

    row.resource = "https://another.example/mcp";
    const wrongResource = await createApp().fetch(
      rpc(token, call("get_today_tasks")),
      env
    );
    expect(wrongResource.status).toBe(401);
  });

  it("calls all existing seven tools through the existing TaskService and ShoppingService", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-tools@example.test");
    const app = createApp();
    const today = getLocalDate(new Date(), "Asia/Tokyo");
    const request = (name: string, args: Record<string, unknown> = {}) =>
      app.fetch(rpc(token, call(name, args)), env);

    expect((await result(await request("get_today_tasks"))).result?.isError).toBe(
      false
    );
    expect(
      (await result(await request("get_tasks_by_date", { date: today }))).result
        ?.isError
    ).toBe(false);
    const createdTask = await result(
      await request("create_task", {
        title: "MCP sample task",
        date: today,
        time: "19:00"
      })
    );
    expect(createdTask.result?.isError).toBe(false);
    const task = createdTask.result?.structuredContent as { id: string } | undefined;
    expect(task?.id).toBeTruthy();
    expect(
      (
        await result(
          await request("complete_task", { taskId: task?.id, targetDate: today })
        )
      ).result?.isError
    ).toBe(false);

    expect((await result(await request("get_shopping"))).result?.isError).toBe(false);
    const added = await result(
      await request("add_shopping", {
        name: "MCP sample milk",
        quantity: "1本",
        note: null,
        plannedPurchaseDate: null
      })
    );
    expect(added.result?.isError).toBe(false);
    const item = added.result?.structuredContent as { id: string } | undefined;
    expect(item?.id).toBeTruthy();
    expect(
      (await result(await request("purchase_shopping", { itemId: item?.id }))).result
        ?.isError
    ).toBe(false);
  });

  it("partially updates shopping fields through ShoppingService and preserves an attached image", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-shopping-update@example.test");
    const app = createApp();
    const invoke = async (name: string, args: Record<string, unknown> = {}) =>
      result(await app.fetch(rpc(token, call(name, args)), env));
    const added = await invoke("add_shopping", {
      name: "牛乳",
      quantity: "1本",
      note: "普通",
      plannedPurchaseDate: "2026-10-27"
    });
    const item = added.result?.structuredContent as { id: string };
    const imageBytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5, 6]);
    const image = await invoke("upload_shopping_image", {
      itemId: item.id,
      image: { dataBase64: toBase64(imageBytes), mimeType: "image/jpeg", width: 80, height: 60 }
    });
    expect(image.result?.isError).toBe(false);

    for (const [field, value] of [
      ["name", "低脂肪乳"],
      ["quantity", "2本"],
      ["note", "低脂肪"],
      ["plannedPurchaseDate", "2026-10-28"]
    ] as const) {
      const update = await invoke("update_shopping", { itemId: item.id, [field]: value });
      expect(update.result?.isError).toBe(false);
      expect(update.result?.structuredContent).toMatchObject({ [field]: value });
    }
    const all = await invoke("update_shopping", {
      itemId: item.id,
      quantity: "3本",
      note: null
    });
    expect(all.result?.isError).toBe(false);
    expect(all.result?.structuredContent).toMatchObject({
      name: "低脂肪乳",
      quantity: "3本",
      note: null,
      plannedPurchaseDate: "2026-10-28"
    });
    const listed = await invoke("get_shopping");
    expect(listed.result?.structuredContent).toMatchObject({
      pending: [expect.objectContaining({ id: item.id, name: "低脂肪乳" })]
    });
    const db = env.DB as unknown as MemoryD1;
    const bucket = env.ATTACHMENTS as unknown as MemoryR2;
    expect(db.shoppingItemImages.size).toBe(1);
    expect(bucket.objects.size).toBe(1);
  });

  it("deletes shopping items through ShoppingService and uses its existing image cleanup", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-shopping-delete@example.test");
    const app = createApp();
    const added = await result(await app.fetch(rpc(token, call("add_shopping", { name: "削除対象" })), env));
    const item = added.result?.structuredContent as { id: string };
    const bytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5, 6]);
    const uploaded = await result(await app.fetch(rpc(token, call("upload_shopping_image", {
      itemId: item.id,
      image: { dataBase64: toBase64(bytes), mimeType: "image/jpeg", width: 80, height: 60 }
    })), env));
    expect(uploaded.result?.isError).toBe(false);
    const db = env.DB as unknown as MemoryD1;
    const bucket = env.ATTACHMENTS as unknown as MemoryR2;
    expect(db.shoppingItemImages.size).toBe(1);
    expect(bucket.objects.size).toBe(1);

    const deleted = await result(await app.fetch(rpc(token, call("delete_shopping", { itemId: item.id })), env));
    expect(deleted.result?.isError).toBe(false);
    expect(deleted.result?.structuredContent).toMatchObject({ id: item.id, deleted: true });
    expect(db.shoppingItems.has(item.id)).toBe(false);
    expect(db.shoppingItemImages.size).toBe(0);
    expect(bucket.objects.size).toBe(0);
    const listed = await result(await app.fetch(rpc(token, call("get_shopping")), env));
    expect(listed.result?.structuredContent).toMatchObject({ pending: [], purchased: [] });
  });

  it("un-purchases purchased shopping items and preserves the existing pending-item behavior", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-shopping-unpurchase@example.test");
    const app = createApp();
    const request = (name: string, args: Record<string, unknown> = {}) =>
      app.fetch(rpc(token, call(name, args)), env);
    const added = await result(await request("add_shopping", {
      name: "購入状態",
      plannedPurchaseDate: "2026-10-27"
    }));
    const item = added.result?.structuredContent as { id: string };
    const pending = await result(await request("unpurchase_shopping", { itemId: item.id }));
    expect(pending.result?.isError).toBe(false);
    expect(pending.result?.structuredContent).toMatchObject({
      id: item.id,
      status: "pending",
      plannedPurchaseDate: "2026-10-27",
      purchasedAt: null
    });
    expect((await result(await request("purchase_shopping", { itemId: item.id }))).result?.isError).toBe(false);
    const restored = await result(await request("unpurchase_shopping", { itemId: item.id }));
    expect(restored.result?.isError).toBe(false);
    expect(restored.result?.structuredContent).toMatchObject({ id: item.id, status: "pending", purchasedAt: null });
  });

  it("rejects missing and cross-household edit/delete/unpurchase targets and enforces shopping:write", async () => {
    const env = envFor();
    const owner = await addUser(env, "mcp-shopping-owner@example.test");
    const other = await addUser(env, "mcp-shopping-other@example.test");
    const app = createApp();
    const added = await result(await app.fetch(rpc(other.token, call("add_shopping", { name: "他の家庭" })), env));
    const otherItem = added.result?.structuredContent as { id: string };
    for (const [tool, args] of [
      ["update_shopping", { itemId: otherItem.id, name: "改ざん" }],
      ["delete_shopping", { itemId: otherItem.id }],
      ["unpurchase_shopping", { itemId: otherItem.id }]
    ] as const) {
      const missing = await result(await app.fetch(rpc(owner.token, call(tool, { ...args, itemId: "missing-item" })), env));
      expect(missing.result?.isError).toBe(true);
      const crossHousehold = await result(await app.fetch(rpc(owner.token, call(tool, args)), env));
      expect(crossHousehold.result?.isError).toBe(true);
    }
    const db = env.DB as unknown as MemoryD1;
    const tokenHash = await sha256Hex(owner.token);
    const tokenRow = db.oauthAccessTokens.get(tokenHash);
    if (!tokenRow) throw new Error("access token fixture missing");
    tokenRow.scope = "shopping:read";
    const forbidden = await app.fetch(rpc(owner.token, call("update_shopping", {
      itemId: otherItem.id,
      name: "改ざん"
    })), env);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("www-authenticate")).toContain('scope="shopping:write"');
  });

  it("uploads JPEG and WebP through ShoppingItemImageService into private R2 storage", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-image-success@example.test");
    const app = createApp();
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5, 6]);
    const webp = new Uint8Array([82, 73, 70, 70, 8, 0, 0, 0, 87, 69, 66, 80, 0, 0, 0, 0, 1]);
    const upload = async (name: string, bytes: Uint8Array, mimeType: string) => {
      const added = await result(
        await app.fetch(rpc(token, call("add_shopping", { name })), env)
      );
      const item = added.result?.structuredContent as { id: string };
      const uploaded = await result(
        await app.fetch(
          rpc(token, call("upload_shopping_image", {
            itemId: item.id,
            image: {
              dataBase64: toBase64(bytes),
              mimeType,
              width: 80,
              height: 60,
              fileName: `${name}.image`
            }
          })),
          env
        )
      );
      expect(uploaded.result?.isError).toBe(false);
      expect(uploaded.result?.structuredContent).toMatchObject({
        itemId: item.id,
        contentType: mimeType,
        sizeBytes: bytes.byteLength,
        width: 80,
        height: 60
      });
      return item.id;
    };

    await upload("JPEG milk", jpeg, "image/jpeg");
    await upload("WebP milk", webp, "image/webp");
    const db = env.DB as unknown as MemoryD1;
    const bucket = env.ATTACHMENTS as unknown as MemoryR2;
    expect(db.shoppingItemImages.size).toBe(2);
    expect(Array.from(bucket.objects.values()).map((entry) => entry.contentType).sort()).toEqual([
      "image/jpeg",
      "image/webp"
    ]);
  });

  it("keeps the shopping item after image failure and retries only image upload with its existing itemId", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-image-retry@example.test");
    const app = createApp();
    const added = await result(
      await app.fetch(rpc(token, call("add_shopping", { name: "読み取った商品" })), env)
    );
    const item = added.result?.structuredContent as { id: string };
    const invalidUpload = await result(
      await app.fetch(
        rpc(token, call("upload_shopping_image", {
          itemId: item.id,
          image: {
            dataBase64: "not-base64",
            mimeType: "image/jpeg",
            width: 80,
            height: 60
          }
        })),
        env
      )
    );
    expect(invalidUpload.result?.isError).toBe(true);

    const listed = await result(await app.fetch(rpc(token, call("get_shopping")), env));
    const shopping = listed.result?.structuredContent as {
      pending: Array<{ id: string; name: string }>;
    };
    expect(shopping.pending).toContainEqual(
      expect.objectContaining({ id: item.id, name: "読み取った商品" })
    );

    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5, 6]);
    const retried = await result(
      await app.fetch(
        rpc(token, call("upload_shopping_image", {
          itemId: item.id,
          image: {
            dataBase64: toBase64(jpeg),
            mimeType: "image/jpeg",
            width: 80,
            height: 60
          }
        })),
        env
      )
    );
    expect(retried.result?.isError).toBe(false);
    expect(retried.result?.structuredContent).toMatchObject({ itemId: item.id });
    expect((env.DB as unknown as MemoryD1).shoppingItems.size).toBe(1);
  });

  it("rejects malformed, oversized, unsupported, and mismatched shopping image input", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-image-invalid@example.test");
    const app = createApp();
    const added = await result(
      await app.fetch(rpc(token, call("add_shopping", { name: "Image target" })), env)
    );
    const item = added.result?.structuredContent as { id: string };
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5, 6]);
    const invoke = (image: Record<string, unknown>) =>
      app.fetch(rpc(token, call("upload_shopping_image", { itemId: item.id, image })), env);
    const metadata = { width: 80, height: 60 };

    for (const image of [
      { ...metadata, dataBase64: "data:image/jpeg;base64," + toBase64(jpeg), mimeType: "image/jpeg" },
      { ...metadata, dataBase64: "%%%not-base64%%%", mimeType: "image/jpeg" },
      { ...metadata, dataBase64: toBase64(jpeg), mimeType: "image/png" },
      { ...metadata, dataBase64: toBase64(jpeg), mimeType: "image/webp" },
      { ...metadata, dataBase64: toBase64(jpeg), mimeType: "image/jpeg", width: 1281 },
      { ...metadata, dataBase64: toBase64(jpeg), mimeType: "image/jpeg", height: 1281 }
    ]) {
      expect((await result(await invoke(image))).result?.isError).toBe(true);
    }

    const tooLarge = new Uint8Array(1024 * 1024 + 1);
    tooLarge.set(jpeg.subarray(0, 3));
    expect(
      (await result(await invoke({
        ...metadata,
        dataBase64: toBase64(tooLarge),
        mimeType: "image/jpeg"
      }))).result?.isError
    ).toBe(true);
    expect((env.ATTACHMENTS as unknown as MemoryR2).objects.size).toBe(0);
  });

  it("rejects missing and cross-household shopping items and enforces shopping:write", async () => {
    const env = envFor();
    const owner = await addUser(env, "mcp-image-owner@example.test");
    const other = await addUser(env, "mcp-image-other@example.test");
    const app = createApp();
    const added = await result(
      await app.fetch(rpc(other.token, call("add_shopping", { name: "Other household item" })), env)
    );
    const otherItem = added.result?.structuredContent as { id: string };
    const bytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5, 6]);
    const image = { dataBase64: toBase64(bytes), mimeType: "image/jpeg", width: 80, height: 60 };
    const upload = (token: string, itemId: string) =>
      app.fetch(rpc(token, call("upload_shopping_image", { itemId, image })), env);

    expect((await result(await upload(owner.token, "missing-item"))).result?.isError).toBe(true);
    expect((await result(await upload(owner.token, otherItem.id))).result?.isError).toBe(true);
    expect((env.ATTACHMENTS as unknown as MemoryR2).objects.size).toBe(0);

    const ownerItemResponse = await app.fetch(
      rpc(owner.token, call("add_shopping", { name: "Owner household item" })),
      env
    );
    const ownerItem = (await result(ownerItemResponse)).result?.structuredContent as { id: string };
    const db = env.DB as unknown as MemoryD1;
    const tokenHash = await sha256Hex(owner.token);
    const tokenRow = db.oauthAccessTokens.get(tokenHash);
    if (!tokenRow) throw new Error("access token fixture missing");
    tokenRow.scope = "shopping:read";
    const forbidden = await upload(owner.token, ownerItem.id);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("www-authenticate")).toContain('scope="shopping:write"');
  });

  it("creates each Muse recurrence through the existing task validation and service", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-recurrence@example.test");
    const app = createApp();
    const today = getLocalDate(new Date(), "Asia/Tokyo");
    const create = async (
      title: string,
      recurrence: Record<string, unknown>,
      extra: Record<string, unknown> = {}
    ) => {
      const response = await app.fetch(
        rpc(token, call("create_task", { title, recurrence, ...extra })),
        env
      );
      const parsed = await result(response);
      expect(parsed.result?.isError).toBe(false);
      return parsed.result?.structuredContent as Record<string, unknown>;
    };

    const once = await create("One off", { type: "once" }, { date: today });
    expect(once).toMatchObject({
      date: today,
      recurrence: { type: "once" },
      notification: { enabled: false, minutesBefore: null }
    });
    const daily = await create("Daily", { type: "daily" });
    expect(daily.recurrence).toEqual({ type: "daily" });
    const weekdays = await create(
      "Weekday task",
      { type: "weekly", weekdays: ["monday", "thursday"] },
      { time: "19:00" }
    );
    expect(weekdays).toMatchObject({
      recurrence: { type: "weekly", weekdays: ["monday", "thursday"] },
      time: "19:00"
    });
    const weeklyCount = await create(
      "Three times",
      { type: "weekly_count", count: 3 },
      { time: "20:00" }
    );
    expect(weeklyCount.recurrence).toEqual({ type: "weekly_count", count: 3 });
    const monthly = await create("Rent check", { type: "monthly", dayOfMonth: 25 });
    expect(monthly.recurrence).toEqual({ type: "monthly", dayOfMonth: 25 });
    const monthlyFlexible = await create("End of month", { type: "monthly_flexible" });
    expect(monthlyFlexible.recurrence).toMatchObject({
      type: "monthly_flexible",
      monthDeadline: "month_end"
    });
    const thisWeek = await create("This week", { type: "this_week" });
    expect(thisWeek.recurrence).toEqual({ type: "this_week" });
    const thisMonth = await create("This month", { type: "this_month" });
    expect(thisMonth.recurrence).toEqual({ type: "this_month" });
    const deadline = await create(
      "Deadline",
      { type: "deadline", date: today },
      { time: "21:00" }
    );
    expect(deadline).toMatchObject({
      recurrence: { type: "deadline", date: today },
      deadline: { date: today, time: "21:00" }
    });
    const reminder = await create(
      "Reminder",
      { type: "weekly", weekdays: ["monday"] },
      {
        time: "19:00",
        notification: { enabled: true, minutesBefore: 30 }
      }
    );
    expect(reminder).toMatchObject({
      time: "19:00",
      notification: { enabled: true, minutesBefore: 30 }
    });
  });

  it("updates recurrence, time and notification partially, returns details, and deactivates instead of deleting", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-task-edit@example.test");
    const app = createApp();
    const today = getLocalDate(new Date(), "Asia/Tokyo");
    const created = await result(
      await app.fetch(
        rpc(
          token,
          call("create_task", {
            title: "Edit me",
            recurrence: { type: "weekly", weekdays: ["monday", "thursday"] },
            time: "19:00",
            notification: { enabled: true, minutesBefore: 30 }
          })
        ),
        env
      )
    );
    const task = created.result?.structuredContent as { id: string };

    const before = await result(
      await app.fetch(rpc(token, call("get_task_details", { taskId: task.id })), env)
    );
    expect(before.result?.structuredContent).toMatchObject({
      recurrence: { type: "weekly", weekdays: ["monday", "thursday"] },
      time: "19:00",
      notification: { enabled: true, minutesBefore: 30 }
    });

    const recurrenceUpdate = await result(
      await app.fetch(
        rpc(
          token,
          call("update_task", {
            taskId: task.id,
            recurrence: { type: "daily" }
          })
        ),
        env
      )
    );
    expect(recurrenceUpdate.result?.structuredContent).toMatchObject({
      recurrence: { type: "daily" }
    });

    const timeUpdate = await result(
      await app.fetch(
        rpc(token, call("update_task", { taskId: task.id, time: "20:00" })),
        env
      )
    );
    expect(timeUpdate.result?.structuredContent).toMatchObject({
      time: "20:00",
      notification: { enabled: true, minutesBefore: 30 }
    });

    const notificationUpdate = await result(
      await app.fetch(
        rpc(
          token,
          call("update_task", {
            taskId: task.id,
            notification: { enabled: true, minutesBefore: 60 }
          })
        ),
        env
      )
    );
    expect(notificationUpdate.result?.structuredContent).toMatchObject({
      time: "20:00",
      notification: { enabled: true, minutesBefore: 60 }
    });

    const legacy = await result(
      await app.fetch(
        rpc(
          token,
          call("create_task", { title: "Legacy", date: today, time: "19:00" })
        ),
        env
      )
    );
    const legacyTask = legacy.result?.structuredContent as { id: string };
    const legacyChanged = await result(
      await app.fetch(
        rpc(
          token,
          call("update_task", {
            taskId: legacyTask.id,
            recurrence: { type: "weekly_count", count: 3 },
            notification: { enabled: true, minutesBefore: 30 }
          })
        ),
        env
      )
    );
    expect(legacyChanged.result?.structuredContent).toMatchObject({
      recurrence: { type: "weekly_count", count: 3 },
      time: "19:00",
      notification: { enabled: true, minutesBefore: 30 }
    });

    const deleted = await result(
      await app.fetch(rpc(token, call("delete_task", { taskId: task.id })), env)
    );
    expect(deleted.result?.structuredContent).toMatchObject({
      id: task.id,
      deleted: true,
      deletionMode: "deactivated"
    });
    const after = await result(
      await app.fetch(rpc(token, call("get_task_details", { taskId: task.id })), env)
    );
    expect(after.result?.structuredContent).toMatchObject({
      id: task.id,
      active: false
    });
  });

  it("rejects invalid weekday and notification values", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-task-invalid@example.test");
    const badWeekday = await result(
      await createApp().fetch(
        rpc(
          token,
          call("create_task", {
            title: "Bad weekday",
            recurrence: { type: "weekly", weekdays: ["Funday"] }
          })
        ),
        env
      )
    );
    expect(badWeekday.result?.isError).toBe(true);
    const badNotification = await result(
      await createApp().fetch(
        rpc(
          token,
          call("create_task", {
            title: "Bad reminder",
            recurrence: { type: "daily" },
            time: "19:00",
            notification: { enabled: true, minutesBefore: 17 }
          })
        ),
        env
      )
    );
    expect(badNotification.result?.isError).toBe(true);
  });

  it("requires read/write scopes for the new task tools and keeps them household scoped", async () => {
    const env = envFor();
    const owner = await addUser(env, "mcp-new-scope-owner@example.test");
    const other = await addUser(env, "mcp-new-scope-other@example.test");
    const app = createApp();
    const today = getLocalDate(new Date(), "Asia/Tokyo");
    const made = await result(
      await app.fetch(
        rpc(owner.token, call("create_task", { title: "Owner task", date: today })),
        env
      )
    );
    const ownerTask = made.result?.structuredContent as { id: string };
    const otherDetails = await result(
      await app.fetch(
        rpc(other.token, call("get_task_details", { taskId: ownerTask.id })),
        env
      )
    );
    expect(otherDetails.result?.isError).toBe(true);
    const otherUpdate = await result(
      await app.fetch(
        rpc(
          other.token,
          call("update_task", { taskId: ownerTask.id, title: "Cross household" })
        ),
        env
      )
    );
    expect(otherUpdate.result?.isError).toBe(true);
    const otherDelete = await result(
      await app.fetch(
        rpc(other.token, call("delete_task", { taskId: ownerTask.id })),
        env
      )
    );
    expect(otherDelete.result?.isError).toBe(true);
    const directUserId = await result(
      await app.fetch(
        rpc(
          owner.token,
          call("update_task", {
            taskId: ownerTask.id,
            title: "Ignore caller identity",
            userId: other.userId
          })
        ),
        env
      )
    );
    expect(directUserId.result?.isError).toBe(true);

    const db = env.DB as unknown as MemoryD1;
    const ownerHash = await sha256Hex(owner.token);
    const ownerAccess = db.oauthAccessTokens.get(ownerHash);
    if (!ownerAccess) throw new Error("owner access token fixture missing");
    ownerAccess.scope = "shopping:read";
    const noRead = await app.fetch(
      rpc(owner.token, call("get_task_details", { taskId: ownerTask.id })),
      env
    );
    expect(noRead.status).toBe(403);
    expect(
      (
        await app.fetch(
          rpc(owner.token, call("delete_task", { taskId: ownerTask.id })),
          env
        )
      ).status
    ).toBe(403);
  });

  it("keeps data isolated by the token user and enables production MCP only with OAuth access tokens", async () => {
    const env = envFor();
    const owner = await addUser(env, "mcp-owner@example.test");
    const other = await addUser(env, "mcp-other@example.test");
    const app = createApp();
    const today = getLocalDate(new Date(), "Asia/Tokyo");
    const create = await app.fetch(
      rpc(owner.token, call("create_task", { title: "Owner-only task", date: today })),
      env
    );
    const task = (await result(create)).result?.structuredContent as { id: string };
    const crossHousehold = await app.fetch(
      rpc(other.token, call("complete_task", { taskId: task.id, targetDate: today })),
      env
    );
    expect((await result(crossHousehold)).result?.isError).toBe(true);
    env.APP_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const metadata = await app.fetch(
      new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`),
      env
    );
    expect(metadata.status).toBe(200);
    expect(await result(metadata)).toMatchObject({ resource: `${ORIGIN}/mcp` });

    const validRequest = rpc(owner.token, call("create_task", {
      title: "user-input-must-not-be-logged",
      date: today
    }));
    validRequest.headers.set("cf-ray", "mcp-production-request-1");
    const validResponse = await app.fetch(validRequest, env);
    expect(validResponse.status).toBe(200);

    env.AGENT_API_TOKEN = "phase-one-fixed-bearer-must-not-work";
    env.AGENT_API_USER_ID = owner.userId;
    const fixedTokenResponse = await app.fetch(
      rpc("phase-one-fixed-bearer-must-not-work", call("get_today_tasks")),
      env
    );
    expect(fixedTokenResponse.status).toBe(401);

    const records = info.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
    expect(records).toHaveLength(3);
    expect(records.map((record) => record.endpoint)).toEqual([
      "/.well-known/oauth-protected-resource/mcp", "/mcp", "/mcp"
    ]);
    expect(records[1]).toMatchObject({
      event: "mcp_request",
      requestId: "mcp-production-request-1",
      endpoint: "/mcp",
      toolName: "create_task",
      status: 200,
      errorCategory: null
    });
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual([
        "endpoint", "errorCategory", "event", "requestId", "status", "toolName"
      ]);
      expect(record).not.toHaveProperty("clientId");
      expect(record).not.toHaveProperty("userId");
      expect(record).not.toHaveProperty("authPresent");
    }
    const serializedLogs = JSON.stringify(records);
    expect(serializedLogs).not.toContain(owner.token);
    expect(serializedLogs).not.toContain("phase-one-fixed-bearer-must-not-work");
    expect(serializedLogs).not.toContain("user-input-must-not-be-logged");
    expect((await app.fetch(new Request(`${ORIGIN}/mcp`, { method: "GET" }), env)).status).toBe(405);
    env.APP_ENV = "development";
    expect((await app.fetch(new Request(`${ORIGIN}/mcp`, { method: "GET" }), env)).status).toBe(404);
  });

  it("checks modern Streamable HTTP header/body agreement and Origin", async () => {
    const env = envFor();
    const { token } = await addUser(env, "mcp-validation@example.test");
    const mismatch = await createApp().fetch(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "wrong-name"
        },
        body: JSON.stringify(call("get_today_tasks", {}, true))
      }),
      env
    );
    expect(mismatch.status).toBe(400);
    expect((await result(mismatch)).error?.code).toBe(-32020);
    const badOrigin = await createApp().fetch(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        })
      }),
      env
    );
    expect(badOrigin.status).toBe(403);
  });
});
