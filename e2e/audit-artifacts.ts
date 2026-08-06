import { randomUUID } from "node:crypto";
import { link, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

type AuditEnvironment = Partial<Record<
  "JIROO_E2E_PERSIST_AUDIT_ARTIFACTS" | "JIROO_E2E_RUN_ID",
  string
>>;

type AuditArtifactOptions = {
  env?: AuditEnvironment;
  workingDirectory?: string;
};

function artifactCoordinates(legacyPath: string) {
  const parts = legacyPath.split("/");
  if (
    parts.length !== 3
    || parts[0] !== "audit"
    || !["console", "network", "screenshots"].includes(parts[1]!)
    || basename(parts[2]!) !== parts[2]
  ) {
    throw new Error(`Chemin d’artefact E2E non autorisé : ${legacyPath}`);
  }
  return { category: parts[1]!, fileName: parts[2]! };
}

export function resolveAuditArtifactPath(
  legacyPath: string,
  options: AuditArtifactOptions = {},
): string {
  const env = options.env ?? process.env;
  const runId = env.JIROO_E2E_RUN_ID?.trim();
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)) {
    throw new Error("JIROO_E2E_RUN_ID est obligatoire pour tout artefact d’audit E2E.");
  }
  const { category, fileName } = artifactCoordinates(legacyPath);
  const root = env.JIROO_E2E_PERSIST_AUDIT_ARTIFACTS === "1"
    ? "audit"
    : join(".playwright", "evidence", runId);
  return join(options.workingDirectory ?? process.cwd(), root, category, `${runId}-${fileName}`);
}

export async function writeAuditText(
  legacyPath: string,
  contents: string,
  options: AuditArtifactOptions = {},
): Promise<string> {
  const path = resolveAuditArtifactPath(legacyPath, options);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return path;
}

export async function writeAuditScreenshot(
  legacyPath: string,
  capture: (temporaryPath: string) => Promise<unknown>,
  options: AuditArtifactOptions = {},
): Promise<string> {
  const path = resolveAuditArtifactPath(legacyPath, options);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await capture(temporaryPath);
    await link(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return path;
}
