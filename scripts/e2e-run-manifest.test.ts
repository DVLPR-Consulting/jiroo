import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildE2eRunManifest,
  writeE2eRunManifest,
} from "./e2e-run-manifest";

let workingDirectory: string;

beforeEach(async () => {
  workingDirectory = await mkdtemp(join(tmpdir(), "jiroo-e2e-manifest-"));
});

afterEach(async () => {
  await rm(workingDirectory, { recursive: true, force: true });
});

describe("manifeste brut de provenance E2E", () => {
  it("recense le runtime, la source, la cible vérifiée et le rapport sans identité brute", () => {
    const rawIdentifier = "1234567890123456789";
    const manifest = buildE2eRunManifest({
      baseURL: "http://localhost:3100",
      command: "pnpm exec playwright test e2e/permission-schemes.spec.ts",
      databaseName: "jiroo_e2e",
      databaseVerifiedAt: "2026-08-06T18:00:01.000Z",
      gitSha: "0123456789abcdef0123456789abcdef01234567",
      junitPath: "audit/runs/20260806-round3-junit.xml",
      manifestWrittenAt: "2026-08-06T18:00:02.000Z",
      nodeVersion: "v24.13.0",
      pnpmVersion: "10.19.0",
      runId: "20260806-round3",
      scenarios: "permission schemes 10/10",
      startedAt: "2026-08-06T18:00:00.000Z",
      systemIdentifierFingerprint: "sha256:22085aa929bcd7af4b23d9d9c046a1d4fde8be51f79d91392efafef96574ab01",
    });

    expect(manifest).toMatchObject({
      database: {
        name: "jiroo_e2e",
        systemIdentifierFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      },
      invocation: {
        command: "pnpm exec playwright test e2e/permission-schemes.spec.ts",
        scenarios: "permission schemes 10/10",
      },
      result: { junitReport: "audit/runs/20260806-round3-junit.xml" },
      runId: "20260806-round3",
      runtime: { node: "v24.13.0", pnpm: "10.19.0" },
      server: { baseURL: "http://localhost:3100", port: 3100 },
      source: { gitSha: "0123456789abcdef0123456789abcdef01234567" },
    });
    expect(JSON.stringify(manifest)).not.toContain(rawIdentifier);
  });

  it("écrit un manifeste persistant en mode exclusif", async () => {
    const manifest = buildE2eRunManifest({
      baseURL: "http://localhost:3100",
      command: "playwright test",
      databaseName: "jiroo_e2e",
      databaseVerifiedAt: "2026-08-06T18:00:01.000Z",
      gitSha: "0123456789abcdef0123456789abcdef01234567",
      junitPath: "audit/runs/20260806-round3-junit.xml",
      manifestWrittenAt: "2026-08-06T18:00:02.000Z",
      nodeVersion: "v24.13.0",
      pnpmVersion: "10.19.0",
      runId: "20260806-round3",
      scenarios: "all",
      startedAt: "2026-08-06T18:00:00.000Z",
      systemIdentifierFingerprint: "sha256:22085aa929bcd7af4b23d9d9c046a1d4fde8be51f79d91392efafef96574ab01",
    });
    const options = {
      env: { JIROO_E2E_PERSIST_AUDIT: "1" },
      workingDirectory,
    };

    const path = await writeE2eRunManifest(manifest, options);
    await expect(writeE2eRunManifest(manifest, options))
      .rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(path, "utf8")).resolves.toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });
});
