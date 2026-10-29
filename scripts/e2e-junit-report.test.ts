import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  exclusiveJunitPaths,
  publishExclusiveJunitReport,
} from "./e2e-junit-report";

let testRoot: string | undefined;

async function paths(ownerPid: number) {
  testRoot = await mkdtemp(join(tmpdir(), "jiroo-junit-report-"));
  const runId = `report-${randomUUID()}`;
  const result = exclusiveJunitPaths({
    reportPath: join(testRoot, "proof.xml"),
    runId,
    lockRoot: join(testRoot, "locks"),
    ownerPid,
  });
  await mkdir(join(testRoot, "locks"), { recursive: true });
  await writeFile(result.lockPath, `${JSON.stringify({ pid: ownerPid })}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return result;
}

afterEach(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
  testRoot = undefined;
});

describe("publication JUnit exclusive", () => {
  it("requires a readable reservation even when no temporary report exists", async () => {
    const reportPaths = await paths(30_001);
    await rm(reportPaths.lockPath);

    await expect(publishExclusiveJunitReport(reportPaths, 30_001)).rejects.toThrow("réservation Playwright");
    await expect(stat(reportPaths.finalPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an unreadable reservation and removes the temporary report", async () => {
    const reportPaths = await paths(30_002);
    await writeFile(reportPaths.lockPath, "invalid JSON");
    await writeFile(reportPaths.temporaryPath, "unowned proof");

    await expect(publishExclusiveJunitReport(reportPaths, 30_002)).rejects.toThrow("réservation Playwright");
    await expect(stat(reportPaths.finalPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(reportPaths.temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not publish or retain a temporary report for a non-owner", async () => {
    const reportPaths = await paths(10_001);
    await writeFile(reportPaths.temporaryPath, "loser");

    await expect(publishExclusiveJunitReport(reportPaths, 10_002)).resolves.toBe(false);
    await expect(stat(reportPaths.finalPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(reportPaths.temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to overwrite an existing final report", async () => {
    const ownerPid = 20_001;
    const reportPaths = await paths(ownerPid);
    await writeFile(reportPaths.temporaryPath, "replacement");
    await writeFile(reportPaths.finalPath, "original");

    await expect(
      publishExclusiveJunitReport(reportPaths, ownerPid),
    ).rejects.toThrow("existe déjà");
    await expect(readFile(reportPaths.finalPath, "utf8")).resolves.toBe("original");
  });
});
