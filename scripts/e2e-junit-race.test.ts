import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const fixtureConfig = "test-utils/e2e-junit-race/playwright.config.ts";
const testRoot = resolve(`.playwright/junit-race-tests/${randomUUID()}`);
const runId = `junit-race-${randomUUID()}`;
const reportPath = `${testRoot}/owner-junit.xml`;
const lockRoot = `${testRoot}/locks`;

async function runPlaywright(instance: string, delayMs: number) {
  try {
    const result = await execFileAsync(
      "pnpm",
      ["--ignore-workspace", "exec", "playwright", "test", `--config=${fixtureConfig}`],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          JIROO_E2E_JUNIT_PATH: reportPath,
          JIROO_E2E_RACE_ARTIFACT_ROOT: testRoot,
          JIROO_E2E_RACE_DELAY_MS: String(delayMs),
          JIROO_E2E_RACE_INSTANCE: instance,
          JIROO_E2E_RUN_ID: runId,
          JIROO_E2E_RUN_LOCK_ROOT: lockRoot,
        },
      },
    );
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as {
      code?: number;
      message?: string;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: failure.code ?? -1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}${failure.message ?? ""}`,
    };
  }
}

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("publication exclusive du rapport JUnit Playwright", () => {
  it("empêche un processus perdant d’écraser la preuve du propriétaire", async () => {
    const [owner, delayedLoser] = await Promise.all([
      runPlaywright("owner", 0),
      runPlaywright("delayed-loser", 2_000),
    ]);

    expect([owner.exitCode, delayedLoser.exitCode].sort()).toEqual([0, 1]);
    expect(delayedLoser.exitCode).toBe(1);

    const junit = await readFile(reportPath, "utf8");
    expect(junit).toMatch(/tests="1"/u);
    expect(junit).toMatch(/failures="0"/u);
    expect(junit).toContain("reservation owner proof");
  }, 15_000);
});
