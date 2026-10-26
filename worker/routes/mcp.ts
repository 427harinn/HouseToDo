import { AppError } from "../lib/errors";
import { isValidDateKey } from "../lib/date-time";
import {
  validateShoppingUpdateInput,
  validateShoppingWriteInput,
  validateTaskStateInput
} from "../lib/validation";
import {
  createMuseTaskInput,
  taskDetailsForMuse,
  todayForMcpUser,
  updateMuseTaskInput,
  MCP_WEEKDAYS
} from "../lib/mcp-task-adapter";
import { ShoppingService } from "../services/shopping-service";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  ShoppingItemImageService
} from "../services/shopping-item-image-service";
import { TaskService } from "../services/task-service";
import {
  MAX_MCP_IMAGE_REQUEST_BYTES,
  parseMcpShoppingImageUploadInput
} from "../lib/mcp-shopping-image-adapter";
import {
  OAuthService,
  OAUTH_SCOPES,
  type TokenPrincipal
} from "../services/oauth-service";
import type { Env } from "../types/env";

const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSIONS = new Set(["2025-11-25", "2025-06-18", "2025-03-26"]);
const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const ALL_SCOPES = [...OAUTH_SCOPES].join(" ");

type JsonRecord = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  scope: string;
  inputSchema: JsonRecord;
};

const object = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const recurrenceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: [
        "once",
        "daily",
        "weekly",
        "weekly_count",
        "weekly_flexible",
        "monthly",
        "monthly_flexible",
        "this_week",
        "this_month",
        "deadline"
      ]
    },
    weekdays: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", enum: [...MCP_WEEKDAYS] },
      description: "weeklyで使う曜日。例: [monday, thursday]"
    },
    count: {
      type: "integer",
      minimum: 1,
      maximum: 7,
      description: "weekly_countで使う週あたりの回数"
    },
    dayOfMonth: {
      type: "integer",
      minimum: 1,
      maximum: 31,
      description: "monthlyで使う毎月の日"
    },
    deadlineWeekday: {
      type: "string",
      enum: [...MCP_WEEKDAYS],
      description: "weekly_flexibleの週内期限曜日"
    },
    monthDeadline: {
      type: "string",
      enum: ["month_end", "day_of_month"],
      description: "monthly_flexibleの期限。day_of_monthならdayOfMonthも指定"
    },
    date: {
      type: "string",
      format: "date",
      description: "deadlineで使う締切日 YYYY-MM-DD"
    }
  }
};

const notificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["enabled"],
  properties: {
    enabled: { type: "boolean", description: "通知を有効にするか" },
    minutesBefore: {
      type: "integer",
      enum: [0, 5, 10, 30, 60, 120],
      description: "タスク時刻の何分前に通知するか。0は時刻ちょうど"
    }
  }
};

const tools: Tool[] = [
  {
    name: "get_today_tasks",
    description: "今日のタスクを取得します。",
    scope: "tasks:read",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "get_tasks_by_date",
    description: "指定日のタスクを取得します。dateはYYYY-MM-DD形式です。",
    scope: "tasks:read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        date: { type: "string", format: "date", description: "対象日（YYYY-MM-DD）" }
      },
      required: ["date"]
    }
  },
  {
    name: "create_task",
    description:
      "HouseToDoにタスクを追加します。例: 毎週月曜・木曜19:00なら recurrence={type:weekly,weekdays:[monday,thursday]}、週3回なら type=weekly_count,count=3、毎月25日なら type=monthly,dayOfMonth=25、今週中なら type=this_week、締切日までなら type=deadline,date=YYYY-MM-DD。timeはHH:mm、通知はnotification={enabled:true,minutesBefore:30}（0/5/10/30/60/120分前）です。recurrence省略時は旧形式のdate/time入力も受け付けます。",
    scope: "tasks:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: {
        title: { type: "string", description: "タスク名" },
        description: { type: ["string", "null"], description: "任意のメモ" },
        date: {
          type: "string",
          format: "date",
          description: "単発タスクの日付。省略時は今日。旧形式の呼び出しにも使用"
        },
        time: {
          type: ["string", "null"],
          description: "タスク時刻 HH:mm。通知を使う場合は必須"
        },
        recurrence: {
          ...recurrenceSchema,
          description:
            "繰り返し方式。weeklyは曜日指定、weekly_countは週の回数、weekly_flexible/monthly_flexibleは期限内に実施"
        },
        notification: notificationSchema
      }
    }
  },
  {
    name: "update_task",
    description:
      "既存タスクを部分更新します。taskIdと変更する項目だけを指定します。曜日例: recurrence={type:weekly,weekdays:[monday]}。通知例: notification={enabled:true,minutesBefore:60}。",
    scope: "tasks:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "変更するタスクID" },
        title: { type: "string", description: "新しいタスク名" },
        description: {
          type: ["string", "null"],
          description: "新しいメモ。nullで消去"
        },
        date: { type: "string", format: "date", description: "単発の日付または締切日" },
        time: {
          type: ["string", "null"],
          description: "新しいタスク時刻。nullで時刻を消去"
        },
        recurrence: { ...recurrenceSchema, description: "新しい繰り返し設定" },
        notification: notificationSchema
      }
    }
  },
  {
    name: "get_task_details",
    description: "タスク編集前に、繰り返し・時刻・通知・締切・担当者を確認します。",
    scope: "tasks:read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { taskId: { type: "string", description: "確認するタスクID" } },
      required: ["taskId"]
    }
  },
  {
    name: "delete_task",
    description:
      "破壊的操作: タスクをHouseToDoの仕様に従って無効化し、一覧から外します。物理削除ではありません。実行前に対象を確認してください。",
    scope: "tasks:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { taskId: { type: "string", description: "無効化するタスクID" } },
      required: ["taskId"]
    }
  },
  {
    name: "complete_task",
    description: "指定した日付のタスクを完了にします。targetDateはYYYY-MM-DD形式です。",
    scope: "tasks:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        taskId: { type: "string", description: "タスクID" },
        targetDate: {
          type: "string",
          format: "date",
          description: "対象日（YYYY-MM-DD）。省略時は今日"
        }
      },
      required: ["taskId"]
    }
  },
  {
    name: "get_shopping",
    description: "買い物リストを取得します。",
    scope: "shopping:read",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "add_shopping",
    description:
      "買い物項目を追加します。plannedPurchaseDateはYYYY-MM-DD形式です。画像付きの買い物依頼では、添付画像から商品名を判断できる場合は先にこのtoolで項目を作成し、成功時に返るidを使って続けてupload_shopping_imageを呼び出してください。商品名が画像から明確に分からない場合は推測せずユーザーに確認してください。quantity・note・plannedPurchaseDateはユーザーが明示した場合だけ設定してください。",
    scope: "shopping:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", description: "商品名" },
        quantity: { type: ["string", "null"], description: "数量またはnull" },
        note: { type: ["string", "null"], description: "メモまたはnull" },
        plannedPurchaseDate: {
          type: ["string", "null"],
          description: "購入予定日（YYYY-MM-DD）またはnull"
        }
      },
      required: ["name"]
    }
  },
  {
    name: "update_shopping",
    description:
      "買い物項目の名前、数量、メモ、購入予定日を部分変更します。対象が曖昧な場合は先にget_shoppingで確認し、必要ならユーザーへ確認してください。例: 牛乳を2本にする、メモを低脂肪にする、明日買う予定にする、名前を低脂肪乳にする。",
    scope: "shopping:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["itemId"],
      properties: {
        itemId: { type: "string", minLength: 1, description: "get_shoppingで特定した対象の買い物項目ID" },
        name: { type: "string", description: "新しい商品名" },
        quantity: { type: ["string", "null"], description: "新しい数量。nullで消去" },
        note: { type: ["string", "null"], description: "新しいメモ。nullで消去" },
        plannedPurchaseDate: {
          type: ["string", "null"],
          format: "date",
          description: "新しい購入予定日（YYYY-MM-DD）。nullで消去"
        }
      }
    }
  },
  {
    name: "delete_shopping",
    description:
      "不要になった買い物項目を削除します。削除操作です。対象が曖昧な場合は削除せず、get_shoppingで確認して必要ならユーザーへ確認してください。例: 牛乳が不要になったので削除する。",
    scope: "shopping:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { itemId: { type: "string", minLength: 1, description: "get_shoppingで特定した対象の買い物項目ID" } },
      required: ["itemId"]
    }
  },
  {
    name: "unpurchase_shopping",
    description:
      "誤って購入済みにした買い物項目を未購入へ戻します。対象が曖昧な場合はget_shoppingで確認してください。例: 牛乳を間違えて購入済みにしたので戻す。",
    scope: "shopping:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { itemId: { type: "string", minLength: 1, description: "get_shoppingで特定した対象の買い物項目ID" } },
      required: ["itemId"]
    }
  },
  {
    name: "purchase_shopping",
    description: "買い物項目を購入済みにします。",
    scope: "shopping:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { itemId: { type: "string", description: "買い物項目ID" } },
      required: ["itemId"]
    }
  },
  {
    name: "upload_shopping_image",
    description:
      "買い物項目へ会話に添付された画像を登録します。新規項目への画像付き買い物追加ではadd_shopping成功後に続けてこのtoolを呼び、返却されたitemIdをそのまま使ってください。添付画像をJPEGまたはWebPへ変換し、1280x1280以内へ縮小、decoded後1MB以内へ圧縮してbase64化し、mimeType・width・heightを実データに合わせて指定してください。既にitemIdを取得済みならadd_shoppingを再度呼ばず、このtoolだけ同じitemIdで再試行してください。画像登録に失敗しても買い物項目は残ります。項目を削除せず、画像登録失敗をユーザーへ伝えてください。",
    scope: "shopping:write",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["itemId", "image"],
      properties: {
        itemId: { type: "string", minLength: 1, description: "add_shoppingが返した買い物項目ID" },
        image: {
          type: "object",
          additionalProperties: false,
          required: ["dataBase64", "mimeType", "width", "height"],
          properties: {
            dataBase64: {
              type: "string",
              minLength: 1,
              maxLength: Math.ceil(MAX_IMAGE_BYTES / 3) * 4,
              description: "JPEGまたはWebP画像の純粋なbase64文字列。data URL形式は不可"
            },
            mimeType: { type: "string", enum: ["image/jpeg", "image/webp"] },
            width: { type: "integer", minimum: 1, maximum: MAX_IMAGE_DIMENSION },
            height: { type: "integer", minimum: 1, maximum: MAX_IMAGE_DIMENSION },
            fileName: { type: "string", maxLength: 255, description: "任意の元ファイル名" }
          }
        }
      }
    }
  }
];

const serverInfo = { name: "HouseToDo", version: "1.0.0" };
const toolDescription = ({ name, description, inputSchema }: Tool) => ({
  name,
  description,
  inputSchema
});

const responseJson = (body: unknown, status = 200, headers?: HeadersInit): Response => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};

const rpcError = (id: unknown, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message, ...(data === undefined ? {} : { data }) }
});

const issuerFor = (request: Request, env: Env): string =>
  (env.OAUTH_ISSUER_URL || new URL(request.url).origin).replace(/\/$/, "");

const resourceFor = (request: Request, env: Env): string =>
  `${issuerFor(request, env)}/mcp`;
const metadataFor = (request: Request, env: Env): string =>
  `${issuerFor(request, env)}/.well-known/oauth-protected-resource/mcp`;

const protectedResourceMetadata = (request: Request, env: Env): Response =>
  responseJson({
    resource: resourceFor(request, env),
    authorization_servers: [issuerFor(request, env)],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "HouseToDo"
  });

const authenticate = async (
  request: Request,
  env: Env
): Promise<{
  principal: TokenPrincipal | null;
  present: boolean;
}> => {
  const authorization = request.headers.get("authorization");
  const match = authorization ? /^Bearer\s+([^\s]+)$/i.exec(authorization) : null;
  if (!match || (env.APP_ENV !== "staging" && env.APP_ENV !== "test")) {
    return { principal: null, present: Boolean(authorization) };
  }
  try {
    const principal = await new OAuthService(env).authenticateAccessToken(match[1]);
    // RFC 8707 resource is optional for the configured Muse connector. If it is
    // supplied, never accept a token addressed to a different protected resource.
    if (
      !principal ||
      (principal.resource !== null && principal.resource !== resourceFor(request, env))
    )
      return { principal: null, present: true };
    return { principal, present: true };
  } catch {
    return { principal: null, present: true };
  }
};

const challenge = (
  request: Request,
  env: Env,
  status: 401 | 403,
  scope: string,
  invalidToken = false
): Response => {
  const parameters = [
    ...(invalidToken
      ? ['error="invalid_token"']
      : status === 403
        ? ['error="insufficient_scope"']
        : []),
    `scope="${scope}"`,
    `resource_metadata="${metadataFor(request, env)}"`
  ];
  return responseJson(
    { error: status === 401 ? "invalid_token" : "insufficient_scope" },
    status,
    {
      "www-authenticate": `Bearer ${parameters.join(", ")}`
    }
  );
};

const logRequest = (
  env: Env,
  record: {
    path: string;
    method: string;
    jsonrpcMethod: string | null;
    protocolVersion: string | null;
    authPresent: boolean;
    authSuccess: boolean;
    clientId: string | null;
    userId: string | null;
    toolName: string | null;
    responseStatus: number;
  }
): void => {
  if (env.APP_ENV !== "staging") return;
  console.log(JSON.stringify({ event: "mcp_request", ...record }));
};

const validateOrigin = (request: Request, env: Env): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin);
};

const readBody = async (request: Request): Promise<unknown> => {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_MCP_IMAGE_REQUEST_BYTES) throw new Error("body_too_large");
  if (!request.body) throw new Error("empty_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bodyBytes += value.byteLength;
    if (bodyBytes > MAX_MCP_IMAGE_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(bodyBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  const body = JSON.parse(text) as unknown;
  if (bodyBytes > 64 * 1024) {
    const root = object(body);
    const params = object(root?.params);
    if (root?.method !== "tools/call" || params?.name !== "upload_shopping_image")
      throw new Error("body_too_large");
  }
  return body;
};

const toolData = async (
  toolName: string,
  args: JsonRecord,
  userId: string,
  env: Env
): Promise<unknown> => {
  const taskService = new TaskService(env.DB);
  const shoppingService = new ShoppingService(env.DB, env.ATTACHMENTS, env);
  switch (toolName) {
    case "get_today_tasks": {
      if (Object.keys(args).length)
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "このツールに入力項目はありません。"
        });
      const result = await taskService.listToday(userId);
      return {
        date: result.date,
        tasks: result.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          scheduledTime: task.scheduledTime,
          targetDate: task.targetDate,
          occurrenceKey: task.occurrenceKey,
          periodKey: task.periodKey,
          completedAt: task.completedAt,
          overdue: task.overdue
        }))
      };
    }
    case "get_tasks_by_date": {
      if (
        typeof args.date !== "string" ||
        !isValidDateKey(args.date) ||
        Object.keys(args).some((key) => key !== "date")
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "dateはYYYY-MM-DD形式で指定してください。"
        });
      const result = await taskService.listToday(userId, args.date);
      return {
        date: result.date,
        tasks: result.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          scheduledTime: task.scheduledTime,
          targetDate: task.targetDate,
          occurrenceKey: task.occurrenceKey,
          periodKey: task.periodKey,
          completedAt: task.completedAt,
          overdue: task.overdue
        }))
      };
    }
    case "create_task": {
      const today = await todayForMcpUser(env.DB, userId);
      const input = createMuseTaskInput(args, today);
      const task = await taskService.createTask(userId, input);
      return taskDetailsForMuse(task);
    }
    case "update_task": {
      if (
        typeof args.taskId !== "string" ||
        !args.taskId ||
        Object.keys(args).some(
          (key) =>
            ![
              "taskId",
              "title",
              "description",
              "date",
              "time",
              "recurrence",
              "notification"
            ].includes(key)
        )
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "taskIdと更新内容を確認してください。"
        });
      const current = await taskService.getTask(userId, args.taskId);
      const today = await todayForMcpUser(env.DB, userId);
      const patch = updateMuseTaskInput(args, current, today);
      const updated = await taskService.updateTask(userId, args.taskId, patch);
      return taskDetailsForMuse(updated);
    }
    case "get_task_details": {
      if (
        typeof args.taskId !== "string" ||
        !args.taskId ||
        Object.keys(args).some((key) => key !== "taskId")
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "taskIdを指定してください。"
        });
      return taskDetailsForMuse(await taskService.getTask(userId, args.taskId));
    }
    case "delete_task": {
      if (
        typeof args.taskId !== "string" ||
        !args.taskId ||
        Object.keys(args).some((key) => key !== "taskId")
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "taskIdを指定してください。"
        });
      await taskService.deactivateTask(userId, args.taskId);
      return { id: args.taskId, deleted: true, deletionMode: "deactivated" };
    }
    case "complete_task": {
      if (
        typeof args.taskId !== "string" ||
        !args.taskId ||
        Object.keys(args).some((key) => !["taskId", "targetDate"].includes(key))
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "taskIdとtargetDateを確認してください。"
        });
      let targetDate = args.targetDate;
      if (targetDate === undefined)
        targetDate = (await taskService.listToday(userId)).date;
      if (typeof targetDate !== "string" || !isValidDateKey(targetDate))
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "targetDateはYYYY-MM-DD形式で指定してください。"
        });
      const state = validateTaskStateInput({ targetDate, calendarDate: targetDate });
      return await taskService.changeState(userId, args.taskId, "complete", state);
    }
    case "get_shopping": {
      if (Object.keys(args).length)
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "このツールに入力項目はありません。"
        });
      const result = await shoppingService.listItems(userId);
      const safeItem = (item: (typeof result.pending)[number]) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        note: item.note,
        status: item.status,
        plannedPurchaseDate: item.plannedPurchaseDate,
        purchasedAt: item.purchasedAt
      });
      return {
        pending: result.pending.map(safeItem),
        purchased: result.purchased.map(safeItem)
      };
    }
    case "add_shopping": {
      if (
        Object.keys(args).some(
          (key) => !["name", "quantity", "note", "plannedPurchaseDate"].includes(key)
        )
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "買い物項目の入力を確認してください。"
        });
      const item = await shoppingService.createItem(
        userId,
        validateShoppingWriteInput(args),
        "Muse"
      );
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        note: item.note,
        plannedPurchaseDate: item.plannedPurchaseDate,
        status: item.status
      };
    }
    case "update_shopping": {
      if (
        typeof args.itemId !== "string" ||
        !args.itemId ||
        Object.keys(args).some(
          (key) => !["itemId", "name", "quantity", "note", "plannedPurchaseDate"].includes(key)
        )
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "itemIdと買い物項目の更新内容を確認してください。"
        });
      const { itemId, ...patch } = args;
      const item = await shoppingService.updateItem(
        userId,
        itemId,
        validateShoppingUpdateInput(patch)
      );
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        note: item.note,
        plannedPurchaseDate: item.plannedPurchaseDate,
        status: item.status
      };
    }
    case "delete_shopping": {
      if (
        typeof args.itemId !== "string" ||
        !args.itemId ||
        Object.keys(args).some((key) => key !== "itemId")
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "itemIdを指定してください。"
        });
      await shoppingService.deleteItem(userId, args.itemId);
      return { id: args.itemId, deleted: true };
    }
    case "unpurchase_shopping": {
      if (
        typeof args.itemId !== "string" ||
        !args.itemId ||
        Object.keys(args).some((key) => key !== "itemId")
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "itemIdを指定してください。"
        });
      const item = await shoppingService.markPending(userId, args.itemId);
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        status: item.status,
        plannedPurchaseDate: item.plannedPurchaseDate,
        purchasedAt: item.purchasedAt
      };
    }
    case "purchase_shopping": {
      if (
        typeof args.itemId !== "string" ||
        !args.itemId ||
        Object.keys(args).some((key) => key !== "itemId")
      )
        throw new AppError({
          code: "VALIDATION_ERROR",
          status: 400,
          message: "itemIdを指定してください。"
        });
      const item = await shoppingService.markPurchased(userId, args.itemId);
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        status: item.status,
        purchasedAt: item.purchasedAt
      };
    }
    case "upload_shopping_image": {
      const input = parseMcpShoppingImageUploadInput(args);
      const image = await new ShoppingItemImageService(
        env.DB,
        env.ATTACHMENTS,
        env
      ).upload(userId, input.itemId, input.image);
      return {
        itemId: image.shoppingItemId,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
        width: image.width,
        height: image.height
      };
    }
    default:
      throw new AppError({
        code: "NOT_FOUND",
        status: 404,
        message: "指定されたツールはありません。"
      });
  }
};

const safeToolError = (error: unknown): string => {
  if (!(error instanceof AppError)) return "HouseToDoで処理できませんでした。";
  switch (error.code) {
    case "VALIDATION_ERROR":
      return error.message;
    case "NOT_FOUND":
    case "TASK_NOT_FOUND":
    case "TASK_RECORD_NOT_FOUND":
    case "SHOPPING_ITEM_NOT_FOUND":
      return "対象が見つかりません。";
    case "FORBIDDEN":
    case "UNAUTHENTICATED":
      return "この操作は許可されていません。";
    case "CONFLICT":
    case "TASK_ALREADY_COMPLETED":
    case "TASK_ALREADY_IN_PROGRESS":
    case "TASK_IN_PROGRESS_BY_OTHER_MEMBER":
    case "SHOPPING_ITEM_ALREADY_PURCHASED":
      return "現在の状態では操作できません。";
    default:
      return "HouseToDoで処理できませんでした。";
  }
};

const callResult = (data: unknown, modern: boolean, isError = false) => ({
  ...(modern ? { resultType: "complete" } : {}),
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
  isError
});

const serveRpc = async (
  body: JsonRecord,
  modern: boolean,
  principal: TokenPrincipal,
  request: Request,
  env: Env
): Promise<{
  response: Response;
  method: string | null;
  version: string | null;
  toolName: string | null;
}> => {
  const method = typeof body.method === "string" ? body.method : null;
  const id = body.id;
  const params = object(body.params) ?? {};
  const meta = object(params._meta);
  const version =
    modern && typeof meta?.[META_PROTOCOL_VERSION] === "string"
      ? meta[META_PROTOCOL_VERSION]
      : null;
  const toolName =
    method === "tools/call" && typeof params.name === "string" ? params.name : null;
  if (body.jsonrpc !== "2.0" || !method)
    return {
      response: responseJson(rpcError(id, -32600, "Invalid Request"), 400),
      method,
      version,
      toolName
    };
  if (method === "notifications/initialized" && !modern && !("id" in body))
    return {
      response: new Response(null, {
        status: 202,
        headers: { "cache-control": "no-store" }
      }),
      method,
      version,
      toolName
    };
  if (!("id" in body))
    return {
      response: responseJson(rpcError(null, -32600, "Invalid Request"), 400),
      method,
      version,
      toolName
    };

  if (modern) {
    const supported = [MODERN_VERSION];
    if (
      !version ||
      !object(meta?.[META_CLIENT_INFO]) ||
      !object(meta?.[META_CLIENT_CAPABILITIES])
    )
      return {
        response: responseJson(rpcError(id, -32020, "Header mismatch"), 400),
        method,
        version,
        toolName
      };
    if (version !== MODERN_VERSION)
      return {
        response: responseJson(
          rpcError(id, -32022, "Unsupported protocol version", {
            supported,
            requested: version
          }),
          400
        ),
        method,
        version,
        toolName
      };
  }

  if (method === "initialize" && !modern) {
    const requested =
      typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    const protocolVersion = LEGACY_VERSIONS.has(requested) ? requested : "2025-11-25";
    return {
      response: responseJson({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo
        }
      }),
      method,
      version: protocolVersion,
      toolName
    };
  }
  if (method === "server/discover" && modern) {
    return {
      response: responseJson({
        jsonrpc: "2.0",
        id,
        result: {
          resultType: "complete",
          supportedVersions: [MODERN_VERSION],
          capabilities: { tools: {} },
          _meta: { "io.modelcontextprotocol/serverInfo": serverInfo },
          instructions:
            "HouseToDoのタスクと買い物リストを、許可されたscopeの範囲で操作します。",
          cacheScope: "user"
        }
      }),
      method,
      version,
      toolName
    };
  }
  if (method === "tools/list") {
    const visibleTools = tools
      .filter((tool) => principal.scopes.has(tool.scope))
      .map(toolDescription);
    return {
      response: responseJson({
        jsonrpc: "2.0",
        id,
        result: modern
          ? { resultType: "complete", tools: visibleTools, cacheScope: "user" }
          : { tools: visibleTools }
      }),
      method,
      version,
      toolName
    };
  }
  if (method === "tools/call") {
    if (typeof params.name !== "string")
      return {
        response: responseJson(rpcError(id, -32602, "Tool name is required")),
        method,
        version,
        toolName
      };
    const selected = tools.find((tool) => tool.name === params.name);
    if (!selected)
      return {
        response: responseJson(rpcError(id, -32602, "Unknown tool")),
        method,
        version,
        toolName
      };
    if (!principal.scopes.has(selected.scope))
      return {
        response: challenge(request, env, 403, selected.scope),
        method,
        version,
        toolName
      };
    const args = params.arguments === undefined ? {} : object(params.arguments);
    if (!args)
      return {
        response: responseJson(
          rpcError(id, -32602, "Tool arguments must be an object")
        ),
        method,
        version,
        toolName
      };
    try {
      const result = await toolData(selected.name, args, principal.user.id, env);
      return {
        response: responseJson({
          jsonrpc: "2.0",
          id,
          result: callResult(result, modern)
        }),
        method,
        version,
        toolName
      };
    } catch (error) {
      return {
        response: responseJson({
          jsonrpc: "2.0",
          id,
          result: callResult({ error: safeToolError(error) }, modern, true)
        }),
        method,
        version,
        toolName
      };
    }
  }
  return {
    response: responseJson(
      rpcError(id, -32601, "Method not found"),
      modern ? 404 : 200
    ),
    method,
    version,
    toolName
  };
};

export const handleMcpRequest = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;
  if (env.APP_ENV !== "staging" && env.APP_ENV !== "test")
    return new Response("Not Found", { status: 404 });
  if (
    path === "/.well-known/oauth-protected-resource/mcp" &&
    request.method === "GET"
  ) {
    const response = protectedResourceMetadata(request, env);
    logRequest(env, {
      path,
      method: request.method,
      jsonrpcMethod: null,
      protocolVersion: null,
      authPresent: false,
      authSuccess: false,
      clientId: null,
      userId: null,
      toolName: null,
      responseStatus: response.status
    });
    return response;
  }
  if (path !== "/mcp") return new Response("Not Found", { status: 404 });
  if (request.method === "GET") {
    const response = new Response(null, {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" }
    });
    logRequest(env, {
      path,
      method: request.method,
      jsonrpcMethod: null,
      protocolVersion: null,
      authPresent: Boolean(request.headers.get("authorization")),
      authSuccess: false,
      clientId: null,
      userId: null,
      toolName: null,
      responseStatus: response.status
    });
    return response;
  }
  if (request.method !== "POST") {
    const response = new Response(null, {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" }
    });
    logRequest(env, {
      path,
      method: request.method,
      jsonrpcMethod: null,
      protocolVersion: null,
      authPresent: Boolean(request.headers.get("authorization")),
      authSuccess: false,
      clientId: null,
      userId: null,
      toolName: null,
      responseStatus: response.status
    });
    return response;
  }
  if (!validateOrigin(request, env)) {
    const response = responseJson({ error: "invalid_origin" }, 403);
    logRequest(env, {
      path,
      method: request.method,
      jsonrpcMethod: null,
      protocolVersion: null,
      authPresent: Boolean(request.headers.get("authorization")),
      authSuccess: false,
      clientId: null,
      userId: null,
      toolName: null,
      responseStatus: response.status
    });
    return response;
  }

  let body: JsonRecord | null = null;
  try {
    body = object(await readBody(request));
  } catch {
    /* malformed or oversized payload */
  }
  const method = typeof body?.method === "string" ? body.method : null;
  const params = object(body?.params) ?? {};
  const meta = object(params._meta);
  const protocolVersion =
    typeof meta?.[META_PROTOCOL_VERSION] === "string"
      ? meta[META_PROTOCOL_VERSION]
      : request.headers.get("mcp-protocol-version");
  const toolName =
    method === "tools/call" && typeof params.name === "string" ? params.name : null;
  const auth = await authenticate(request, env);
  if (!auth.principal) {
    const response = challenge(request, env, 401, ALL_SCOPES, auth.present);
    logRequest(env, {
      path,
      method: request.method,
      jsonrpcMethod: method,
      protocolVersion,
      authPresent: auth.present,
      authSuccess: false,
      clientId: null,
      userId: null,
      toolName,
      responseStatus: response.status
    });
    return response;
  }
  if (!body) {
    const response = responseJson(rpcError(null, -32700, "Parse error"), 400);
    logRequest(env, {
      path,
      method: request.method,
      jsonrpcMethod: method,
      protocolVersion,
      authPresent: auth.present,
      authSuccess: true,
      clientId: auth.principal.clientId,
      userId: auth.principal.user.id,
      toolName,
      responseStatus: response.status
    });
    return response;
  }

  let modern = false;
  const hasMeta = Boolean(meta && META_PROTOCOL_VERSION in meta);
  if (
    hasMeta ||
    protocolVersion === MODERN_VERSION ||
    request.headers.has("mcp-method")
  ) {
    modern = true;
    const headerVersion = request.headers.get("mcp-protocol-version");
    const headerMethod = request.headers.get("mcp-method");
    const headerName = request.headers.get("mcp-name");
    const bodyVersion =
      typeof meta?.[META_PROTOCOL_VERSION] === "string"
        ? meta[META_PROTOCOL_VERSION]
        : null;
    if (
      !bodyVersion ||
      !object(meta?.[META_CLIENT_INFO]) ||
      !object(meta?.[META_CLIENT_CAPABILITIES]) ||
      !headerVersion ||
      headerVersion !== bodyVersion ||
      headerMethod !== method ||
      (method === "tools/call" && headerName !== params.name)
    ) {
      const response = responseJson(rpcError(body.id, -32020, "Header mismatch"), 400);
      logRequest(env, {
        path,
        method: request.method,
        jsonrpcMethod: method,
        protocolVersion,
        authPresent: auth.present,
        authSuccess: true,
        clientId: auth.principal.clientId,
        userId: auth.principal.user.id,
        toolName,
        responseStatus: response.status
      });
      return response;
    }
  }
  if (
    modern &&
    method !== "server/discover" &&
    method !== "tools/list" &&
    method !== "tools/call"
  ) {
    const response = responseJson(rpcError(body.id, -32601, "Method not found"), 404);
    logRequest(env, {
      path,
      method: request.method,
      jsonrpcMethod: method,
      protocolVersion,
      authPresent: auth.present,
      authSuccess: true,
      clientId: auth.principal.clientId,
      userId: auth.principal.user.id,
      toolName,
      responseStatus: response.status
    });
    return response;
  }
  const result = await serveRpc(body, modern, auth.principal, request, env);
  logRequest(env, {
    path,
    method: request.method,
    jsonrpcMethod: result.method,
    protocolVersion: result.version ?? protocolVersion,
    authPresent: auth.present,
    authSuccess: true,
    clientId: auth.principal.clientId,
    userId: auth.principal.user.id,
    toolName: result.toolName,
    responseStatus: result.response.status
  });
  return result.response;
};
