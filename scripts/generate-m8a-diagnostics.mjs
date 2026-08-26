import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const diagnosticsDir = join(root, "docs", "evidence", "m8a", "diagnostics");
const appSource = await readFile(join(root, "worker", "app.ts"), "utf8");
const implementationSha =
  process.env.M8A_IMPLEMENTATION_SHA ??
  execFileSync("git", ["-c", "safe.directory=*", "rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  }).trim();

const staticRoutes = [
  ...appSource.matchAll(/case "([^"]+)":\s*return ([A-Za-z0-9_]+)\(context\)/g)
].map((match) => {
  const [method, path] = match[1].split(" ");
  return { method, path, handler: match[2] };
});

const route = (
  method,
  path,
  handler,
  service,
  repository,
  frontendCaller,
  internalWorkerCaller,
  scheduledCaller,
  e2eCaller,
  testOnlyCaller,
  canonicalFeature,
  verdict,
  finalStatus,
  reason = null
) => ({
  method,
  path,
  routeHandler: handler,
  service,
  repository,
  frontendCaller,
  internalWorkerCaller,
  scheduledCaller,
  e2eCaller,
  testOnlyCaller,
  canonicalFeature,
  verdict,
  finalStatus,
  reason
});

const dynamicRoutes = [
  route(
    "GET",
    "/api/users/:id/avatar",
    "getProfileImageRoute",
    "UserAvatarService.get",
    "UserRepository.findById",
    [],
    ["TaskService snapshot URL", "DashboardService member avatar URL"],
    [],
    [],
    ["worker/app.test.ts", "e2e/shopping-image.spec.ts"],
    "avatar / image ownership",
    "KEEP_INTERNAL",
    "KEPT"
  ),
  ...["GET", "PATCH", "DELETE"].map((method) =>
    route(
      method,
      "/api/task-templates/:id",
      `${method === "GET" ? "get" : method === "PATCH" ? "update" : "delete"}TaskTemplateRoute`,
      `${method === "GET" ? "get" : method === "PATCH" ? "update" : "deactivate"}Template`,
      "TaskTemplateRepository",
      [],
      [],
      [],
      [],
      ["worker/app.test.ts"],
      "Task Template compatibility surface",
      "DEFER_COMPAT",
      "KEPT",
      "No canonical Task runtime caller; external consumers and persisted template rows are not provably absent."
    )
  ),
  ...[
    ["GET", "", "getTaskRoute", "getTask", "KEEP_CANONICAL", "Task Add/Edit"],
    ["PATCH", "", "updateTaskRoute", "updateTask", "KEEP_CANONICAL", "Task Edit"],
    [
      "DELETE",
      "",
      "deleteTaskRoute",
      "deactivateTask",
      "KEEP_CANONICAL",
      "Task Edit delete"
    ],
    [
      "GET",
      "/history",
      "taskHistoryRoute",
      "listHistory",
      "KEEP_CANONICAL",
      "Task Edit previous completion"
    ],
    [
      "POST",
      "/restore",
      "restoreTaskRecordRoute",
      "restoreRecord",
      "KEEP_CANONICAL",
      "Home restore"
    ],
    [
      "POST",
      "/calendar-restore",
      "restoreCalendarTaskRecordRoute",
      "restoreCalendarRecord",
      "KEEP_CANONICAL",
      "Calendar restore"
    ],
    [
      "POST",
      "/start",
      "changeTaskStateRoute",
      "changeState",
      "DEFER_COMPAT",
      "Legacy task state compatibility"
    ],
    [
      "POST",
      "/complete",
      "changeTaskStateRoute",
      "changeState",
      "KEEP_CANONICAL",
      "Home / Calendar complete"
    ],
    [
      "POST",
      "/skip",
      "changeTaskStateRoute",
      "changeState",
      "KEEP_CANONICAL",
      "Home / Calendar pass"
    ],
    [
      "POST",
      "/reset",
      "changeTaskStateRoute",
      "changeState",
      "DEFER_COMPAT",
      "Legacy task state compatibility"
    ]
  ].map(([method, suffix, handler, serviceMethod, verdict, feature]) =>
    route(
      method,
      `/api/tasks/:id${suffix}`,
      handler,
      `TaskService.${serviceMethod}`,
      "TaskRepository + TaskRecordRepository",
      verdict === "KEEP_CANONICAL"
        ? [serviceMethod === "changeState" ? "changeTaskState" : serviceMethod]
        : [],
      [],
      [],
      [],
      ["worker/app.test.ts"],
      feature,
      verdict,
      "KEPT",
      verdict === "DEFER_COMPAT"
        ? "No canonical Task runtime caller; external consumers and legacy state semantics are not provably absent."
        : null
    )
  ),
  ...[
    [
      "GET",
      "",
      "getShoppingItemRoute",
      "getItem",
      "KEEP_CANONICAL",
      "Shopping detail / Calendar deep link"
    ],
    [
      "PATCH",
      "",
      "updateShoppingItemRoute",
      "updateItem",
      "KEEP_CANONICAL",
      "Shopping Edit"
    ],
    [
      "DELETE",
      "",
      "deleteShoppingItemRoute",
      "deleteItem",
      "KEEP_CANONICAL",
      "Shopping Edit delete"
    ],
    [
      "POST",
      "/purchase",
      "purchaseShoppingItemRoute",
      "markPurchased",
      "KEEP_CANONICAL",
      "Shopping purchase"
    ],
    [
      "POST",
      "/unpurchase",
      "unpurchaseShoppingItemRoute",
      "markPending",
      "KEEP_CANONICAL",
      "Shopping restore"
    ],
    [
      "PUT",
      "/image",
      "uploadShoppingItemImageRoute",
      "ShoppingItemImageService.upload",
      "KEEP_CANONICAL",
      "Shopping image upload"
    ],
    [
      "GET",
      "/image",
      "getShoppingItemImageRoute",
      "ShoppingItemImageService.get",
      "KEEP_CANONICAL",
      "Shopping image read"
    ],
    [
      "DELETE",
      "/image",
      "deleteShoppingItemImageRoute",
      "ShoppingItemImageService.delete",
      "KEEP_CANONICAL",
      "Shopping image delete"
    ]
  ].map(([method, suffix, handler, serviceMethod, verdict, feature]) =>
    route(
      method,
      `/api/shopping/items/:id${suffix}`,
      handler,
      serviceMethod,
      "ShoppingItemRepository / ShoppingItemImageRepository",
      [
        serviceMethod.includes("Image")
          ? serviceMethod.split(".").at(-1)
          : serviceMethod
      ],
      [],
      [],
      ["e2e/shopping-image.spec.ts"],
      ["worker/app.test.ts"],
      feature,
      verdict,
      "KEPT"
    )
  ),
  route(
    "POST",
    "/api/shopping/items/reorder",
    "reorderShoppingItemsRoute",
    "reorderItems",
    "ShoppingItemRepository.reorderPending",
    ["reorderShoppingItems"],
    [],
    [],
    ["e2e/shopping-ui.spec.ts", "e2e/m7-real-integration.spec.ts"],
    ["worker/app.test.ts"],
    "Shopping reorder",
    "KEEP_CANONICAL",
    "KEPT"
  ),
  ...[
    ["GET", "", "getShoppingTemplateRoute", "getTemplate"],
    ["PATCH", "", "updateShoppingTemplateRoute", "updateTemplate"],
    ["DELETE", "", "deleteShoppingTemplateRoute", "deactivateTemplate"],
    [
      "POST",
      "/add",
      "addShoppingItemFromTemplateRoute",
      "ShoppingService.addFromTemplate"
    ]
  ].map(([method, suffix, handler, serviceMethod]) =>
    route(
      method,
      `/api/shopping/templates/:id${suffix}`,
      handler,
      serviceMethod,
      "ShoppingTemplateRepository",
      [],
      [],
      [],
      ["e2e/shopping-calendar-ui.spec.ts"],
      ["worker/app.test.ts"],
      "Shopping Template compatibility surface",
      "DEFER_COMPAT",
      "KEPT",
      "Template rows remain a reuse source; CRUD and shortcut route callers are not canonical runtime callers, but external consumers and persisted data are not provably absent."
    )
  )
];

const staticMetadata = new Map([
  [
    "GET /api/health",
    [
      "healthRoute",
      "Health",
      "none",
      [],
      [],
      [],
      ["e2e/* waitForApp"],
      ["worker/app.test.ts"],
      "local health",
      "KEEP_INTERNAL"
    ]
  ],
  [
    "POST /api/auth/register",
    [
      "registerRoute",
      "AuthService.register",
      "UserRepository + SessionRepository",
      ["register"],
      [],
      [],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Auth",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/auth/login",
    [
      "loginRoute",
      "AuthService.login",
      "UserRepository + SessionRepository",
      ["login"],
      [],
      [],
      ["e2e/m6-auth-entry.spec.ts"],
      ["worker/app.test.ts"],
      "Auth",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/auth/logout",
    [
      "logoutRoute",
      "AuthService.logout",
      "SessionRepository",
      ["logout"],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/app.test.ts"],
      "Auth",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/auth/me",
    [
      "meRoute",
      "AuthService.authenticateRequest",
      "SessionRepository + UserRepository",
      ["me"],
      ["App route state machine"],
      [],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Auth / route state",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/account/avatar",
    [
      "profileImageMetadataRoute",
      "UserAvatarService.metadata",
      "UserRepository",
      ["getCurrentProfileImage"],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/account.test.ts"],
      "Account image",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "PATCH /api/account/profile",
    [
      "updateProfileRoute",
      "UserRepository.updateDisplayName",
      "UserRepository",
      ["updateProfile"],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/app.test.ts"],
      "Account",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "PUT /api/account/avatar",
    [
      "uploadProfileImageRoute",
      "UserAvatarService.upload",
      "UserRepository + HouseholdImageUsageRepository",
      ["uploadProfileImage"],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/account.test.ts"],
      "Account image",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "DELETE /api/account/avatar",
    [
      "deleteProfileImageRoute",
      "UserAvatarService.remove",
      "UserRepository + HouseholdImageUsageRepository",
      ["deleteProfileImage"],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/account.test.ts"],
      "Account image",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/notifications/vapid-public-key",
    [
      "vapidPublicKeyRoute",
      "none",
      "none",
      ["getVapidPublicKey"],
      ["Notification settings"],
      ["notification scheduler config"],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/notifications.test.ts"],
      "Notifications",
      "KEEP_INTERNAL"
    ]
  ],
  [
    "POST /api/notifications/subscriptions",
    [
      "registerPushSubscriptionRoute",
      "PushSubscriptionService.register",
      "PushSubscriptionRepository",
      ["registerPushSubscription"],
      [],
      ["notification scheduler"],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/notifications.test.ts"],
      "Notifications",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "DELETE /api/notifications/subscriptions",
    [
      "unregisterPushSubscriptionRoute",
      "PushSubscriptionService.unregister",
      "PushSubscriptionRepository",
      ["unregisterPushSubscription"],
      [],
      ["notification scheduler"],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/notifications.test.ts"],
      "Notifications",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/notifications/test",
    [
      "testPushNotificationRoute",
      "WebPushService.sendTest",
      "PushSubscriptionRepository",
      [],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/notifications.test.ts"],
      "Notifications diagnostic",
      "KEEP_INTERNAL"
    ]
  ],
  [
    "GET /api/notifications/settings",
    [
      "getNotificationSettingsRoute",
      "NotificationSettingsRepository.find",
      "NotificationSettingsRepository",
      ["getNotificationSettings"],
      [],
      ["notification scheduler"],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/notifications.test.ts"],
      "Notifications",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "PATCH /api/notifications/settings",
    [
      "updateNotificationSettingsRoute",
      "NotificationSettingsRepository.upsert",
      "NotificationSettingsRepository",
      ["updateNotificationSettings"],
      [],
      ["notification scheduler"],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/notifications.test.ts"],
      "Notifications",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/households",
    [
      "createHouseholdRoute",
      "HouseholdService.createHousehold",
      "HouseholdRepository + HouseholdMemberRepository",
      ["createHousehold"],
      [],
      [],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Household",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/households/current",
    [
      "currentHouseholdRoute",
      "HouseholdService.getCurrentHousehold",
      "HouseholdRepository + HouseholdMemberRepository",
      ["getCurrentHousehold"],
      [],
      [],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Household",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "PATCH /api/households/current",
    [
      "updateCurrentHouseholdRoute",
      "HouseholdService.updateCurrentHousehold",
      "HouseholdRepository",
      ["updateCurrentHousehold"],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/app.test.ts"],
      "Household",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/households/current/members",
    [
      "currentHouseholdMembersRoute",
      "HouseholdService.listCurrentMembers",
      "HouseholdMemberRepository",
      ["listMembers"],
      ["DashboardService member projection"],
      [],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Household",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/households/current/image-usage",
    [
      "currentHouseholdImageUsageRoute",
      "HouseholdImageUsageService.getForUser",
      "HouseholdImageUsageRepository",
      ["getCurrentImageUsage"],
      ["image upload services"],
      [],
      ["e2e/image-upload-ux.spec.ts"],
      ["worker/image-usage.test.ts"],
      "Image usage",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/households/current/invites",
    [
      "createHouseholdInviteRoute",
      "HouseholdInviteService.createInvite",
      "HouseholdInviteRepository",
      ["createInvite"],
      [],
      [],
      ["e2e/m5-other-settings.spec.ts"],
      ["worker/app.test.ts"],
      "Household invite",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/households/join",
    [
      "joinHouseholdRoute",
      "HouseholdInviteService.joinByCode",
      "HouseholdInviteRepository + HouseholdMemberRepository",
      ["joinHousehold"],
      [],
      [],
      ["e2e/m6-auth-entry.spec.ts"],
      ["worker/app.test.ts"],
      "Household invite",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/households/invites/validate",
    [
      "validateHouseholdInviteRoute",
      "HouseholdInviteService.validateCode",
      "HouseholdInviteRepository",
      ["validateInviteCode"],
      [],
      [],
      ["e2e/m6-auth-entry.spec.ts"],
      ["worker/app.test.ts"],
      "Household invite",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/tasks",
    [
      "listTasksRoute",
      "TaskService.listTasks",
      "TaskRepository.listByHouseholdId",
      [],
      [],
      [],
      ["none (only route mocks)"],
      ["worker/app.test.ts"],
      "Legacy Task list",
      "DEFER_COMPAT"
    ]
  ],
  [
    "GET /api/tasks/recent",
    [
      "recentTasksRoute",
      "TaskService.listRecentTasks",
      "TaskRepository.listRecentCanonicalByHouseholdId",
      ["listRecentTaskDefinitions"],
      [],
      [],
      ["e2e/m2-home-task.spec.ts (mock only)"],
      ["worker/app.test.ts"],
      "Task Add reuse",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/tasks",
    [
      "createTaskRoute",
      "TaskService.createTask",
      "TaskRepository.create",
      ["createTask"],
      ["DashboardService / Calendar projections read created task"],
      ["notification scheduler reads canonical tasks"],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Task Add",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/tasks/today",
    [
      "todayTasksRoute",
      "TaskService.listToday",
      "TaskRepository.listByHouseholdId + TaskRecordRepository",
      [],
      ["DashboardService.getToday -> TaskService.listToday"],
      [],
      ["none (only route mocks)"],
      ["worker/app.test.ts"],
      "Legacy Task today list",
      "DEFER_COMPAT"
    ]
  ],
  [
    "GET /api/tasks/week",
    [
      "weekTasksRoute",
      "TaskService.listWeek",
      "TaskRepository + TaskRecordRepository",
      [],
      ["DashboardService.getToday -> TaskService.listWeek"],
      [],
      ["none (only route mocks)"],
      ["worker/app.test.ts"],
      "Legacy Task week list",
      "DEFER_COMPAT"
    ]
  ],
  [
    "GET /api/tasks/calendar",
    [
      "calendarTasksRoute",
      "TaskService.listCalendar + ShoppingService.listPlannedItems",
      "TaskRepository + TaskRecordRepository + ShoppingItemRepository",
      ["listCalendarTasks"],
      ["Calendar UI"],
      [],
      ["e2e/calendar-ui.spec.ts"],
      ["worker/app.test.ts"],
      "Calendar",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/task-templates",
    [
      "listTaskTemplatesRoute",
      "TaskTemplateService.listTemplates",
      "TaskTemplateRepository.listByHouseholdId",
      [],
      [],
      [],
      ["e2e/ui-foundation.spec.ts (mock only)"],
      ["worker/app.test.ts"],
      "Task Template compatibility surface",
      "DEFER_COMPAT"
    ]
  ],
  [
    "POST /api/task-templates",
    [
      "createTaskTemplateRoute",
      "TaskTemplateService.createTemplate",
      "TaskTemplateRepository.create",
      [],
      [],
      [],
      ["none (worker test only)"],
      ["worker/app.test.ts"],
      "Task Template compatibility surface",
      "DEFER_COMPAT"
    ]
  ],
  [
    "GET /api/dashboard/today",
    [
      "dashboardTodayRoute",
      "DashboardService.getToday",
      "TaskRepository + TaskRecordRepository + ShoppingItemRepository + HouseholdMemberRepository",
      ["getDashboardToday"],
      ["Home UI"],
      ["notification scheduler is independent; no route call"],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Home / Dashboard",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/shopping/items",
    [
      "listShoppingItemsRoute",
      "ShoppingService.listItems",
      "ShoppingItemRepository + ShoppingItemImageRepository",
      ["listShoppingItems"],
      ["DashboardService shopping preview"],
      [],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Shopping",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "GET /api/shopping/recent",
    [
      "listRecentShoppingItemsRoute",
      "ShoppingService.listRecentItems",
      "ShoppingItemRepository.listRecentByHouseholdId",
      ["listRecentShoppingItems"],
      [],
      [],
      ["e2e/shopping-calendar-ui.spec.ts"],
      ["worker/app.test.ts"],
      "Shopping Add reuse",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/shopping/items",
    [
      "createShoppingItemRoute",
      "ShoppingService.createItem",
      "ShoppingItemRepository.create",
      ["createShoppingItem"],
      ["Calendar / Dashboard projections read created item"],
      [],
      ["e2e/*"],
      ["worker/app.test.ts"],
      "Shopping Add",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/shopping/items/clear-purchased",
    [
      "clearPurchasedShoppingItemsRoute",
      "ShoppingService.clearPurchased",
      "ShoppingItemRepository.clearPurchasedWithImages + ShoppingItemImageRepository",
      [],
      [],
      [],
      ["e2e/shopping-image.spec.ts cleanup", "staging comment only"],
      ["worker/app.test.ts"],
      "Legacy Shopping cleanup",
      "DEFER_COMPAT"
    ]
  ],
  [
    "GET /api/shopping/templates",
    [
      "listShoppingTemplatesRoute",
      "ShoppingTemplateService.listTemplates",
      "ShoppingTemplateRepository.listByHouseholdId",
      ["listShoppingTemplates"],
      [],
      [],
      ["e2e/shopping-calendar-ui.spec.ts"],
      ["worker/app.test.ts"],
      "Shopping Add reuse",
      "KEEP_CANONICAL"
    ]
  ],
  [
    "POST /api/shopping/templates",
    [
      "createShoppingTemplateRoute",
      "ShoppingTemplateService.createTemplate",
      "ShoppingTemplateRepository.create",
      [],
      [],
      [],
      ["e2e/shopping-calendar-ui.spec.ts fixture setup"],
      ["worker/app.test.ts"],
      "Shopping Template compatibility surface",
      "DEFER_COMPAT"
    ]
  ]
]);

const staticRoutesWithMetadata = staticRoutes.map(({ method, path, handler }) => {
  const entry = staticMetadata.get(`${method} ${path}`);
  if (!entry) throw new Error(`Missing M8A metadata for ${method} ${path}`);
  const [
    expectedHandler,
    service,
    repository,
    frontendCaller,
    internalWorkerCaller,
    scheduledCaller,
    e2eCaller,
    testOnlyCaller,
    canonicalFeature,
    verdict
  ] = entry;
  if (expectedHandler !== handler)
    throw new Error(
      `Handler mismatch for ${method} ${path}: ${handler} != ${expectedHandler}`
    );
  return route(
    method,
    path,
    handler,
    service,
    repository,
    frontendCaller,
    internalWorkerCaller,
    scheduledCaller,
    e2eCaller,
    testOnlyCaller,
    canonicalFeature,
    verdict,
    "KEPT",
    verdict === "DEFER_COMPAT"
      ? "No canonical runtime caller; external consumers and persisted compatibility data are not provably absent."
      : null
  );
});

const routes = [...staticRoutesWithMetadata, ...dynamicRoutes];
const migrationNames = (await readdir(join(root, "migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationHashes = {};
for (const name of migrationNames)
  migrationHashes[name] = createHash("sha256")
    .update(await readFile(join(root, "migrations", name)))
    .digest("hex");
const migrationHash = createHash("sha256")
  .update(JSON.stringify(migrationHashes))
  .digest("hex");

const wrapperAudit = {
  removed: [
    {
      name: "listTasks",
      file: "src/api/tasks.ts",
      replacement: "getDashboardToday / listRecentTaskDefinitions",
      runtimeReferenceCount: 0,
      verdict: "REMOVE_DEAD_WRAPPER"
    },
    {
      name: "listTodayTasks",
      file: "src/api/tasks.ts",
      replacement: "getDashboardToday",
      runtimeReferenceCount: 0,
      verdict: "REMOVE_DEAD_WRAPPER"
    },
    {
      name: "listWeekTasks",
      file: "src/api/tasks.ts",
      replacement: "getDashboardToday",
      runtimeReferenceCount: 0,
      verdict: "REMOVE_DEAD_WRAPPER"
    },
    {
      name: "Task Template CRUD wrappers",
      file: "src/api/tasks.ts",
      replacement:
        "listTaskTemplates route remains deferred; no canonical wrapper caller",
      runtimeReferenceCount: 0,
      verdict: "REMOVE_DEAD_WRAPPER"
    },
    {
      name: "clearPurchasedItems / clearPurchasedShoppingItems",
      file: "src/api/shopping.ts",
      replacement: "Worker route remains DEFER_COMPAT",
      runtimeReferenceCount: 0,
      verdict: "REMOVE_DEAD_WRAPPER"
    },
    {
      name: "Shopping Template CRUD/detail/add wrappers",
      file: "src/api/shopping.ts",
      replacement: "listShoppingTemplates",
      runtimeReferenceCount: 0,
      verdict: "REMOVE_DEAD_WRAPPER"
    }
  ],
  kept: [
    "listRecentTaskDefinitions",
    "getTask",
    "createTask",
    "updateTask",
    "deactivateTask",
    "listCalendarTasks",
    "changeTaskState",
    "restoreTaskRecord",
    "restoreCalendarTaskRecord",
    "listTaskHistory",
    "listShoppingItems",
    "listRecentShoppingItems",
    "listShoppingTemplates",
    "getShoppingItem",
    "createShoppingItem",
    "updateShoppingItem",
    "purchaseShoppingItem",
    "unpurchaseShoppingItem",
    "reorderShoppingItems",
    "deleteShoppingItem",
    "uploadShoppingItemImage",
    "deleteShoppingItemImage",
    "getShoppingItemImageUrl"
  ]
};

const internalMethodCleanup = {
  removed: [
    {
      symbol: "ShoppingService.listUnplannedItems",
      file: "worker/services/shopping-service.ts",
      runtimeReferenceCount: 0
    },
    {
      symbol: "ShoppingItemRepository.listUnplannedByHouseholdId",
      file: "worker/repositories/shopping-item-repository.ts",
      runtimeReferenceCount: 0
    },
    {
      symbol: "TaskRecordRepository.findWeeklyOpenRecord",
      file: "worker/repositories/task-record-repository.ts",
      runtimeReferenceCount: 0
    },
    {
      symbol: "TaskRepository.replaceWeekdays",
      file: "worker/repositories/task-repository.ts",
      runtimeReferenceCount: 0
    },
    {
      symbol: "ShoppingItemImageRepository.deleteForItem",
      file: "worker/repositories/shopping-item-image-repository.ts",
      runtimeReferenceCount: 0
    },
    {
      symbol: "ShoppingItemImageService.listMetadata",
      file: "worker/services/shopping-item-image-service.ts",
      runtimeReferenceCount: 0
    },
    {
      symbol: "ShoppingItemImageService.deleteForHouseholdItem",
      file: "worker/services/shopping-item-image-service.ts",
      runtimeReferenceCount: 0
    },
    {
      symbol: "ShoppingItemImageService.deletePurchased",
      file: "worker/services/shopping-item-image-service.ts",
      runtimeReferenceCount: 0
    }
  ],
  keptBecauseSharedOrBackground: [
    "TaskService.listToday",
    "TaskService.listWeek",
    "TaskRecordRepository.findByOccurrenceKey (notification scheduler)",
    "ShoppingService.clearPurchased",
    "ShoppingItemImageRepository.listPurchasedByHousehold",
    "notification scheduler",
    "image reservation cleanup",
    "orphan R2 cleanup"
  ]
};

const compatibilityAudit = {
  dashboard: [
    {
      field: "todayTasks",
      runtimeReader: "src/App.tsx fallback only; DashboardToday type/tests",
      writer: "DashboardService.getToday",
      verdict: "DEFER_COMPAT",
      reason:
        "Response-shape removal has higher compatibility risk; keep additive legacy field in M8A."
    },
    {
      field: "weeklyTasks",
      runtimeReader: "DashboardToday type/tests; no canonical Home render",
      writer: "DashboardService.getToday -> TaskService.listWeek",
      verdict: "DEFER_COMPAT",
      reason: "Task week route/service remains compatibility surface."
    },
    {
      field: "summary",
      runtimeReader: "DashboardToday type/tests",
      writer: "DashboardService.getToday",
      verdict: "DEFER_COMPAT",
      reason: "Response-shape removal has higher compatibility risk."
    },
    {
      field: "homeTasks / completedRecords / passedRecords / shopping / members",
      runtimeReader: "Home, Calendar-linked projection, Other and avatar flows",
      writer: "DashboardService.getToday",
      verdict: "KEEP",
      reason: "Canonical Home or shared data contract."
    }
  ],
  calendar: [
    {
      field: "from / to / today / timezone / selectedDate / dates / selected",
      runtimeReader: "Calendar UI",
      writer: "TaskService.listCalendar + ShoppingService.listPlannedItems",
      verdict: "KEEP",
      reason: "Canonical Calendar contract."
    },
    {
      field: "fixedCompletedCount / fixedSkippedCount / purchasedShoppingCount",
      runtimeReader: "No destructive removal in M8A",
      writer: "calendarTasksRoute",
      verdict: "DEFER_COMPAT",
      reason: "Additive M3 fields and response compatibility are retained."
    },
    {
      field: "shoppingCount / selected.shopping / task summaries / completed records",
      runtimeReader: "Calendar grid, Date Sheet and Shopping deep links",
      writer: "calendarTasksRoute",
      verdict: "KEEP",
      reason: "Canonical Calendar and Shopping integration."
    }
  ]
};

const m8bCandidates = [
  {
    candidate: "task_templates table and CRUD response surface",
    currentReader:
      "TaskTemplateService.listTemplates; no canonical Task runtime import",
    currentWriter: "TaskTemplateService CRUD routes; persisted rows",
    rowOrDataMigrationRequirement: "Unknown; no migration proposed",
    risk: "External consumer and old template rows",
    recommendedAction: "DEFER_SCHEMA / DEFER_COMPAT; review after M8A"
  },
  {
    candidate: "shopping_templates table and CRUD/add routes",
    currentReader:
      "ShoppingTemplateService.listTemplates; Shopping Add reuse reads list",
    currentWriter: "ShoppingTemplateService CRUD routes",
    rowOrDataMigrationRequirement: "Unknown; no migration proposed",
    risk: "Canonical reuse source and external consumer",
    recommendedAction: "KEEP list; DEFER_COMPAT CRUD/add"
  },
  {
    candidate: "dashboard legacy response fields",
    currentReader: "todayTasks fallback/type/tests; weeklyTasks/summary compatibility",
    currentWriter: "DashboardService.getToday",
    rowOrDataMigrationRequirement: "None for M8A",
    risk: "API response-shape compatibility",
    recommendedAction: "DEFER_COMPAT"
  },
  {
    candidate: "calendar additive count/status fields",
    currentReader: "Canonical counts partly unused; response retained",
    currentWriter: "calendarTasksRoute",
    rowOrDataMigrationRequirement: "None for M8A",
    risk: "Calendar clients and old fixtures",
    recommendedAction: "DEFER_COMPAT"
  },
  {
    candidate: "legacy task recurrence columns and enum values",
    currentReader:
      "TaskRepository, TaskService, scheduler and legacy weekly compatibility",
    currentWriter: "Task create/update compatibility path",
    rowOrDataMigrationRequirement: "Persisted value conversion may be required",
    risk: "Existing task records and scheduler semantics",
    recommendedAction: "KEEP / UNKNOWN"
  },
  {
    candidate: "nullable task record snapshots and calendar_action_date",
    currentReader: "Dashboard, Calendar and fallback projections",
    currentWriter: "TaskService.applyState",
    rowOrDataMigrationRequirement: "No conversion established",
    risk: "Historical NULL rows and restore identity",
    recommendedAction: "KEEP / UNKNOWN"
  }
];

const output = {
  schemaVersion: 1,
  milestone: "M8A",
  generatedBy: "scripts/generate-m8a-diagnostics.mjs",
  productionBaseSha: "8e4653286d964f1ef88be6da92ad7b11e9c21ed5",
  implementationSha,
  branch: execFileSync("git", ["-c", "safe.directory=*", "branch", "--show-current"], {
    cwd: root,
    encoding: "utf8"
  }).trim(),
  routeRegistrySource: "worker/app.ts",
  routeCount: {
    before: routes.length,
    after: routes.length,
    removed: 0,
    kept: routes.length
  },
  routes,
  searchScope: [
    "src/",
    "worker/",
    "e2e/",
    "scripts/",
    "service worker (public/sw.js)",
    "scheduled handler (worker/index.ts)",
    "tests (src/**/*.test.*, worker/**/*.test.*)"
  ],
  wrapperAudit,
  internalMethodCleanup,
  compatibilityAudit,
  m8bCandidates,
  dbSafety: {
    migrationFilesChanged: 0,
    newMigrationFiles: [],
    migrationHash,
    schemaDiff: 0,
    remoteMigration: "NOT RUN",
    deploy: "NOT RUN",
    secretsOrCronChanged: false
  }
};

await writeFile(
  join(diagnosticsDir, "api-reachability.json"),
  `${JSON.stringify(output, null, 2)}\n`
);
await writeFile(
  join(diagnosticsDir, "schema-snapshot.json"),
  `${JSON.stringify({ schemaVersion: 1, productionBaseSha: output.productionBaseSha, implementationSha, migrationFiles: migrationNames, migrationHashes, migrationHash, migrationFilesChanged: 0, newMigrationFiles: [], schemaDiff: 0, remoteMigration: "NOT RUN", deploy: "NOT RUN" }, null, 2)}\n`
);
await writeFile(
  join(diagnosticsDir, "cleanup-result.json"),
  `${JSON.stringify({ schemaVersion: 1, milestone: "M8A", productionBaseSha: output.productionBaseSha, implementationSha, routeCount: output.routeCount, removedFrontendWrappers: wrapperAudit.removed, removedInternalMethods: internalMethodCleanup.removed, removedWorkerRoutes: [], removedRouteHandlers: [], removedServiceMethods: internalMethodCleanup.removed.filter((entry) => entry.symbol.includes("Service.")), removedRepositoryMethods: internalMethodCleanup.removed.filter((entry) => entry.symbol.includes("Repository.")), removedTests: ["dead frontend wrapper request assertions only; Worker route contract tests retained"], intentionallyKept: { canonicalReuse: ["GET /api/tasks/recent", "GET /api/shopping/recent", "GET /api/shopping/templates"], backgroundScheduled: internalMethodCleanup.keptBecauseSharedOrBackground, compatibilityDeferred: routes.filter((entry) => entry.verdict === "DEFER_COMPAT").map((entry) => `${entry.method} ${entry.path}`), dbSchema: "unchanged" }, verdict: "NON_DESTRUCTIVE_CLEANUP_ONLY" }, null, 2)}\n`
);
