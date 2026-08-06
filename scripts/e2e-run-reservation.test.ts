import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { reserveE2eRunId } from "./e2e-run-reservation";

const execFileAsync = promisify(execFile);
const runId = `reservation-${randomUUID()}`;
const lockPath = `.playwright/run-locks/${runId}.lock`;
const reportPath = `.playwright/reports/${runId}-junit.xml`;

async function loadPlaywrightConfig() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JIROO_E2E_RUN_ID: runId,
    JIROO_E2E_PERSIST_AUDIT: "0",
    NODE_OPTIONS: "--conditions=react-server",
  };
  delete env.JIROO_E2E_RUN_OWNER_TOKEN;
  try {
    const result = await execFileAsync(
      "pnpm",
      ["--ignore-workspace", "exec", "playwright", "test", "--list"],
      {
        cwd: process.cwd(),
        env,
      },
    );
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: failure.code ?? -1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

afterEach(async () => {
  await rm(lockPath, { force: true });
  await rm(reportPath, { force: true });
});

describe("réservation atomique des preuves Playwright", () => {
  it("laisse un seul de deux processus gagner un même run-id", async () => {
    const results = await Promise.all([loadPlaywrightConfig(), loadPlaywrightConfig()]);

    expect(results.map((result) => result.exitCode).sort()).toEqual([0, 1]);
    expect(results.find((result) => result.exitCode === 1)?.output).toContain(
      `Le run-id Playwright ${runId} est déjà réservé`,
    );
  });

  it("autorise les rechargements de configuration du processus propriétaire", async () => {
    const reentrantRunId = `reentrant-${randomUUID()}`;
    const reentrantLockRoot = ".playwright/reentrant-run-locks";
    const reentrantLockPath = `${reentrantLockRoot}/${reentrantRunId}.lock`;
    const ownerToken = randomUUID();

    try {
      expect(reserveE2eRunId(reentrantRunId, ownerToken, reentrantLockRoot)).toBe(reentrantLockPath);
      expect(() => reserveE2eRunId(reentrantRunId, ownerToken, reentrantLockRoot)).not.toThrow();
    } finally {
      await rm(reentrantLockPath, { force: true });
    }
  });
});
