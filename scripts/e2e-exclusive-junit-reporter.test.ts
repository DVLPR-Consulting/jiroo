import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ExclusiveJunitReporter from "../e2e/exclusive-junit-reporter";

let testRoot: string;

afterEach(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

async function paths() {
  testRoot = await mkdtemp(join(tmpdir(), "jiroo-junit-reporter-"));
  return {
    finalPath: join(testRoot, "proof.xml"),
    lockPath: join(testRoot, "reservation.lock"),
    temporaryPath: join(testRoot, "temporary.xml"),
  };
}

describe("exclusive JUnit reporter modes", () => {
  it("lists without a reservation and without writing any files", async () => {
    const reportPaths = await paths();
    const reporter = new ExclusiveJunitReporter({ ...reportPaths, _mode: "list" });

    await expect(reporter.onExit()).resolves.toBeUndefined();
    await expect(readdir(testRoot)).resolves.toEqual([]);
  });

  it("removes its native temporary report without publishing in list mode", async () => {
    const reportPaths = await paths();
    await writeFile(reportPaths.temporaryPath, "temporary proof");
    await writeFile(reportPaths.finalPath, "original proof");
    const reporter = new ExclusiveJunitReporter({ ...reportPaths, _mode: "list" });

    await reporter.onExit();

    await expect(stat(reportPaths.temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(reportPaths.finalPath, "utf8")).resolves.toBe("original proof");
    await expect(stat(reportPaths.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([undefined, "test", "merge"])("requires a reservation in mode %s", async (_mode) => {
    const reportPaths = await paths();
    const reporter = new ExclusiveJunitReporter({ ...reportPaths, _mode });

    await expect(reporter.onExit()).rejects.toThrow("réservation Playwright");
    await expect(stat(reportPaths.finalPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("publishes an owned report in test mode", async () => {
    const reportPaths = await paths();
    await writeFile(reportPaths.lockPath, JSON.stringify({ pid: process.pid }));
    await writeFile(reportPaths.temporaryPath, "owned proof");
    const reporter = new ExclusiveJunitReporter({ ...reportPaths, _mode: "test" });

    await reporter.onExit();

    await expect(readFile(reportPaths.finalPath, "utf8")).resolves.toBe("owned proof");
    await expect(stat(reportPaths.temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
