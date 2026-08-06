import { link, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export type ExclusiveJunitPaths = {
  finalPath: string;
  lockPath: string;
  temporaryPath: string;
};

export function exclusiveJunitPaths(input: {
  reportPath: string;
  runId: string;
  lockRoot?: string;
  ownerPid?: number;
}): ExclusiveJunitPaths {
  const finalPath = resolve(input.reportPath);
  const ownerPid = input.ownerPid ?? process.pid;
  const lockRoot = resolve(
    input.lockRoot
      ?? process.env.JIROO_E2E_RUN_LOCK_ROOT?.trim()
      ?? ".playwright/run-locks",
  );
  return {
    finalPath,
    lockPath: join(lockRoot, `${input.runId}.lock`),
    temporaryPath: join(
      dirname(finalPath),
      `.${basename(finalPath)}.${ownerPid}.tmp`,
    ),
  };
}

export async function publishExclusiveJunitReport(
  paths: ExclusiveJunitPaths,
  ownerPid = process.pid,
): Promise<boolean> {
  let reservation: { pid?: unknown };
  try {
    reservation = JSON.parse(await readFile(paths.lockPath, "utf8")) as { pid?: unknown };
  } catch (error) {
    await rm(paths.temporaryPath, { force: true });
    throw new Error("La réservation Playwright est absente ou illisible.", {
      cause: error,
    });
  }

  if (reservation.pid !== ownerPid) {
    await rm(paths.temporaryPath, { force: true });
    return false;
  }

  try {
    await link(paths.temporaryPath, paths.finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `La preuve Playwright ${paths.finalPath} existe déjà ; choisissez un run-id unique.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    await rm(paths.temporaryPath, { force: true });
  }
  return true;
}
