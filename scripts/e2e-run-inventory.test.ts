// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { writeAuditText, writeAuditScreenshot } from "../e2e/audit-artifacts";
import { inventoryE2eRun } from "./e2e-run-inventory";

const RUN = "synthetic-run";
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const roots: string[] = [];
const execFileAsync = promisify(execFile);

async function directory() {
  const root = await mkdtemp(join(tmpdir(), "jiroo-inventory-"));
  roots.push(root);
  return root;
}

async function put(root: string, path: string, content = "abc") {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function manifest(root: string, persistent = true, runId = RUN, junitPath?: string) {
  const folder = persistent ? "audit/runs" : ".playwright/reports";
  const path = `${folder}/${runId}-manifest.json`;
  const value = {
    schemaVersion: 1, runId,
    source: { gitSha: "synthetic-source" },
    result: { junitReport: junitPath ?? `${folder}/${runId}-junit.xml` },
    customMetadata: { preserved: true },
  };
  await put(root, path, `${JSON.stringify(value, null, 2)}\n`);
  return { path, value };
}

const entry = (path: string) => ({ path, size: 3, sha256: ABC_SHA256 });

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("end-of-run E2E inventory", () => {
  it("hashes every artifact category in deterministic relative-path order and preserves provenance", async () => {
    const inventories = [];
    for (const reverse of [false, true]) {
      const root = await directory();
      const original = await manifest(root);
      await manifest(root, true, "other-run");
      const paths = [
        `audit/runs/${RUN}-junit.xml`,
        `audit/runs/${RUN}-history-integrity.json`,
        `audit/screenshots/${RUN}-report.png`,
        `audit/console/${RUN}-report.log`,
        `audit/network/${RUN}-report.log`,
        `.playwright/test-results/${RUN}/case/trace.zip`,
        `.playwright/test-results/${RUN}/case/video.webm`,
        "audit/console/other-run-report.log",
        ".playwright/test-results/other/case/trace.zip",
      ];
      for (const path of reverse ? paths.toReversed() : paths) await put(root, path);
      const result = await inventoryE2eRun(RUN, { workingDirectory: root });
      expect(result.manifestPath).toBe(original.path);
      expect(result.artifacts).toEqual([
        entry(`.playwright/test-results/${RUN}/case/trace.zip`),
        entry(`.playwright/test-results/${RUN}/case/video.webm`),
        entry(`audit/console/${RUN}-report.log`),
        entry(`audit/network/${RUN}-report.log`),
        entry(`audit/runs/${RUN}-history-integrity.json`),
        entry(`audit/runs/${RUN}-junit.xml`),
        entry(`audit/screenshots/${RUN}-report.png`),
      ]);
      const stored = JSON.parse(await readFile(join(root, original.path), "utf8"));
      expect(stored).toEqual({ ...original.value, artifacts: result.artifacts });
      inventories.push(result.artifacts);
    }
    expect(inventories[0]).toEqual(inventories[1]);
  });

  it.each([RUN, `${RUN}-reports`])("refuses ambiguous run prefixes when finalizing %s", async (target) => {
    const root = await directory();
    const original = await manifest(root);
    const other = await manifest(root, true, `${RUN}-reports`);
    await writeAuditScreenshot("audit/screenshots/reports-chart.png", (path) => writeFile(path, "abc"), {
      workingDirectory: root, env: { JIROO_E2E_RUN_ID: RUN, JIROO_E2E_PERSIST_AUDIT: "1" },
    });
    const before = await readFile(join(root, original.path), "utf8");
    const otherBefore = await readFile(join(root, other.path), "utf8");
    await expect(inventoryE2eRun(target, { workingDirectory: root })).rejects.toThrow();
    expect(await readFile(join(root, original.path), "utf8")).toBe(before);
    expect(await readFile(join(root, other.path), "utf8")).toBe(otherBefore);
  });

  it("does not let a local run hide a persistent capture with the same prefix", async () => {
    const root = await directory();
    await manifest(root);
    await manifest(root, false, `${RUN}-reports`);
    await writeAuditScreenshot("audit/screenshots/reports-chart.png", (path) => writeFile(path, "abc"), {
      workingDirectory: root, env: { JIROO_E2E_RUN_ID: RUN, JIROO_E2E_PERSIST_AUDIT: "1" },
    });
    const result = await inventoryE2eRun(RUN, { workingDirectory: root });
    expect(result.artifacts).toEqual([entry(`audit/screenshots/${RUN}-reports-chart.png`)]);
  });

  it.each([true, false])("finds artifacts written by the real helpers (persistent=%s)", async (persistent) => {
    const root = await directory();
    const original = await manifest(root, persistent);
    const options = { workingDirectory: root, env: {
      JIROO_E2E_RUN_ID: RUN, JIROO_E2E_PERSIST_AUDIT: persistent ? "1" : "0",
    } };
    await writeAuditText("audit/console/report.log", "abc", options);
    await writeAuditScreenshot("audit/screenshots/report.png", (path) => writeFile(path, "abc"), options);
    await put(root, original.value.result.junitReport);
    const prefix = persistent ? "audit" : `.playwright/evidence/${RUN}`;
    const result = await inventoryE2eRun(RUN, { workingDirectory: root });
    expect(result.artifacts).toHaveLength(3);
    expect(result.artifacts).toEqual(expect.arrayContaining([
      entry(`${prefix}/console/${RUN}-report.log`),
      entry(`${prefix}/screenshots/${RUN}-report.png`),
      entry(original.value.result.junitReport),
    ]));
  });

  it.each([
    ["", 0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["é", 2, "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c"],
  ])("records byte length and digest for %j", async (content, size, sha256) => {
    const root = await directory();
    await manifest(root);
    const path = `audit/console/${RUN}-bytes.log`;
    await put(root, path, content as string);
    const result = await inventoryE2eRun(RUN, { workingDirectory: root });
    expect(result.artifacts).toEqual([{ path, size, sha256 }]);
  });

  it("completes a run without artifacts with an empty inventory", async () => {
    const root = await directory();
    const original = await manifest(root);
    const result = await inventoryE2eRun(RUN, { workingDirectory: root });
    expect(result.artifacts).toEqual([]);
    expect(JSON.parse(await readFile(join(root, original.path), "utf8")))
      .toEqual({ ...original.value, artifacts: [] });
  });

  it.each(["../outside", "", "run/other"])("rejects invalid run ID %j", async (runId) => {
    await expect(inventoryE2eRun(runId, { workingDirectory: await directory() })).rejects.toThrow();
  });

  it.each(["../../outside.txt", "/tmp/outside.txt", "audit/runs/other-junit.xml"])(
    "rejects a report outside this run: %s, preserving the original manifest", async (report) => {
      const root = await directory();
      const original = await manifest(root, true, RUN, report);
      const before = await readFile(join(root, original.path), "utf8");
      await expect(inventoryE2eRun(RUN, { workingDirectory: root })).rejects.toThrow();
      expect(await readFile(join(root, original.path), "utf8")).toBe(before);
    },
  );

  it.each(["file", "directory", "manifest"])("rejects %s symlinks leaving the run", async (kind) => {
    const root = await directory();
    const outside = await directory();
    const original = await manifest(root);
    await put(outside, "external.log");
    if (kind === "file") {
      await mkdir(join(root, "audit/console"), { recursive: true });
      await symlink(join(outside, "external.log"), join(root, `audit/console/${RUN}-leak.log`));
    } else if (kind === "directory") {
      await mkdir(join(root, ".playwright/test-results"), { recursive: true });
      await symlink(outside, join(root, `.playwright/test-results/${RUN}`));
    } else {
      await put(outside, "manifest.json", JSON.stringify(original.value));
      await rm(join(root, original.path));
      await symlink(join(outside, "manifest.json"), join(root, original.path));
    }
    const before = await readFile(join(root, original.path), "utf8");
    await expect(inventoryE2eRun(RUN, { workingDirectory: root })).rejects.toThrow();
    expect(await readFile(join(root, original.path), "utf8")).toBe(before);
    expect(await readFile(join(outside, "external.log"), "utf8")).toBe("abc");
  });

  it("refuses an absent or ambiguous manifest", async () => {
    const root = await directory();
    await expect(inventoryE2eRun(RUN, { workingDirectory: root })).rejects.toThrow();
    await manifest(root, true);
    await manifest(root, false);
    await expect(inventoryE2eRun(RUN, { workingDirectory: root })).rejects.toThrow();
  });

  it("does not replace a finalized inventory", async () => {
    const root = await directory();
    const original = await manifest(root);
    await inventoryE2eRun(RUN, { workingDirectory: root });
    const before = await readFile(join(root, original.path), "utf8");
    await put(root, `audit/console/${RUN}-late.log`);
    await expect(inventoryE2eRun(RUN, { workingDirectory: root })).rejects.toThrow();
    expect(await readFile(join(root, original.path), "utf8")).toBe(before);
  });

  it("runs the CLI without printing artifact contents", async () => {
    const root = await directory();
    await manifest(root);
    await put(root, `audit/console/${RUN}-report.log`, "synthetic-private-payload");
    const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const script = fileURLToPath(new URL("./e2e-run-inventory.ts", import.meta.url));
    const { stdout, stderr } = await execFileAsync(process.execPath, ["--import", loader, script, RUN], { cwd: root });
    expect(stdout).toContain("1 artifact");
    expect(stdout).toContain(`${RUN}-manifest.json`);
    expect(stdout).not.toContain("synthetic-private-payload");
    expect(stderr).toBe("");
    await expect(execFileAsync(process.execPath, ["--import", loader, script], { cwd: root }))
      .rejects.toMatchObject({ code: 1 });
  });
});
