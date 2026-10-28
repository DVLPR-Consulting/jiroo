import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { MATRIX_PROJECTS } from "../e2e/matrix";
import { inventoryE2eRun } from "./e2e-run-inventory";

export type MatrixRun = {
  project: string;
  runId: string;
  command: readonly ["corepack", "pnpm", "exec", "playwright", "test", string];
  env: Record<"JIROO_E2E_RUN_ID" | "JIROO_E2E_COMMAND_LABEL" | "JIROO_E2E_SCENARIOS", string>;
};
export type MatrixResult = {
  project: string;
  runId: string;
  result: "PASS" | "FAIL";
  exitCode: number;
  inventory: "ok" | "failed";
  durationMs: number;
};

/** Pure planning: no process environment, clock reads, subprocesses or filesystem. */
export function planMatrixRuns(selection: readonly string[], startedAt: Date): MatrixRun[] {
  const projects = selection.length ? [...selection] : MATRIX_PROJECTS.map(({ name }) => name);
  const known = new Set(MATRIX_PROJECTS.map(({ name }) => name));
  if (projects.some((project) => !known.has(project))) throw new Error("Unknown matrix project.");
  if (new Set(projects).size !== projects.length) throw new Error("Repeated matrix project.");
  const timestamp = startedAt.toISOString();
  const day = timestamp.slice(0, 10).replaceAll("-", "");
  const time = timestamp.slice(11, 19).replaceAll(":", "");
  return projects.map((project) => {
    const runId = `matrix-${project.slice("matrix-".length)}-${day}-${time}`;
    const command: MatrixRun["command"] = ["corepack", "pnpm", "exec", "playwright", "test", `--project=${project}`];
    return {
      project, runId, command,
      env: {
        JIROO_E2E_RUN_ID: runId,
        JIROO_E2E_COMMAND_LABEL: command.join(" "),
        JIROO_E2E_SCENARIOS: `matrice ${project}`,
      },
    };
  });
}

export async function executeMatrix(plan: readonly MatrixRun[], io: {
  run: (step: MatrixRun) => Promise<number>;
  inventory: (runId: string) => Promise<unknown>;
  now: () => number;
}): Promise<MatrixResult[]> {
  const results: MatrixResult[] = [];
  for (const step of plan) {
    const start = io.now();
    let exitCode = 1;
    let inventory: MatrixResult["inventory"] = "ok";
    try {
      exitCode = await io.run(step);
    } catch {
      // Spawn failures still require an inventory attempt and must not stop the matrix.
    }
    try {
      await io.inventory(step.runId);
    } catch {
      // Never log exception payloads: they can include operator-supplied values.
      inventory = "failed";
    }
    results.push({
      project: step.project, runId: step.runId, exitCode, inventory,
      result: exitCode === 0 && inventory === "ok" ? "PASS" : "FAIL",
      durationMs: io.now() - start,
    });
  }
  return results;
}

function runPlaywright(step: MatrixRun): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(step.command[0], step.command.slice(1), {
      env: { ...process.env, ...step.env },
      stdio: "inherit",
    });
    child.once("error", () => resolve(1));
    // Wait for process closure, including reporters, before inventorying its files.
    child.once("close", (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void (async () => {
    const plan = planMatrixRuns(process.argv.slice(2), new Date());
    const results = await executeMatrix(plan, {
      run: runPlaywright,
      inventory: (runId) => inventoryE2eRun(runId),
      now: () => performance.now(),
    });
    console.table(results.map((row) => ({
      Project: row.project,
      "Run ID": row.runId,
      Result: row.result === "PASS" ? "PASS" : `FAIL (exit ${row.exitCode}, inventory ${row.inventory})`,
      Duration: `${(row.durationMs / 1000).toFixed(1)}s`,
    })));
    if (results.some((row) => row.result === "FAIL")) process.exitCode = 1;
  })().catch(() => {
    console.error("Matrix planning failed. Supply distinct matrix project names only.");
    process.exitCode = 1;
  });
}
