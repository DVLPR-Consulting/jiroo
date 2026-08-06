import { setTimeout as delay } from "node:timers/promises";
import { reserveE2eRunId } from "../../scripts/e2e-run-reservation";

export default async function globalSetup() {
  const runId = process.env.JIROO_E2E_RUN_ID;
  const lockRoot = process.env.JIROO_E2E_RUN_LOCK_ROOT;
  if (!runId || !lockRoot) throw new Error("Race fixture configuration missing.");

  const delayMs = Number(process.env.JIROO_E2E_RACE_DELAY_MS ?? "0");
  if (delayMs > 0) await delay(delayMs);
  reserveE2eRunId(runId, lockRoot);
}
