import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export type E2eArtifactInventoryEntry = { path: string; size: number; sha256: string };
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const REPORT_FOLDERS = ["audit/runs", ".playwright/reports"] as const;

// Resolve from a canonical root and reject links at every component, including
// the manifest and the shared audit directories, not just the artifact leaf.
async function safeStat(root: string, relativePath: string) {
  const parts = relativePath.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    throw new Error("Artifact path is outside the run.");
  }
  let path = root;
  for (const part of parts) {
    path = join(path, part);
    try {
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error("Symlinks are not allowed in run evidence.");
      if (path === join(root, relativePath)) return stat;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  return null;
}

async function openRunFile(root: string, path: string) {
  if (!(await safeStat(root, path))?.isFile()) throw new Error("Expected a regular run file.");
  return open(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Finalize once, after all run writers (including the JUnit reporter) exit. */
export async function inventoryE2eRun(
  runId: string,
  options: { workingDirectory?: string } = {},
): Promise<{ manifestPath: string; artifacts: E2eArtifactInventoryEntry[] }> {
  if (!RUN_ID.test(runId)) throw new Error("Invalid E2E run ID.");
  const root = await realpath(options.workingDirectory ?? process.cwd());
  const manifests = [];
  for (const folder of REPORT_FOLDERS) {
    const path = `${folder}/${runId}-manifest.json`;
    if (await safeStat(root, path)) manifests.push(path);
  }
  if (manifests.length !== 1) throw new Error("Expected exactly one manifest for this run.");
  const manifestPath = manifests[0]!;
  const folder = dirname(manifestPath);
  const persistent = folder === "audit/runs";
  const lockPath = join(root, folder, `.${runId}-inventory.lock`);
  const temporaryPath = join(root, folder, `.${runId}-inventory-${randomUUID()}.tmp`);
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const handle = await openRunFile(root, manifestPath);
    let manifest: unknown;
    try {
      const contents = await handle.readFile("utf8");
      try {
        manifest = JSON.parse(contents);
      } catch {
        // JSON parser errors can include file contents; never print those.
        throw new Error("Invalid E2E manifest JSON.");
      }
    } finally {
      await handle.close();
    }
    if (!record(manifest) || manifest.schemaVersion !== 1 || manifest.runId !== runId
      || !record(manifest.result) || manifest.result.junitReport !== `${folder}/${runId}-junit.xml`) {
      throw new Error("Manifest identity or JUnit path is outside this run.");
    }
    if (Object.hasOwn(manifest, "artifacts")) throw new Error("This run inventory is already finalized.");

    // Shared folders only encode ownership as a run-ID prefix. Overlapping IDs
    // in the same storage mode cannot be attributed reliably: fail closed.
    for (const name of await readdir(join(root, folder))) {
      if (!name.endsWith("-manifest.json")) continue;
      const other = name.replace(/-manifest\.json$/u, "");
      if (other !== runId && RUN_ID.test(other)
        && (other.startsWith(`${runId}-`) || runId.startsWith(`${other}-`))) {
        throw new Error("Overlapping run IDs make shared artifact ownership ambiguous.");
      }
    }
    const artifacts: E2eArtifactInventoryEntry[] = [];
    async function walk(path: string): Promise<void> {
      const stat = await safeStat(root, path);
      if (!stat) return;
      if (stat.isDirectory()) {
        for (const name of await readdir(join(root, path))) await walk(`${path}/${name}`);
        return;
      }
      if (!stat.isFile()) throw new Error("Non-regular run artifacts are not supported.");
      const file = await openRunFile(root, path);
      try {
        const hash = createHash("sha256");
        let size = 0;
        for await (const chunk of file.createReadStream({ autoClose: false })) {
          hash.update(chunk);
          size += (chunk as Buffer).length;
        }
        artifacts.push({ path, size, sha256: hash.digest("hex") });
      } finally {
        await file.close();
      }
    }
    async function shared(path: string) {
      if (!(await safeStat(root, path))?.isDirectory()) return;
      for (const name of await readdir(join(root, path))) {
        if (!name.startsWith(`${runId}-`)) continue;
        const relativePath = `${path}/${name}`;
        // A manifest cannot contain its own digest without recursion.
        if (relativePath !== manifestPath) await walk(relativePath);
      }
    }
    await shared(folder);
    if (persistent) {
      for (const category of ["console", "network", "screenshots"]) await shared(`audit/${category}`);
    } else {
      await walk(`.playwright/evidence/${runId}`);
    }
    await walk(`.playwright/test-results/${runId}`);
    artifacts.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

    await writeFile(temporaryPath, `${JSON.stringify({ ...manifest, artifacts }, null, 2)}\n`, {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
    await rename(temporaryPath, join(root, manifestPath));
    return { manifestPath, artifacts };
  } finally {
    await rm(temporaryPath, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void (async () => {
    if (process.argv.length !== 3) throw new Error("Usage: pnpm e2e:inventory <runId>");
    const result = await inventoryE2eRun(process.argv[2]!);
    console.log(`${result.artifacts.length} artifact(s) inventoried in ${result.manifestPath}`);
  })().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "E2E inventory failed.");
    process.exitCode = 1;
  });
}
