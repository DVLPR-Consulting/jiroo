import { createHash } from "node:crypto";

const DESTINATION_QUERY_PARAMETERS = new Set([
  "connection_string",
  "connectionstring",
  "database",
  "dbname",
  "host",
  "hostaddr",
  "port",
  "server",
  "service",
  "servicefile",
  "socket",
  "unix_socket",
]);

const SAFE_QUERY_PARAMETERS = new Set([
  "application_name",
  "fallback_application_name",
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslrootcert",
  "uselibpqcompat",
]);

export type VerifiedE2eDatabaseIdentity = {
  databaseName: "jiroo_e2e";
  systemIdentifierFingerprint: string;
};

export function assertE2eDatabaseIdentity(input: {
  databaseName: string;
  expectedSystemIdentifier: string | undefined;
  systemIdentifier: string;
}): VerifiedE2eDatabaseIdentity {
  if (!input.expectedSystemIdentifier) {
    throw new Error(
      "Reset E2E refusé : définissez explicitement JIROO_E2E_DATABASE_SYSTEM_IDENTIFIER.",
    );
  }
  if (input.databaseName !== "jiroo_e2e") {
    throw new Error("Reset E2E refusé : la base PostgreSQL effective n’est pas jiroo_e2e.");
  }
  if (input.systemIdentifier !== input.expectedSystemIdentifier) {
    throw new Error("Reset E2E refusé : l’identité PostgreSQL effective ne correspond pas à l’identité attendue.");
  }

  return {
    databaseName: "jiroo_e2e",
    systemIdentifierFingerprint: `sha256:${createHash("sha256").update(input.systemIdentifier).digest("hex")}`,
  };
}

type IdentityQueryClient = {
  query: (queryText: string) => Promise<{
    rows: Array<{ databaseName: string; systemIdentifier: string }>;
  }>;
};

export async function verifyE2eDatabaseIdentity(
  client: IdentityQueryClient,
  expectedSystemIdentifier: string | undefined,
): Promise<VerifiedE2eDatabaseIdentity> {
  const result = await client.query(`
    SELECT
      current_database() AS "databaseName",
      system_identifier::text AS "systemIdentifier"
    FROM pg_control_system()
  `);
  const identity = result.rows[0];
  if (!identity) {
    throw new Error("Reset E2E refusé : PostgreSQL n’a retourné aucune identité effective.");
  }

  return assertE2eDatabaseIdentity({
    databaseName: identity.databaseName,
    expectedSystemIdentifier,
    systemIdentifier: identity.systemIdentifier,
  });
}

export function assertE2eResetAllowed(_input: {
  allowReset: string | undefined;
  databaseUrl: string | undefined;
}): { databaseName: string; hostname: string } {
  if (_input.allowReset !== "1") {
    throw new Error("Reset E2E refusé : définissez explicitement JIROO_ALLOW_E2E_RESET=1.");
  }
  if (!_input.databaseUrl) {
    throw new Error("Reset E2E refusé : DATABASE_URL est absente.");
  }

  let parsed: URL;
  try {
    parsed = new URL(_input.databaseUrl);
  } catch {
    throw new Error("Reset E2E refusé : DATABASE_URL est invalide.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Reset E2E refusé : DATABASE_URL doit utiliser PostgreSQL.");
  }

  for (const key of parsed.searchParams.keys()) {
    const normalizedKey = key.toLowerCase();
    if (DESTINATION_QUERY_PARAMETERS.has(normalizedKey)) {
      throw new Error(`Reset E2E refusé : le paramètre de destination PostgreSQL « ${key} » est interdit.`);
    }
    if (!SAFE_QUERY_PARAMETERS.has(normalizedKey)) {
      throw new Error(`Reset E2E refusé : le paramètre PostgreSQL non autorisé « ${key} » est interdit par défaut.`);
    }
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Reset E2E refusé : un hôte PostgreSQL local est obligatoire.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (databaseName !== "jiroo_e2e") {
    throw new Error("Reset E2E refusé : utilisez exclusivement la base PostgreSQL E2E autorisée jiroo_e2e.");
  }

  return { databaseName, hostname };
}
