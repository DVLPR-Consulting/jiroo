import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function reserveE2eRunId(
  runId: string,
  lockRoot = ".playwright/run-locks",
): string {
  mkdirSync(lockRoot, { recursive: true });
  const lockPath = join(lockRoot, `${runId}.lock`);

  let descriptor: number;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Le run-id Playwright ${runId} est déjà réservé ; choisissez un run-id unique.`);
    }
    throw error;
  }

  try {
    writeFileSync(descriptor, `${JSON.stringify({
      pid: process.pid,
      reservedAt: new Date().toISOString(),
    })}\n`);
  } finally {
    closeSync(descriptor);
  }

  return lockPath;
}
