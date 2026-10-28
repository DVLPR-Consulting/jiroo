// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, matchesGlob } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MATRIX_PROJECTS } from "../e2e/matrix";
import { executeMatrix, planMatrixRuns } from "./e2e-matrix";
import { inventoryE2eRun } from "./e2e-run-inventory";

const START = new Date("2026-10-28T22:30:00.000Z");
const NAMES = ["matrix-chromium", "matrix-firefox", "matrix-webkit", "matrix-chromium-1024", "matrix-chromium-768", "matrix-webkit-768"];
const EXPECTED_WIDTH_SPECS = [
  "backlog-ranking.spec.ts", "backlog-redesign.spec.ts", "board-added-column.spec.ts", "board-empty-columns.spec.ts",
  "create-everywhere.spec.ts", "create-under-version-filter.spec.ts", "help-guide.spec.ts", "item-detail-drawer.spec.ts",
  "item-templates.spec.ts", "keyboard-shortcuts.spec.ts", "list-rows.spec.ts", "loading-skeletons.spec.ts",
  "markdown-editor.spec.ts", "mobile-shell.spec.ts", "new-item-missing-parent.spec.ts", "new-item-required-parent.spec.ts",
  "overlay-animations.spec.ts", "realtime.spec.ts", "shell-redesign.spec.ts", "sprint-filter.spec.ts", "ticket-drawer.spec.ts",
];
let temporaryDirectory: string | undefined;
afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("browser and width matrix", () => {
  it("defines the six requested engines and viewports", () => {
    expect(MATRIX_PROJECTS.map(({ name, device, viewport }) => ({ name, device, viewport }))).toEqual([
      { name: "matrix-chromium", device: "Desktop Chrome", viewport: { width: 1440, height: 900 } },
      { name: "matrix-firefox", device: "Desktop Firefox", viewport: { width: 1440, height: 900 } },
      { name: "matrix-webkit", device: "Desktop Safari", viewport: { width: 1440, height: 900 } },
      { name: "matrix-chromium-1024", device: "Desktop Chrome", viewport: { width: 1024, height: 768 } },
      { name: "matrix-chromium-768", device: "Desktop Chrome", viewport: { width: 768, height: 1024 } },
      { name: "matrix-webkit-768", device: "Desktop Safari", viewport: { width: 768, height: 1024 } },
    ]);
  });

  it("matches exactly the 21 width specs against the real spec directory", async () => {
    const files = (await readdir(new URL("../e2e/", import.meta.url))).filter((file) => file.endsWith(".spec.ts"));
    expect(files.length).toBeGreaterThan(21);
    for (const project of MATRIX_PROJECTS) {
      if (!project.testMatch) {
        expect(["matrix-chromium", "matrix-firefox", "matrix-webkit"]).toContain(project.name);
        continue;
      }
      const selected = files.filter((file) => project.testMatch!.some((pattern) => matchesGlob(`e2e/${file}`, pattern))).sort();
      expect(selected, project.name).toEqual(EXPECTED_WIDTH_SPECS);
    }
    expect(MATRIX_PROJECTS.filter((project) => project.testMatch)).toHaveLength(3);
  });
});

describe("pure matrix planning", () => {
  it("plans every project once in declared order with one shared UTC timestamp", () => {
    const plan = planMatrixRuns([], START);
    expect(plan.map((step) => step.project)).toEqual(NAMES);
    expect(plan.map((step) => step.runId)).toEqual([
      "matrix-chromium-20261028-223000", "matrix-firefox-20261028-223000", "matrix-webkit-20261028-223000",
      "matrix-chromium-1024-20261028-223000", "matrix-chromium-768-20261028-223000", "matrix-webkit-768-20261028-223000",
    ]);
  });

  it("preserves selected argument order and supplies only safe per-run overrides", () => {
    const plan = planMatrixRuns(["matrix-webkit-768", "matrix-firefox"], START);
    expect(plan.map((step) => step.project)).toEqual(["matrix-webkit-768", "matrix-firefox"]);
    expect(plan[1]).toEqual({
      project: "matrix-firefox",
      runId: "matrix-firefox-20261028-223000",
      command: ["corepack", "pnpm", "exec", "playwright", "test", "--project=matrix-firefox"],
      env: {
        JIROO_E2E_RUN_ID: "matrix-firefox-20261028-223000",
        JIROO_E2E_COMMAND_LABEL: "corepack pnpm exec playwright test --project=matrix-firefox",
        JIROO_E2E_SCENARIOS: "matrice matrix-firefox",
      },
    });
  });

  it.each([
    { selection: ["unknown"] }, { selection: ["chromium"] },
    { selection: ["matrix-chromium,matrix-firefox"] },
    { selection: ["--project=matrix-chromium", "--project=matrix-firefox"] },
  ])(
    "rejects unknown or combined project selection $selection", ({ selection }) => {
      expect(() => planMatrixRuns(selection, START)).toThrow();
    },
  );

  it("rejects repeating a project instead of reusing its run ID", () => {
    expect(() => planMatrixRuns(["matrix-chromium", "matrix-chromium"], START)).toThrow();
  });

  it("never puts two projects in one Playwright invocation", () => {
    const plan = planMatrixRuns(["matrix-chromium", "matrix-firefox"], START);
    expect(plan).toHaveLength(2);
    expect(plan.map((step) => step.command.filter((arg) => arg.startsWith("--project="))))
      .toEqual([["--project=matrix-chromium"], ["--project=matrix-firefox"]]);
  });

  it("does not create an ID that is another ID followed by a hyphen", () => {
    const ids = planMatrixRuns([], START).map((step) => step.runId);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) {
      expect(ids.some((other) => other !== id && id.startsWith(`${other}-`))).toBe(false);
    }
    expect(planMatrixRuns([], new Date("2026-10-28T22:30:01Z"))[0]?.runId).toBe("matrix-chromium-20261028-223001");
  });

  it("allows the real inventory guard to finalize all project manifests together", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "jiroo-matrix-"));
    const root = temporaryDirectory;
    await mkdir(join(root, ".playwright/reports"), { recursive: true });
    const plan = planMatrixRuns([], START);
    for (const { runId } of plan) {
      await writeFile(join(root, `.playwright/reports/${runId}-manifest.json`), JSON.stringify({
        schemaVersion: 1, runId, result: { junitReport: `.playwright/reports/${runId}-junit.xml` },
      }));
    }
    expect(plan).toHaveLength(6);
    for (const { runId } of plan) {
      await inventoryE2eRun(runId, { workingDirectory: root });
      expect(JSON.parse(await readFile(join(root, `.playwright/reports/${runId}-manifest.json`), "utf8")).artifacts).toEqual([]);
    }
  });
});

describe("sequential matrix execution with synthetic IO", () => {
  it("inventories after each exit, including failure, before starting the next project", async () => {
    const events: string[] = [];
    let active = false;
    let clock = 0;
    const result = await executeMatrix(planMatrixRuns(["matrix-chromium", "matrix-firefox"], START), {
      run: async (step) => {
        if (active) throw new Error("Overlapping project invocations");
        active = true;
        await Promise.resolve();
        events.push(`exit:${step.project}`);
        active = false;
        return step.project === "matrix-chromium" ? 1 : 0;
      },
      inventory: async (id) => { if (active) throw new Error("Inventory before exit"); events.push(`inventory:${id}`); },
      now: () => clock += 1000,
    });
    expect(events).toEqual([
      "exit:matrix-chromium", "inventory:matrix-chromium-20261028-223000",
      "exit:matrix-firefox", "inventory:matrix-firefox-20261028-223000",
    ]);
    expect(result.map(({ result, durationMs }) => ({ result, durationMs }))).toEqual([
      { result: "FAIL", durationMs: 1000 }, { result: "PASS", durationMs: 1000 },
    ]);
  });

  it("marks an inventory error as failure and continues to the next project", async () => {
    const result = await executeMatrix(planMatrixRuns(["matrix-chromium", "matrix-firefox"], START), {
      run: async () => 0,
      inventory: async (id) => { if (id.includes("chromium")) throw new Error("synthetic inventory failure"); },
      now: () => 0,
    });
    expect(result.map(({ result, inventory }) => ({ result, inventory }))).toEqual([
      { result: "FAIL", inventory: "failed" }, { result: "PASS", inventory: "ok" },
    ]);
  });

  it("attempts the inventory even when process creation fails", async () => {
    const inventories: string[] = [];
    const result = await executeMatrix(planMatrixRuns(["matrix-chromium"], START), {
      run: async () => { throw new Error("synthetic spawn failure"); },
      inventory: async (id) => { inventories.push(id); },
      now: () => 0,
    });
    expect(inventories).toEqual(["matrix-chromium-20261028-223000"]);
    expect(result[0]).toMatchObject({ result: "FAIL", exitCode: 1, inventory: "ok" });
  });
});
