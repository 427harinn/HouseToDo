import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifacts = join(root, "artifacts");
const m8bArtifacts = join(artifacts, "m8b");
const nodeBin = (path) => join(root, "node_modules", path);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (name, command, executable, args, extraEnv = {}) => {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32" && executable.toLowerCase().endsWith(".cmd"),
    env: { ...process.env, ...extraEnv }
  });
  const outputLines = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const importantLines = outputLines.filter((line) =>
    /passed|failed|skipped|error|no migrations|built in|json report|all matched/i.test(
      line
    )
  );
  const output = (importantLines.length ? importantLines : outputLines)
    .slice(-8)
    .join(" | ");
  return {
    name,
    command,
    exitCode: result.status ?? 1,
    status: result.status === 0 ? "PASS" : "FAIL",
    summary: output || result.error?.message || `exit ${result.status ?? 1}`
  };
};

await mkdir(m8bArtifacts, { recursive: true });
const diagnosticRun = run(
  "diagnostics",
  "node scripts/generate-m8b-diagnostics.mjs",
  process.execPath,
  ["scripts/generate-m8b-diagnostics.mjs"]
);
const results = [diagnosticRun];
results.push(
  run("lint", "npm run lint", npm, ["run", "lint"]),
  run("typecheck", "npm run typecheck", npm, ["run", "typecheck"]),
  run("Vitest", "npm test", process.execPath, [
    nodeBin("vitest/vitest.mjs"),
    "run",
    "--maxWorkers=1",
    "--minWorkers=1",
    "--reporter=json",
    "--outputFile=artifacts/m8b-vitest.json"
  ]),
  run("build", "npm run build", npm, ["run", "build"]),
  run("current local DB migration", "npm run db:migrate:local", process.execPath, [
    nodeBin("wrangler/bin/wrangler.js"),
    "d1",
    "migrations",
    "apply",
    "house-to-do",
    "--local"
  ]),
  run(
    "changed-source format",
    "npx prettier --check <M8B source/docs>",
    process.execPath,
    [
      nodeBin("prettier/bin/prettier.cjs"),
      "--check",
      "scripts/generate-m8b-diagnostics.mjs",
      "scripts/record-m8b-gate.mjs",
      "scripts/run-m8b-gate.mjs",
      "scripts/capture-m8b-motion.mjs",
      "worker/m8b-compatibility.test.ts",
      ".ai/MILESTONE.md",
      ".ai/TASKS.md",
      "docs/PRODUCTION_UI_MIGRATION.md"
    ]
  )
);

const freshMigration = JSON.parse(
  await readFile(
    join(root, "docs/evidence/m8b/diagnostics/fresh-db-migration.json"),
    "utf8"
  )
);
results.push({
  name: "fresh DB migration",
  command: freshMigration.command,
  exitCode: freshMigration.exitCode,
  status: freshMigration.status,
  summary: `${freshMigration.migrationCount}/${freshMigration.expectedMigrationCount} migrations; ${freshMigration.tables.length}/${freshMigration.expectedTableCount} tables; key columns asserted`
});

const playwrightEnv = {
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:5174",
  PLAYWRIGHT_ARTIFACT_DIR: "artifacts/playwright/m8b-gate"
};
results.push(
  run(
    "canonical Chromium",
    "npx playwright test",
    npx,
    ["playwright", "test", "--reporter=line"],
    playwrightEnv
  ),
  run(
    "two-user integration",
    "npx playwright test e2e/m7-real-integration.spec.ts",
    npx,
    ["playwright", "test", "e2e/m7-real-integration.spec.ts", "--reporter=line"],
    { ...playwrightEnv, PLAYWRIGHT_ARTIFACT_DIR: "artifacts/playwright/m8b-two-user" }
  )
);

const vitest = JSON.parse(
  await readFile(join(root, "artifacts/m8b-vitest.json"), "utf8")
);
const testResults = vitest.testResults ?? [];
const matching = (patterns) =>
  testResults.filter((result) =>
    patterns.some((pattern) => result.name.toLowerCase().includes(pattern))
  );
const allAssertionsPassed = (files) =>
  files.length > 0 &&
  files.every((file) =>
    (file.assertionResults ?? []).every((test) => test.status === "passed")
  );
for (const [name, patterns] of [
  ["scheduler", ["notification-scheduler", "scheduler"]],
  ["notification", ["notification"]],
  ["image safety", ["image", "r2"]]
]) {
  const files = matching(patterns);
  results.push({
    name,
    command: "npm test (Vitest JSON assertion subset)",
    exitCode: allAssertionsPassed(files) ? 0 : 1,
    status: allAssertionsPassed(files) ? "PASS" : "FAIL",
    summary: `${files.length} matching Vitest file(s); all assertions passed=${allAssertionsPassed(files)}`
  });
}

const schema = JSON.parse(
  await readFile(join(root, "docs/evidence/m8b/diagnostics/final-schema.json"), "utf8")
);
const schemaDiffsEmpty =
  schema.migrationFiles.added.length === 0 &&
  schema.migrationFiles.removed.length === 0 &&
  schema.migrationHashes.changed.length === 0 &&
  schema.tables.added.length === 0 &&
  schema.tables.removed.length === 0 &&
  schema.columns.added.length === 0 &&
  schema.columns.removed.length === 0 &&
  schema.indexes.added.length === 0 &&
  schema.indexes.removed.length === 0 &&
  schema.foreignKeys.added.length === 0 &&
  schema.foreignKeys.removed.length === 0;
results.push({
  name: "schema integrity",
  command: "final-schema.json diff assertion",
  exitCode: schemaDiffsEmpty ? 0 : 1,
  status: schemaDiffsEmpty ? "PASS" : "FAIL",
  summary: `migration/table/column/index/FK diffs empty=${schemaDiffsEmpty}`
});

const commandResults = { results };
await writeFile(
  join(artifacts, "m8b-gate-command-results.json"),
  `${JSON.stringify(commandResults, null, 2)}\n`
);
await writeFile(
  join(root, "docs/evidence/m8b/diagnostics/gate-command-results.json"),
  `${JSON.stringify(commandResults, null, 2)}\n`
);
console.log(JSON.stringify({ results }));
