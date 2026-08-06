import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type E2eRunManifestInput = {
  baseURL: string;
  command: string;
  databaseName: "jiroo_e2e";
  databaseVerifiedAt: string;
  gitSha: string;
  junitPath: string;
  manifestWrittenAt: string;
  nodeVersion: string;
  pnpmVersion: string;
  runId: string;
  scenarios: string;
  startedAt: string;
  systemIdentifierFingerprint: string;
};

export function buildE2eRunManifest(input: E2eRunManifestInput) {
  const parsedBaseURL = new URL(input.baseURL);
  const port = parsedBaseURL.port
    ? Number.parseInt(parsedBaseURL.port, 10)
    : parsedBaseURL.protocol === "https:"
      ? 443
      : 80;

  return {
    schemaVersion: 1,
    runId: input.runId,
    timestamps: {
      startedAt: input.startedAt,
      databaseVerifiedAt: input.databaseVerifiedAt,
      manifestWrittenAt: input.manifestWrittenAt,
    },
    runtime: {
      node: input.nodeVersion,
      pnpm: input.pnpmVersion,
    },
    source: { gitSha: input.gitSha },
    database: {
      name: input.databaseName,
      systemIdentifierFingerprint: input.systemIdentifierFingerprint,
    },
    server: { baseURL: input.baseURL, port },
    invocation: {
      command: input.command,
      scenarios: input.scenarios,
    },
    result: { junitReport: input.junitPath },
  } as const;
}

type Manifest = ReturnType<typeof buildE2eRunManifest>;

export async function writeE2eRunManifest(
  manifest: Manifest,
  options: {
    env?: Partial<Record<"JIROO_E2E_PERSIST_AUDIT", string>>;
    workingDirectory?: string;
  } = {},
): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(manifest.runId)) {
    throw new Error("Run ID invalide pour le manifeste E2E.");
  }
  const env = options.env ?? process.env;
  const relativePath = env.JIROO_E2E_PERSIST_AUDIT === "1"
    ? join("audit", "runs", `${manifest.runId}-manifest.json`)
    : join(".playwright", "reports", `${manifest.runId}-manifest.json`);
  const path = join(options.workingDirectory ?? process.cwd(), relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return path;
}

export async function collectAndWriteE2eRunManifest(input: Omit<
  E2eRunManifestInput,
  "gitSha" | "manifestWrittenAt" | "nodeVersion" | "pnpmVersion"
>): Promise<string> {
  const [{ stdout: pnpmVersion }, { stdout: gitSha }] = await Promise.all([
    execFileAsync("pnpm", ["--version"]),
    execFileAsync("git", ["rev-parse", "HEAD"]),
  ]);
  const manifest = buildE2eRunManifest({
    ...input,
    gitSha: gitSha.trim(),
    manifestWrittenAt: new Date().toISOString(),
    nodeVersion: process.version,
    pnpmVersion: pnpmVersion.trim(),
  });
  return writeE2eRunManifest(manifest);
}
