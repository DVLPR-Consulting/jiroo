import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const runId = `reservation-${randomUUID()}`;
const lockRoot = `.playwright/run-lock-tests/${randomUUID()}`;
const lockPath = `${lockRoot}/${runId}.lock`;
const legacyLockPath = `.playwright/run-locks/${runId}.lock`;

async function reserveFromAnotherProcess() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JIROO_E2E_RUN_ID: runId,
    JIROO_E2E_RUN_LOCK_ROOT: lockRoot,
    JIROO_E2E_RUN_OWNER_TOKEN: "shared-token-must-not-grant-reentrance",
  };
  const source = [
    'import { reserveE2eRunId } from "./scripts/e2e-run-reservation.ts";',
    "reserveE2eRunId(process.env.JIROO_E2E_RUN_ID!, process.env.JIROO_E2E_RUN_LOCK_ROOT!);",
  ].join("");

  try {
    const result = await execFileAsync(
      "pnpm",
      ["--ignore-workspace", "exec", "tsx", "-e", source],
      { cwd: process.cwd(), env },
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
  await rm(legacyLockPath, { force: true });
  await rm(lockRoot, { recursive: true, force: true });
});

describe("réservation atomique des preuves Playwright", () => {
  it("laisse un seul de deux processus gagner malgré le même jeton d’environnement", async () => {
    const first = await reserveFromAnotherProcess();
    const second = await reserveFromAnotherProcess();
    const results = [first, second];

    expect(results.map((result) => result.exitCode).sort()).toEqual([0, 1]);
    expect(results.find((result) => result.exitCode === 1)?.output).toContain(
      `Le run-id Playwright ${runId} est déjà réservé`,
    );
    expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(lockPath, "utf8")).not.toContain(
      "shared-token-must-not-grant-reentrance",
    );
  });
});
