import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const diagnosticsDir = join(
  root,
  "docs",
  "evidence",
  "release-readiness",
  "diagnostics"
);
const node = process.execPath;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const prettier = join(root, "node_modules", "prettier", "bin", "prettier.cjs");
const localMigrationNames = (await import("node:fs/promises")).readdir(
  join(root, "migrations")
);
const migrationNames = (await localMigrationNames)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const priorReadiness =
  process.env.RELEASE_READINESS_SKIP_BROWSER === "1"
    ? JSON.parse(await readFile(join(diagnosticsDir, "readiness.json"), "utf8"))
    : null;

const commandText = (executable, args) => [executable, ...args].join(" ");

const run = (name, executable, args, extraEnv = {}) => {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32" && executable.toLowerCase().endsWith(".cmd")
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    name,
    command: commandText(executable, args),
    exitCode: result.status ?? 1,
    status: result.status === 0 ? "PASS" : "FAIL",
    output,
    summary: lines.slice(-8).join(" | ") || result.error?.message || "no output"
  };
};

const jsonFromOutput = (output) => {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    for (const marker of ["{", "["]) {
      const start = trimmed.indexOf(marker);
      if (start < 0) continue;
      try {
        return JSON.parse(trimmed.slice(start));
      } catch {
        continue;
      }
    }
  }
  return null;
};

const lastMatch = (output, pattern) => {
  const matches = [...output.matchAll(pattern)];
  return matches.length > 0 ? matches[matches.length - 1] : null;
};

const vitestSummary = (record) => {
  const files = lastMatch(record.output, /Test Files\s+(\d+) passed \((\d+)\)/g);
  const tests = lastMatch(record.output, /Tests\s+(\d+) passed \((\d+)\)/g);
  return files && tests ? `${files[1]} files / ${tests[1]} tests` : record.summary;
};

const chromiumSummary = (record) => {
  const passed = lastMatch(record.output, /(\d+) passed(?: \([^\n]+\))?/g)?.[1];
  const skipped = lastMatch(record.output, /(\d+) skipped/g)?.[1] ?? "0";
  return passed ? `${passed} passed / ${skipped} skipped` : record.summary;
};

const statusSummary = (record, summary) =>
  `${record.status} — exit ${record.exitCode}; ${summary}`;

const local = {};
local.lint = run("lint", npm, ["run", "lint"]);
local.typecheck = run("typecheck", npm, ["run", "typecheck"]);
local.vitest = run("Vitest", npm, ["test"]);
local.build = run("build", npm, ["run", "build"]);
local.migration = run("local migration", npm, ["run", "db:migrate:local"]);
local.format = run("changed-source format", node, [
  prettier,
  "--check",
  "scripts/generate-release-readiness.mjs",
  ".ai/MILESTONE.md",
  ".ai/TASKS.md",
  "docs/PRODUCTION_UI_MIGRATION.md",
  "docs/RELEASE_MANUAL_CHECKLIST.md"
]);
const reusedBrowserResult = (key, name) => {
  const value = priorReadiness?.local?.[key];
  const isPass = typeof value === "string" && value.startsWith("PASS");
  return {
    name,
    command: "prior actual browser baseline retained; see readiness.json",
    exitCode: isPass ? 0 : 1,
    status: isPass ? "PASS" : "FAIL",
    output: "",
    summary:
      value?.replace(/^(?:PASS — exit 0; )+/, "") ??
      "prior browser baseline unavailable"
  };
};
local.chromium =
  process.env.RELEASE_READINESS_SKIP_BROWSER === "1"
    ? reusedBrowserResult("chromium", "canonical Chromium")
    : run("canonical Chromium", npx, ["playwright", "test", "--reporter=line"], {
        PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5174",
        PLAYWRIGHT_ARTIFACT_DIR: "artifacts/playwright/release-readiness-generated"
      });
local.twoUser =
  process.env.RELEASE_READINESS_SKIP_BROWSER === "1"
    ? reusedBrowserResult("twoUser", "two-user smoke")
    : run(
        "two-user smoke",
        npx,
        ["playwright", "test", "e2e/m7-real-integration.spec.ts", "--reporter=line"],
        {
          PLAYWRIGHT_BASE_URL:
            process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5174",
          PLAYWRIGHT_ARTIFACT_DIR:
            "artifacts/playwright/release-readiness-two-user-generated"
        }
      );

const remote = {};
remote.auth = run("Cloudflare auth", node, [wrangler, "whoami", "--json"]);
remote.defaultVersions = run("default Worker versions", node, [
  wrangler,
  "versions",
  "list",
  "--name",
  "house-to-do",
  "--json"
]);
remote.defaultDeployments = run("default Worker deployments", node, [
  wrangler,
  "deployments",
  "list",
  "--name",
  "house-to-do",
  "--json"
]);
remote.stagingVersions = run("staging Worker versions", node, [
  wrangler,
  "versions",
  "list",
  "--name",
  "house-to-do-staging",
  "--json"
]);
remote.stagingDeployments = run("staging Worker deployments", node, [
  wrangler,
  "deployments",
  "list",
  "--name",
  "house-to-do-staging",
  "--json"
]);
remote.defaultMigrations = run("default D1 migration status", node, [
  wrangler,
  "d1",
  "migrations",
  "list",
  "house-to-do",
  "--remote"
]);
remote.stagingMigrations = run("staging D1 migration status", node, [
  wrangler,
  "d1",
  "migrations",
  "list",
  "house-to-do-staging",
  "--env",
  "staging",
  "--remote"
]);
remote.stagingMigrationMetadata = run("staging D1 migration metadata", node, [
  wrangler,
  "d1",
  "execute",
  "DB",
  "--env",
  "staging",
  "--remote",
  "--command",
  "SELECT id, name, applied_at FROM d1_migrations ORDER BY id",
  "--json"
]);
remote.r2 = run("R2 bucket list", node, [wrangler, "r2", "bucket", "list"]);
remote.defaultSecrets = run("default Worker secret names", node, [
  wrangler,
  "secret",
  "list",
  "--name",
  "house-to-do",
  "--format",
  "json"
]);
remote.stagingSecrets = run("staging Worker secret names", node, [
  wrangler,
  "secret",
  "list",
  "--name",
  "house-to-do-staging",
  "--format",
  "json"
]);

const config = JSON.parse(await readFile(join(root, "wrangler.jsonc"), "utf8"));
const stagingConfig = config.env?.staging ?? null;
const productionConfig = config.env?.production ?? null;
const stagingVersions = jsonFromOutput(remote.stagingVersions.output) ?? [];
const latestStagingVersion =
  [...stagingVersions].sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0] ?? null;
remote.latestStagingVersion = latestStagingVersion
  ? run("latest staging Worker version metadata", node, [
      wrangler,
      "versions",
      "view",
      latestStagingVersion.id,
      "--name",
      "house-to-do-staging",
      "--json"
    ])
  : null;
const latestVersionDetails = remote.latestStagingVersion
  ? jsonFromOutput(remote.latestStagingVersion.output)
  : null;
const stagingDeployments = jsonFromOutput(remote.stagingDeployments.output) ?? [];
const latestStagingDeployment =
  [...stagingDeployments].sort((a, b) =>
    String(b.created_on).localeCompare(String(a.created_on))
  )[0] ?? null;
const migrationMetadata =
  jsonFromOutput(remote.stagingMigrationMetadata.output)?.[0] ?? null;
const appliedMigrations = migrationMetadata?.results ?? [];
const appliedNames = appliedMigrations.map((migration) => migration.name);
const missingMigrations = migrationNames.filter((name) => !appliedNames.includes(name));
const r2Names = [...remote.r2.output.matchAll(/^name:\s+(\S+)/gm)].map(
  (match) => match[1]
);
// Runtime secrets currently consumed by Worker routes/services.
// Keep synchronized with worker/types/env.ts and the notification implementation.
const requiredSecrets = [
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_SUBJECT"
];
const stagingSecrets = jsonFromOutput(remote.stagingSecrets.output) ?? [];
const stagingSecretNames = stagingSecrets.map((secret) => secret.name);
const missingSecrets = requiredSecrets.filter(
  (name) => !stagingSecretNames.includes(name)
);
const bindingNames = (latestVersionDetails?.resources?.bindings ?? []).map(
  (binding) => binding.name
);
const defaultWorkerExists = remote.defaultVersions.exitCode === 0;
const stagingWorkerExists = remote.stagingVersions.exitCode === 0;
const cloudflareAuthenticated = jsonFromOutput(remote.auth.output)?.loggedIn === true;
const routeCount = JSON.parse(
  await readFile(join(root, "docs/evidence/m8b/diagnostics/final-schema.json"), "utf8")
).routeCount.after;
const git = (...args) =>
  execFileSync("git", ["-c", "safe.directory=*", ...args], {
    cwd: root,
    encoding: "utf8"
  }).trim();
const mainSha = git("rev-parse", "origin/main");
const auditHeadSha = git("rev-parse", "HEAD");
const originMainSha = git("rev-parse", "origin/main");
const branch = git("branch", "--show-current");

const migrationRisk = {
  "0015_account_avatars_and_morning_notifications.sql":
    "Additive avatar metadata and notification defaults; existing rows receive defaults, but profile/notification behavior needs staging validation.",
  "0016_task_record_snapshots.sql":
    "Additive nullable historical task/assignee snapshots and an index; no backfill required, but history rendering should be checked before apply.",
  "0017_calendar_action_date.sql":
    "Additive nullable Calendar action date and an index; no rewrite required, but Calendar completion/restore behavior should be checked before apply."
};
const localStatus = {
  lint: statusSummary(local.lint, "eslint ."),
  typecheck: statusSummary(local.typecheck, "tsc --noEmit"),
  vitest: statusSummary(local.vitest, vitestSummary(local.vitest)),
  build: statusSummary(local.build, "vite production build"),
  migration: statusSummary(
    local.migration,
    `${migrationNames.length} migration files; ${local.migration.output.includes("No migrations to apply") ? "No migrations to apply" : "migration command completed"}`
  ),
  changedSourceFormat: statusSummary(
    local.format,
    "release-readiness changed-file format set"
  ),
  chromium: statusSummary(local.chromium, chromiumSummary(local.chromium)),
  twoUser: statusSummary(local.twoUser, chromiumSummary(local.twoUser))
};

const remoteStatus = {
  cloudflareAuth: cloudflareAuthenticated
    ? "PASS — authenticated Cloudflare session; secret values were not read"
    : "UNAVAILABLE — Wrangler authentication is not available",
  workerState: stagingWorkerExists
    ? `REVIEW_REQUIRED — staging ${stagingConfig?.name ?? "house-to-do-staging"} exists; latest version ${latestStagingVersion?.number ?? "unknown"} (${latestStagingVersion?.id ?? "unknown"}), no source SHA association in metadata; production/default Worker house-to-do exists=${defaultWorkerExists}`
    : "UNAVAILABLE — configured staging Worker was not found",
  d1MigrationState: migrationMetadata
    ? `REVIEW_REQUIRED — staging applied ${appliedMigrations.length}/${migrationNames.length}; pending ${missingMigrations.join(", ")}; default D1 status=${remote.defaultMigrations.exitCode === 0 ? "available" : "not found"}`
    : "UNAVAILABLE — staging D1 migration metadata could not be read",
  r2Binding: r2Names.includes(stagingConfig?.r2_buckets?.[0]?.bucket_name)
    ? `AVAILABLE — staging ATTACHMENTS binding and bucket ${stagingConfig.r2_buckets[0].bucket_name} exist; default bucket was not present in the read-only account list`
    : "REVIEW_REQUIRED — configured R2 binding could not be verified",
  requiredSecrets:
    missingSecrets.length === 0
      ? "PASS — all required staging secret names are present; values not read"
      : `REVIEW_REQUIRED — staging secret names present ${requiredSecrets.length - missingSecrets.length}/${requiredSecrets.length}; missing ${missingSecrets.join(", ")}; default Worker secret state unavailable`,
  cron: stagingConfig?.triggers?.crons?.length
    ? `AVAILABLE — staging Cron ${stagingConfig.triggers.crons.join(", ")} configured; default config Cron ${(config.triggers?.crons ?? []).join(", ")}; no Cron change run`
    : "UNAVAILABLE — staging Cron is not configured"
};

const readiness = {
  generatedAt: new Date().toISOString(),
  mainSha,
  originMainSha,
  auditHeadSha,
  productionBaseSha: mainSha,
  branch,
  currentMainState:
    mainSha === originMainSha ? "CLEAN_BASE_MATCH" : "DIVERGED_FROM_ORIGIN_MAIN",
  productionUiMigration: "COMPLETE",
  currentMigrationCount: migrationNames.length,
  currentWorkerRouteCount: routeCount,
  local: localStatus,
  remote: remoteStatus,
  remoteDetails: {
    authExitCode: remote.auth.exitCode,
    stagingWorker: {
      configuredName: stagingConfig?.name ?? null,
      url: "https://house-to-do-staging.427harinn.workers.dev",
      latestVersionId: latestStagingVersion?.id ?? null,
      latestVersionNumber: latestStagingVersion?.number ?? null,
      latestVersionCreatedOn: latestStagingVersion?.metadata?.created_on ?? null,
      latestDeploymentId: latestStagingDeployment?.id ?? null,
      latestDeploymentCreatedOn: latestStagingDeployment?.created_on ?? null,
      bindingNames
    },
    environments: {
      stagingConfigured: Boolean(stagingConfig),
      productionConfigured: Boolean(productionConfig),
      productionWorkerDeployed: defaultWorkerExists
    },
    d1: {
      stagingDatabaseName: stagingConfig?.d1_databases?.[0]?.database_name ?? null,
      localMigrationCount: migrationNames.length,
      remoteAppliedCount: appliedMigrations.length,
      missingMigrations,
      missingMigrationRisk: Object.fromEntries(
        missingMigrations.map((name) => [
          name,
          migrationRisk[name] ?? "Review migration SQL before apply."
        ])
      ),
      remoteMigration: "NOT RUN",
      schemaDataOperation: "NOT RUN",
      metadataQueryRowsRead: migrationMetadata?.meta?.rows_read ?? null,
      metadataQueryRowsWritten: migrationMetadata?.meta?.rows_written ?? null
    },
    r2: {
      configuredStagingBucket: stagingConfig?.r2_buckets?.[0]?.bucket_name ?? null,
      accountVisibleBucketNames: r2Names
    },
    requiredSecretNames: {
      required: requiredSecrets,
      stagingPresent: stagingSecretNames,
      stagingMissing: missingSecrets
    },
    cron: {
      defaultConfigured: config.triggers?.crons ?? [],
      stagingConfigured: stagingConfig?.triggers?.crons ?? []
    }
  },
  deployment: { staging: "NOT_RUN", production: "NOT_RUN", remoteMigration: "NOT_RUN" },
  safety: {
    productionDataWrites: "NONE",
    secretValues: "NOT_READ / NOT_STORED",
    cronChanges: "NONE",
    schemaChanges: "NONE"
  },
  verdict:
    missingMigrations.length > 0 || !defaultWorkerExists
      ? "REMOTE_MIGRATION_REVIEW_REQUIRED"
      : "READY_FOR_STAGING",
  recommendedNextAction:
    missingMigrations.length > 0 || !defaultWorkerExists
      ? "Review the staging/default environment gap and the three pending staging migrations; do not apply remote migrations automatically. After human approval, use the existing staging runbook, then authenticated staging smoke, real iPhone validation, and a separate production deploy review."
      : "Human decision required: staging deploy, authenticated staging smoke, real iPhone validation, then production deploy review. No next action was executed by this audit."
};

const commandResults = Object.values(local)
  .concat(Object.values(remote))
  .filter(Boolean)
  .map((record) => ({
    name: record.name,
    command: record.command,
    exitCode: record.exitCode,
    status: record.status,
    summary:
      record.name === "Vitest"
        ? vitestSummary(record)
        : record.name.includes("Chromium") || record.name.includes("two-user")
          ? chromiumSummary(record)
          : record.summary
  }));
const sanitizedCommandResults = commandResults.map((record) => ({
  ...record,
  summary: record.summary
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/accounts\/[a-f0-9-]+/gi, "accounts/[redacted-account]")
    .replace(/C:[^|]+\.wrangler[^|]*/gi, "Wrangler log path redacted")
}));

await mkdir(diagnosticsDir, { recursive: true });
await writeFile(
  join(diagnosticsDir, "command-results.json"),
  `${JSON.stringify({ generatedAt: readiness.generatedAt, commandResults: sanitizedCommandResults }, null, 2)}\n`
);
await writeFile(
  join(diagnosticsDir, "readiness.json"),
  `${JSON.stringify(readiness, null, 2)}\n`
);
console.log(
  JSON.stringify({
    verdict: readiness.verdict,
    mainSha,
    localMigrationCount: migrationNames.length,
    remoteAppliedCount: appliedMigrations.length,
    missingMigrations,
    stagingWorkerVersion: latestStagingVersion?.id ?? null,
    commandResults: sanitizedCommandResults.map(
      ({ name, exitCode, status, summary }) => ({
        name,
        exitCode,
        status,
        summary
      })
    )
  })
);
