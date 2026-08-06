import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function reserveE2eRunId(
  runId: string,
  ownerToken: string,
  lockRoot = ".playwright/run-locks",
): string {
  mkdirSync(lockRoot, { recursive: true });
  const lockPath = join(lockRoot, `${runId}.lock`);

  let descriptor: number;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      try {
        const existing = JSON.parse(readFileSync(lockPath, "utf8")) as { ownerToken?: string };
        if (existing.ownerToken === ownerToken) return lockPath;
      } catch {
        // A concurrent writer or malformed lock is treated as owned by another run.
      }
      throw new Error(`Le run-id Playwright ${runId} est déjà réservé ; choisissez un run-id unique.`);
    }
    throw error;
  }

  try {
    writeFileSync(descriptor, `${JSON.stringify({
      ownerToken,
      pid: process.pid,
      reservedAt: new Date().toISOString(),
    })}\n`);
  } finally {
    closeSync(descriptor);
  }

  return lockPath;
}
