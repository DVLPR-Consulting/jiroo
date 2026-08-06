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
  if (!["jiroo", "jiroo_e2e", "jiroo_test"].includes(databaseName)) {
    throw new Error("Reset E2E refusé : utilisez une base PostgreSQL E2E autorisée (jiroo, jiroo_e2e ou jiroo_test).");
  }

  return { databaseName, hostname };
}
