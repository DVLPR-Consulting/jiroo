import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { exclusiveJunitPaths } from "./scripts/e2e-junit-report";

process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--conditions=react-server"]
  .filter(Boolean)
  .join(" ");

const generatedRunId = `${new Date().toISOString().replace(/[-:.]/gu, "")}-${randomUUID().slice(0, 8)}`;
const runId = process.env.JIROO_E2E_RUN_ID?.trim() || generatedRunId;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)) {
  throw new Error("JIROO_E2E_RUN_ID contient des caractères non autorisés.");
}
process.env.JIROO_E2E_RUN_ID = runId;

const persistAudit = process.env.JIROO_E2E_PERSIST_AUDIT === "1";
const reportPath = persistAudit
  ? `audit/runs/${runId}-junit.xml`
  : `.playwright/reports/${runId}-junit.xml`;
const junitPaths = exclusiveJunitPaths({ reportPath, runId });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["junit", {
      outputFile: junitPaths.temporaryPath,
      stripANSIControlSequences: true,
    }],
    ["./e2e/exclusive-junit-reporter.ts", junitPaths],
  ],
  globalSetup: "./e2e/global.setup.ts",
  outputDir: `.playwright/test-results/${runId}`,
  use: {
    baseURL: "http://localhost:3100",
    storageState: ".playwright/.auth/platform-admin.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "JIROO_E2E_ISOLATED=1 pnpm --ignore-workspace dev --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
