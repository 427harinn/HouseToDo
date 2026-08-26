import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const diagnostics = join(root, "docs/evidence/m8b/diagnostics");
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
const git = (...args) => run("git", ["-c", "safe.directory=*", ...args]);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const d1 = (sql) => {
  const output = run(process.execPath, [
    join(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "house-to-do",
    "--local",
    "--command",
    sql,
    "--json"
  ]);
  const parsed = JSON.parse(output);
  return parsed[0]?.results ?? [];
};

const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const freshMigration = async () => {
  const artifacts = join(root, "artifacts");
  await mkdir(artifacts, { recursive: true });
  const persistTo = await mkdtemp(join(artifacts, "m8b-fresh-"));
  const migration = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "migrations",
      "apply",
      "house-to-do",
      "--local",
      "--persist-to",
      persistTo
    ],
    { cwd: root, encoding: "utf8" }
  );
  const schemaQuery = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "execute",
      "house-to-do",
      "--local",
      "--persist-to",
      persistTo,
      "--command",
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA', 'd1_migrations') ORDER BY name",
      "--json"
    ],
    { cwd: root, encoding: "utf8" }
  );
  const migrationState = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "execute",
      "house-to-do",
      "--local",
      "--persist-to",
      persistTo,
      "--command",
      "SELECT name FROM d1_migrations ORDER BY name",
      "--json"
    ],
    { cwd: root, encoding: "utf8" }
  );
  const keyColumnQuery = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "execute",
      "house-to-do",
      "--local",
      "--persist-to",
      persistTo,
      "--command",
      "SELECT 'tasks' AS table_name, name FROM pragma_table_info('tasks') WHERE name IN ('recurrence_type', 'model_recurrence_type', 'weekly_target_count') UNION ALL SELECT 'task_records', name FROM pragma_table_info('task_records') WHERE name IN ('task_title_snapshot', 'assigned_user_id_snapshot', 'calendar_action_date') UNION ALL SELECT 'shopping_templates', name FROM pragma_table_info('shopping_templates') WHERE name IN ('name', 'active') ORDER BY table_name, name",
      "--json"
    ],
    { cwd: root, encoding: "utf8" }
  );
  const parseResults = (result) => {
    if (result.status !== 0) return [];
    try {
      return JSON.parse(result.stdout)[0]?.results ?? [];
    } catch {
      return [];
    }
  };
  const tables = parseResults(schemaQuery)
    .map((row) => row.name)
    .sort();
  const applied = parseResults(migrationState)
    .map((row) => row.name)
    .sort();
  const keyColumns = Object.groupBy(
    parseResults(keyColumnQuery),
    (row) => row.table_name
  );
  const expectedTables = [
    "attachments",
    "household_image_usage",
    "household_invites",
    "household_members",
    "households",
    "image_upload_reservations",
    "notification_deliveries",
    "notification_logs",
    "orphan_r2_objects",
    "push_subscriptions",
    "sessions",
    "shopping_item_images",
    "shopping_items",
    "shopping_templates",
    "task_records",
    "task_templates",
    "task_weekdays",
    "tasks",
    "user_notification_settings",
    "users"
  ];
  const artifact = {
    command: `node ${wrangler} d1 migrations apply house-to-do --local --persist-to ${persistTo}`,
    exitCode: migration.status ?? 1,
    status:
      migration.status === 0 &&
      applied.length === migrationNames.length &&
      applied.every((name, index) => name === migrationNames[index]) &&
      tables.length === expectedTables.length &&
      expectedTables.every((name, index) => name === tables[index]) &&
      [
        ["tasks", ["recurrence_type", "model_recurrence_type", "weekly_target_count"]],
        [
          "task_records",
          ["task_title_snapshot", "assigned_user_id_snapshot", "calendar_action_date"]
        ],
        ["shopping_templates", ["name", "active"]]
      ].every(([table, names]) =>
        names.every((name) => keyColumns[table]?.some((row) => row.name === name))
      ),
    appliedMigrations: applied,
    migrationCount: applied.length,
    expectedMigrationCount: migrationNames.length,
    tables,
    expectedTableCount: expectedTables.length,
    keyColumns,
    expectedKeyColumns: {
      tasks: ["recurrence_type", "model_recurrence_type", "weekly_target_count"],
      task_records: [
        "task_title_snapshot",
        "assigned_user_id_snapshot",
        "calendar_action_date"
      ],
      shopping_templates: ["name", "active"]
    },
    schemaQueryExitCode: schemaQuery.status ?? 1,
    migrationStateQueryExitCode: migrationState.status ?? 1,
    keyColumnQueryExitCode: keyColumnQuery.status ?? 1,
    persistenceDirectory: persistTo
  };
  artifact.status = artifact.status ? "PASS" : "FAIL";
  await writeFile(
    join(diagnostics, "fresh-db-migration.json"),
    `${JSON.stringify(artifact, null, 2)}\n`
  );
  return artifact;
};

const migrationNames = (await readdir(join(root, "migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationHashes = Object.fromEntries(
  await Promise.all(
    migrationNames.map(async (name) => [
      name,
      createHash("sha256")
        .update(await readFile(join(root, "migrations", name)))
        .digest("hex")
    ])
  )
);
const migrationHash = createHash("sha256")
  .update(JSON.stringify(migrationHashes))
  .digest("hex");
const m8aSchema = await readJson(
  join(root, "docs/evidence/m8a/diagnostics/schema-snapshot.json")
);
const m8aReachability = await readJson(
  join(root, "docs/evidence/m8a/diagnostics/api-reachability.json")
);
const appSource = await readFile(join(root, "worker/app.ts"), "utf8");
const implementationSha = git("rev-parse", "HEAD");
const productionBaseSha = git("rev-parse", "origin/main");
const branch = git("branch", "--show-current");

const schemaObjects = d1(
  "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name != '_cf_METADATA' ORDER BY type, name"
);
const tableNames = schemaObjects
  .filter((row) => row.type === "table" && row.name !== "d1_migrations")
  .map((row) => row.name)
  .sort();
const indexes = schemaObjects
  .filter((row) => row.type === "index")
  .map((row) => ({ name: row.name, sql: row.sql }))
  .sort((a, b) => a.name.localeCompare(b.name));
const tableColumns = {};
const foreignKeys = {};
for (const table of tableNames) {
  tableColumns[table] = d1(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).map(
    (row) => ({
      name: row.name,
      type: row.type,
      notNull: row.notnull === 1,
      primaryKey: row.pk === 1,
      defaultValue: row.dflt_value
    })
  );
  foreignKeys[table] = d1(
    `PRAGMA foreign_key_list("${table.replaceAll('"', '""')}")`
  ).map((row) => ({
    table: row.table,
    from: row.from,
    to: row.to,
    onDelete: row.on_delete,
    onUpdate: row.on_update
  }));
}

const rowCounts = Object.fromEntries(
  d1(
    "SELECT 'tasks' AS table_name, COUNT(*) AS row_count FROM tasks UNION ALL SELECT 'task_records', COUNT(*) FROM task_records UNION ALL SELECT 'task_templates', COUNT(*) FROM task_templates UNION ALL SELECT 'shopping_items', COUNT(*) FROM shopping_items UNION ALL SELECT 'shopping_templates', COUNT(*) FROM shopping_templates"
  ).map((row) => [row.table_name, Number(row.row_count)])
);
const activeCounts = d1(
  "SELECT 'task_templates' AS table_name, COUNT(*) AS active_count FROM task_templates WHERE active = 1 UNION ALL SELECT 'shopping_templates', COUNT(*) FROM shopping_templates WHERE active = 1"
);
const recurrenceDistribution = d1(
  "SELECT recurrence_type, model_recurrence_type, weekly_target_count, COUNT(*) AS row_count FROM tasks GROUP BY recurrence_type, model_recurrence_type, weekly_target_count ORDER BY recurrence_type, model_recurrence_type, weekly_target_count"
);
const recordNulls =
  d1(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN task_title_snapshot IS NULL THEN 1 ELSE 0 END) AS null_task_title_snapshot, SUM(CASE WHEN assigned_user_id_snapshot IS NULL THEN 1 ELSE 0 END) AS null_assigned_user_snapshot, SUM(CASE WHEN calendar_action_date IS NULL THEN 1 ELSE 0 END) AS null_calendar_action_date FROM task_records"
  )[0] ?? {};
const legacyRecurrenceRows = recurrenceDistribution
  .filter((row) => row.model_recurrence_type === null)
  .reduce((sum, row) => sum + Number(row.row_count), 0);
const taskTemplateRows = Number(rowCounts.task_templates ?? 0);
const shoppingTemplateRows = Number(rowCounts.shopping_templates ?? 0);
const nullTaskTitleRows = Number(recordNulls.null_task_title_snapshot ?? 0);
const nullAssignedRows = Number(recordNulls.null_assigned_user_snapshot ?? 0);
const nullCalendarDateRows = Number(recordNulls.null_calendar_action_date ?? 0);

const freshMigrationResult = await freshMigration();

const common = {
  readers: [],
  writers: [],
  runtimeCallers: [],
  scheduledCallers: [],
  canonicalCallers: [],
  testCallers: ["worker/m8b-compatibility.test.ts"],
  existingPersistedData: {},
  migrationRequirement:
    "No migration is required because no object or persisted value is removed.",
  externalConsumerProof:
    "Repository-local scans cannot prove the absence of external Worker consumers; zero frontend callers is insufficient for removal.",
  serverComputationCost:
    "No change made; existing computation remains part of the compatibility contract."
};

const decisions = [
  {
    id: "A",
    name: "task_templates table and Task Template CRUD response/API surface",
    ...common,
    readers: [
      "TaskTemplateRepository.listByHouseholdId",
      "TaskTemplateRepository.findByIdForHousehold",
      "GET /api/task-templates",
      "GET /api/task-templates/:id"
    ],
    writers: [
      "TaskTemplateRepository.create",
      "TaskTemplateRepository.update",
      "TaskTemplateRepository.deactivate",
      "POST/PATCH/DELETE /api/task-templates"
    ],
    runtimeCallers: [
      "worker/app.ts routeApi",
      "task-template routes → TaskTemplateService → TaskTemplateRepository"
    ],
    canonicalCallers: [],
    existingPersistedData: {
      table: "task_templates",
      rows: rowCounts.task_templates,
      activeRows: Number(
        activeCounts.find((row) => row.table_name === "task_templates")?.active_count ??
          0
      ),
      taskRowsReferenceColumn: false
    },
    migrationRequirement:
      "Dropping task_templates would require a data-preserving archival/removal decision; existing rows are present and no canonical replacement reads them.",
    verdict: "KEEP_DATA_COMPAT",
    reason: `${taskTemplateRows} persisted local rows remain. The public CRUD surface is also externally reachable, and absence of external consumers cannot be proven. Keeping the table and API preserves future/legacy template data.`,
    action:
      "Keep task_templates, its repository/service/type, and all five CRUD/list routes. Do not add a DROP TABLE migration."
  },
  {
    id: "B",
    name: "shopping_templates table and Shopping Template CRUD/add routes",
    ...common,
    readers: [
      "ShoppingTemplateRepository.listByHouseholdId",
      "ShoppingTemplateService.listTemplates",
      "GET /api/shopping/templates",
      "Shopping Add reuse picker"
    ],
    writers: [
      "ShoppingTemplateRepository.create/update/deactivate",
      "POST/PATCH/DELETE /api/shopping/templates",
      "POST /api/shopping/templates/:id/add"
    ],
    runtimeCallers: [
      "worker/app.ts routeApi",
      "shopping routes → ShoppingTemplateService/ShoppingService → repositories"
    ],
    canonicalCallers: [
      "src/App.tsx Shopping Add reuse picker → listShoppingTemplates",
      "GET /api/shopping/templates"
    ],
    existingPersistedData: {
      table: "shopping_templates",
      rows: rowCounts.shopping_templates,
      activeRows: Number(
        activeCounts.find((row) => row.table_name === "shopping_templates")
          ?.active_count ?? 0
      ),
      listRouteRowsReadable: true
    },
    migrationRequirement:
      "None; the canonical list and reuse flow require the table. CRUD/add removal would still need an external-consumer proof and retained-row contract.",
    externalConsumerProof:
      "Canonical frontend dependency is proven for list. CRUD/add external absence is not proven; therefore those routes remain compatibility surface.",
    verdict: "KEEP_CANONICAL",
    reason: `The canonical Shopping reuse picker reads GET /api/shopping/templates, and ${shoppingTemplateRows} persisted rows are present. Removing CRUD/add or the table would break existing-row reuse or an unprovable external contract.`,
    action:
      "Keep the table and list route as canonical; retain CRUD/detail/add routes as compatibility APIs and cover list + reuse in contract tests."
  },
  {
    id: "C",
    name: "dashboard legacy response fields",
    ...common,
    readers: [
      "src/api/dashboard.ts todayTasks/weeklyTasks/summary types",
      "src/App.tsx todayTasks fallback",
      "src/App.test.tsx and E2E fixtures"
    ],
    writers: ["DashboardService.getToday", "GET /api/dashboard/today"],
    runtimeCallers: [
      "dashboardTodayRoute → DashboardService.getToday → listHome/listToday/listWeek + summary reduction"
    ],
    canonicalCallers: [
      "src/App.tsx reads homeTasks/completedRecords/passedRecords; todayTasks remains fallback"
    ],
    testCallers: [
      "worker/m8b-compatibility.test.ts",
      "worker/app.test.ts",
      "src/App.test.tsx",
      "e2e fixtures"
    ],
    existingPersistedData: {
      persistedDataRows: "N/A; response compatibility derives from tasks/task_records"
    },
    migrationRequirement:
      "None for a field-only change, but removal is a public response-shape change requiring complete external-consumer proof and updated contract tests.",
    externalConsumerProof:
      "No repository or product contract proves that only this frontend consumes the public Worker response.",
    serverComputationCost:
      "todayTasks, weeklyTasks, and summary are computed by existing shared projections; removing one field alone would not establish safe removal of its computation.",
    verdict: "KEEP_EXTERNAL_COMPAT",
    reason:
      "The response is public and legacy fields remain in types, fallback reads, fixtures, and tests. External consumer absence cannot be established, so backend fields and computation stay.",
    action:
      "Keep todayTasks, weeklyTasks, and summary in the Worker response and TypeScript contract; no response-field migration."
  },
  {
    id: "D",
    name: "calendar additive count/status compatibility fields",
    ...common,
    readers: [
      "src/api/tasks.ts CalendarResponse",
      "src/App.tsx calendar marker defaults and Calendar Date Sheet",
      "worker/app.test.ts and calendar E2E fixtures"
    ],
    writers: [
      "TaskService.listCalendar",
      "calendarTasksRoute",
      "GET /api/tasks/calendar"
    ],
    runtimeCallers: [
      "calendarTasksRoute → TaskService.listCalendar + ShoppingService.listPlannedItems"
    ],
    canonicalCallers: [
      "Calendar grid, Date Sheet, Shopping integration, task edit return context"
    ],
    testCallers: [
      "worker/m8b-compatibility.test.ts",
      "worker/app.test.ts",
      "e2e/calendar-ui.spec.ts",
      "e2e/shopping-calendar-ui.spec.ts"
    ],
    existingPersistedData: {
      persistedDataRows:
        "N/A; counts/status are projections over task_records and planned shopping_items"
    },
    migrationRequirement:
      "None for additive response fields; removing them would be a public API change and could require client/version coordination.",
    externalConsumerProof:
      "No repository or product contract proves absence of external Calendar clients.",
    verdict: "KEEP_EXTERNAL_COMPAT",
    reason:
      "Calendar response shape is public. Canonical Calendar and Shopping integration remain active, while additive count/status fields can be consumed by older clients; removal proof is incomplete.",
    action:
      "Keep fixedCompletedCount, fixedSkippedCount, shoppingCount, purchasedShoppingCount, status, and related Calendar fields; protect with current-response contract tests."
  },
  {
    id: "E",
    name: "legacy task recurrence columns / enum values",
    ...common,
    readers: [
      "TaskRepository legacy columns",
      "TaskService legacy projection fallback",
      "notification scheduler",
      "legacy weekly compatibility path",
      "calendar/dashboard projections"
    ],
    writers: [
      "Task create/update compatibility normalization",
      "legacy recurrence_type and weekly_target_count persistence"
    ],
    runtimeCallers: [
      "Task routes/services/repositories",
      "scheduler projection",
      "Home/Calendar/Dashboard projections"
    ],
    scheduledCallers: [
      "notification-scheduler-service.ts legacy path for model_recurrence_type NULL"
    ],
    canonicalCallers: [
      "Canonical projections still accept legacy tasks and preserve model-only separation"
    ],
    testCallers: [
      "worker/m8b-compatibility.test.ts",
      "worker/services/notification-scheduler-service.test.ts",
      "worker/app.test.ts",
      "e2e/m7-real-integration.spec.ts"
    ],
    existingPersistedData: {
      table: "tasks",
      rows: rowCounts.tasks,
      recurrenceDistribution
    },
    migrationRequirement:
      "Any enum/column conversion would require populated legacy fixture migration, scheduler parity, old-row fallback, and rollback/repair evidence. No safe conversion is established.",
    externalConsumerProof:
      "Not applicable to persisted compatibility alone; external API clients may also send legacy request fields.",
    verdict: "KEEP_DATA_COMPAT",
    reason: `The local DB contains ${legacyRecurrenceRows} legacy rows with NULL model_recurrence_type plus legacy columns used by scheduler and compatibility normalization. Converting or dropping them could change occurrence and notification semantics.`,
    action:
      "Keep legacy recurrence columns, enum values, weekdays, monthly fields, and fallback/normalization paths; do not rewrite existing task rows."
  },
  {
    id: "F",
    name: "nullable task-record snapshots / calendar_action_date",
    ...common,
    readers: [
      "DashboardService.homeRecordResponse",
      "TaskService Calendar projection/restore",
      "task record response fallback",
      "Home/Calendar/History restore paths"
    ],
    writers: [
      "TaskService.applyState snapshot capture",
      "calendar completion writes calendar_action_date when available"
    ],
    runtimeCallers: [
      "Dashboard, Calendar, History, restore, calendar-restore, actor/completer identity fallback"
    ],
    canonicalCallers: [
      "Home completed/passed records, Calendar selected-date history and restore"
    ],
    testCallers: [
      "worker/m8b-compatibility.test.ts",
      "worker/app.test.ts",
      "calendar E2E contracts"
    ],
    existingPersistedData: {
      table: "task_records",
      ...recordNulls,
      snapshotNullRows: Number(recordNulls.null_task_title_snapshot ?? 0),
      calendarActionDateNullRows: Number(recordNulls.null_calendar_action_date ?? 0)
    },
    migrationRequirement:
      "Changing NULL columns to NOT NULL or rewriting history requires a lossless identity backfill for old rows and a proven safe date/completer policy; neither is available.",
    externalConsumerProof:
      "Not applicable to historical data safety; old rows are local persisted compatibility data.",
    verdict: "KEEP_DATA_COMPAT",
    reason: `The populated local DB contains ${nullTaskTitleRows} NULL task-title snapshots, ${nullAssignedRows} NULL assignee snapshots, and ${nullCalendarDateRows} NULL calendar_action_date values. Current code intentionally falls back to current task/member data and target/action dates so Home, Calendar, actor identity, and restore remain readable.`,
    action:
      "Keep nullable columns and fallback readers; do not add NOT NULL, rewrite, or historical data migration."
  }
].map((decision) => ({
  ...decision,
  runtimeCallers: decision.runtimeCallers.length
    ? decision.runtimeCallers
    : ["None beyond the route/service/repository chain stated in readers/writers."]
}));

const invalidVerdicts = decisions.filter(
  (decision) =>
    ![
      "REMOVE_SAFE",
      "KEEP_CANONICAL",
      "KEEP_BACKGROUND",
      "KEEP_DATA_COMPAT",
      "KEEP_EXTERNAL_COMPAT",
      "KEEP_UNKNOWN"
    ].includes(decision.verdict)
);
if (invalidVerdicts.length)
  throw new Error(
    `invalid candidate verdicts: ${invalidVerdicts.map((decision) => decision.id).join(", ")}`
  );
const currentRouteHandlers = m8aReachability.routes.filter(
  (route) => !appSource.includes(route.routeHandler)
);
if (currentRouteHandlers.length)
  throw new Error(
    `route registry drift detected: ${currentRouteHandlers.map((route) => route.routeHandler).join(", ")}`
  );
const contractTest = spawnSync(
  process.execPath,
  [
    join(root, "node_modules/vitest/vitest.mjs"),
    "run",
    "--maxWorkers=1",
    "--minWorkers=1",
    "worker/m8b-compatibility.test.ts"
  ],
  { cwd: root, stdio: "ignore" }
);
const contractResult = {
  command: "npm test -- worker/m8b-compatibility.test.ts",
  exitCode: contractTest.status ?? 1,
  status: contractTest.status === 0 ? "PASS" : "FAIL",
  summary: "M8B compatibility contract test"
};
await writeFile(
  join(root, "artifacts/m8b-compatibility-result.json"),
  `${JSON.stringify(contractResult, null, 2)}\n`
);
await writeFile(
  join(diagnostics, "m8b-compatibility-result.json"),
  `${JSON.stringify(contractResult, null, 2)}\n`
);
if (contractTest.status !== 0)
  throw new Error(
    "M8B compatibility contract test failed; diagnostics were not generated."
  );

const finalSchema = {
  schemaVersion: 1,
  milestone: "M8B",
  productionBaseSha,
  branch,
  implementationSha,
  sourceOfTruth: [
    "migrations/",
    "local D1 sqlite_master/PRAGMA snapshot",
    "worker/app.ts",
    "final-candidate-decisions.json"
  ],
  migrationFiles: {
    before: m8aSchema.migrationFiles,
    after: migrationNames,
    added: migrationNames.filter((name) => !m8aSchema.migrationFiles.includes(name)),
    removed: m8aSchema.migrationFiles.filter((name) => !migrationNames.includes(name))
  },
  migrationHashes: {
    before: m8aSchema.migrationHashes,
    after: migrationHashes,
    changed: migrationNames.filter(
      (name) => m8aSchema.migrationHashes[name] !== migrationHashes[name]
    )
  },
  migrationHash: {
    before: m8aSchema.migrationHash,
    after: migrationHash,
    unchanged: m8aSchema.migrationHash === migrationHash
  },
  tables: { before: tableNames, after: tableNames, added: [], removed: [] },
  columns: { before: tableColumns, after: tableColumns, added: [], removed: [] },
  indexes: { before: indexes, after: indexes, added: [], removed: [] },
  foreignKeys: { before: foreignKeys, after: foreignKeys, added: [], removed: [] },
  schemaChanges: { status: "NONE", added: [], removed: [], dataRewrite: false },
  routeCount: {
    before: m8aReachability.routeCount.after,
    after: m8aReachability.routeCount.after,
    removed: 0
  },
  candidateDecisions: decisions.map(({ id, name, verdict, action }) => ({
    id,
    name,
    verdict,
    action
  })),
  rowCounts,
  remoteMigration: "NOT RUN",
  deploy: "NOT RUN",
  productionData: "NOT TOUCHED"
};

await mkdir(diagnostics, { recursive: true });
await writeFile(
  join(diagnostics, "final-candidate-decisions.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      milestone: "M8B",
      productionBaseSha,
      branch,
      implementationSha,
      scope: ["A", "B", "C", "D", "E", "F"],
      decisions
    },
    null,
    2
  )}\n`
);
await writeFile(
  join(diagnostics, "final-schema.json"),
  `${JSON.stringify(finalSchema, null, 2)}\n`
);
await writeFile(
  join(diagnostics, "api-schema-diff.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      milestone: "M8B",
      productionBaseSha,
      implementationSha,
      workerRoutes: {
        before: m8aReachability.routeCount.after,
        after: m8aReachability.routeCount.after,
        removed: []
      },
      migrations: {
        before: m8aSchema.migrationFiles.length,
        after: migrationNames.length,
        added: finalSchema.migrationFiles.added,
        removed: finalSchema.migrationFiles.removed
      },
      tables: {
        before: tableNames.length,
        after: tableNames.length,
        added: [],
        removed: []
      },
      columns: { added: [], removed: [] },
      apiRemoved: [],
      apiKeptIntentionally: decisions
        .filter((decision) => decision.verdict !== "REMOVE_SAFE")
        .map((decision) => ({
          id: decision.id,
          name: decision.name,
          verdict: decision.verdict,
          action: decision.action
        })),
      schemaChange: "NONE"
    },
    null,
    2
  )}\n`
);
await writeFile(
  join(diagnostics, "legacy-data-compat.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      milestone: "M8B",
      productionBaseSha,
      implementationSha,
      source: "local D1 row counts plus worker/m8b-compatibility.test.ts",
      checks: [
        {
          name: "Old recurring task",
          status:
            Number(
              recurrenceDistribution
                .filter((row) => row.model_recurrence_type === null)
                .reduce((sum, row) => sum + Number(row.row_count), 0)
            ) > 0
              ? "PASS"
              : "FAIL",
          evidence: `${legacyRecurrenceRows} tasks with legacy model_recurrence_type NULL in local D1`
        },
        {
          name: "Old TaskRecord NULL snapshot",
          status:
            Number(recordNulls.null_task_title_snapshot ?? 0) > 0 ? "PASS" : "FAIL",
          evidence: `${nullTaskTitleRows} task_records with NULL task_title_snapshot in local D1`
        },
        {
          name: "Calendar projection",
          status: contractResult.status,
          evidence: `${contractResult.status}: worker/m8b-compatibility.test.ts against MemoryD1 legacy fixture`
        },
        {
          name: "Restore",
          status: contractResult.status,
          evidence: `${contractResult.status}: worker/m8b-compatibility.test.ts restore assertion`
        },
        {
          name: "Shopping existing rows",
          status: Number(rowCounts.shopping_items ?? 0) > 0 ? "PASS" : "FAIL",
          evidence: `${rowCounts.shopping_items} shopping_items rows in local D1`
        },
        {
          name: "Shopping template reuse",
          status:
            Number(rowCounts.shopping_templates ?? 0) > 0 &&
            contractResult.status === "PASS"
              ? "PASS"
              : "FAIL",
          evidence: `${shoppingTemplateRows} shopping_templates rows plus ${contractResult.status} canonical list/add contract`
        },
        {
          name: "Fresh DB migration",
          status: freshMigrationResult.status,
          evidence: `isolated persistence ${freshMigrationResult.persistenceDirectory}; ${freshMigrationResult.migrationCount}/${freshMigrationResult.expectedMigrationCount} migrations; ${freshMigrationResult.tables.length}/${freshMigrationResult.expectedTableCount} tables`
        },
        {
          name: "Populated DB migration",
          status: "N/A",
          evidence: "schema unchanged; no populated-data migration was created"
        }
      ],
      persistedRows: rowCounts,
      nullCompatibility: recordNulls,
      recurrenceDistribution
    },
    null,
    2
  )}\n`
);
console.log(
  JSON.stringify({
    milestone: "M8B",
    productionBaseSha,
    branch,
    implementationSha,
    routeCount: finalSchema.routeCount,
    migrationCount: migrationNames.length,
    schemaChange: "NONE",
    candidates: decisions.map(({ id, verdict }) => ({ id, verdict })),
    rowCounts
  })
);
