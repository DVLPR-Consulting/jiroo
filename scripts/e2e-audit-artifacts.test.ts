import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveAuditArtifactPath,
  writeAuditScreenshot,
  writeAuditText,
} from "../e2e/audit-artifacts";

let workingDirectory: string;

beforeEach(async () => {
  workingDirectory = await mkdtemp(join(tmpdir(), "jiroo-audit-artifacts-"));
});

afterEach(async () => {
  await rm(workingDirectory, { recursive: true, force: true });
});

const persistentOptions = () => ({
  env: {
    JIROO_E2E_PERSIST_AUDIT_ARTIFACTS: "1",
    JIROO_E2E_RUN_ID: "20260806-round3",
  },
  workingDirectory,
});

describe("artefacts d’audit E2E immuables", () => {
  it("redirige un ancien chemin vers un nom run-scoped sans l’écraser", () => {
    expect(resolveAuditArtifactPath(
      "audit/console/2026-08-05-session-06-console.log",
      persistentOptions(),
    )).toBe(join(
      workingDirectory,
      "audit/console/20260806-round3-2026-08-05-session-06-console.log",
    ));
  });

  it("crée les journaux en mode exclusif", async () => {
    const legacyPath = "audit/network/2026-08-05-requests.log";
    const path = await writeAuditText(legacyPath, "première preuve\n", persistentOptions());

    await expect(writeAuditText(legacyPath, "écrasement\n", persistentOptions()))
      .rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(path, "utf8")).resolves.toBe("première preuve\n");
  });

  it("publie les captures sans écrasement et nettoie le fichier temporaire", async () => {
    const legacyPath = "audit/screenshots/ancienne-capture.png";
    const capture = async (path: string) => writeFile(path, "première image");
    const path = await writeAuditScreenshot(legacyPath, capture, persistentOptions());

    await expect(writeAuditScreenshot(
      legacyPath,
      async (temporaryPath) => writeFile(temporaryPath, "écrasement"),
      persistentOptions(),
    )).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(path, "utf8")).resolves.toBe("première image");
    await expect(readdir(join(workingDirectory, "audit/screenshots")))
      .resolves.toEqual(["20260806-round3-ancienne-capture.png"]);
  });
});
