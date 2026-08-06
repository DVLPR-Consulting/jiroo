import { defineConfig } from "@playwright/test";
import { exclusiveJunitPaths } from "../../scripts/e2e-junit-report";

const reportPath = process.env.JIROO_E2E_JUNIT_PATH;
const artifactRoot = process.env.JIROO_E2E_RACE_ARTIFACT_ROOT;
const instance = process.env.JIROO_E2E_RACE_INSTANCE;
if (!reportPath || !artifactRoot || !instance) {
  throw new Error("Race fixture configuration missing.");
}
const runId = process.env.JIROO_E2E_RUN_ID;
const lockRoot = process.env.JIROO_E2E_RUN_LOCK_ROOT;
if (!runId || !lockRoot) throw new Error("Race reservation configuration missing.");
const junitPaths = exclusiveJunitPaths({ reportPath, runId, lockRoot });

export default defineConfig({
  testDir: ".",
  testMatch: "proof.spec.ts",
  workers: 1,
  retries: 0,
  globalSetup: "./global.setup.ts",
  outputDir: `${artifactRoot}/results-${instance}`,
  reporter: [
    ["junit", { outputFile: junitPaths.temporaryPath }],
    ["../../e2e/exclusive-junit-reporter.ts", junitPaths],
  ],
});
