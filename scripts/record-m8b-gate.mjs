import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const diagnostics = join(root, "docs/evidence/m8b/diagnostics");
const git = (...args) =>
  execFileSync("git", ["-c", "safe.directory=*", ...args], {
    cwd: root,
    encoding: "utf8"
  }).trim();
const readJson = async (relativePath) =>
  JSON.parse(await readFile(join(root, relativePath), "utf8"));

const commandArtifact = await readJson("artifacts/m8b-gate-command-results.json");
const candidateArtifact = await readJson(
  "docs/evidence/m8b/diagnostics/final-candidate-decisions.json"
);
const schema = await readJson("docs/evidence/m8b/diagnostics/final-schema.json");
const required = [
  "lint",
  "typecheck",
  "Vitest",
  "build",
  "fresh DB migration",
  "current local DB migration",
  "changed-source format",
  "canonical Chromium",
  "two-user integration",
  "scheduler",
  "notification",
  "image safety",
  "schema integrity"
];
const resultsByName = new Map(
  commandArtifact.results.map((result) => [result.name, result])
);
const missing = required.filter((name) => !resultsByName.has(name));
const checks = required.map((name) => {
  const result = resultsByName.get(name);
  return result
    ? {
        name,
        status: result.status,
        evidence: `${result.command}; exitCode=${result.exitCode}; ${result.summary}`
      }
    : { name, status: "FAIL", evidence: "required gate artifact is missing" };
});
const hasUnknown = candidateArtifact.decisions.some(
  (decision) => decision.verdict === "KEEP_UNKNOWN"
);
const complete =
  missing.length === 0 &&
  !hasUnknown &&
  checks.every((check) => check.status === "PASS") &&
  schema.schemaChanges.status === "NONE";
const finalGate = {
  generatedAt: new Date().toISOString(),
  productionBaseSha: git("rev-parse", "origin/main"),
  implementationSha: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current"),
  checks,
  missingRequiredChecks: missing,
  candidateUnknown: hasUnknown,
  completion: complete ? "COMPLETE" : "BLOCKED",
  deployment: "NOT RUN",
  remoteMigration: "NOT RUN",
  realProductionData: "NOT TOUCHED",
  schemaChange: schema.schemaChanges
};

await writeFile(
  join(diagnostics, "final-gate.json"),
  `${JSON.stringify(finalGate, null, 2)}\n`
);
console.log(JSON.stringify(finalGate));
