import type { ClientBase } from "pg";

/** A plain PostgreSQL role name, kept simple even though it is quoted. */
export const ROLE_NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/;

export class RuntimeRoleError extends Error {}

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * Least privilege for the application (JIR-114): the runtime role reads and
 * writes rows and draws sequence values, nothing else. It cannot change the
 * schema, read the migration journal or create objects. The schema owner, the
 * connection running this, keeps those rights for the migrations, and its
 * default privileges extend the grants to the tables later migrations create
 * (so run it as the role that runs the migrations).
 *
 * Idempotent. It never creates a role nor sets a password: the database
 * administrator (Neon console, DSI) provides the role and its secret.
 */
export async function grantRuntimeRole(client: ClientBase, runtimeRole: string): Promise<void> {
  if (!ROLE_NAME_RE.test(runtimeRole)) {
    throw new RuntimeRoleError(`Invalid role name « ${runtimeRole} ».`);
  }
  const { rows: [role] } = await client.query<{
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolbypassrls: boolean;
    is_current: boolean;
  }>(
    `SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolname = current_user AS is_current
       FROM pg_roles WHERE rolname = $1`,
    [runtimeRole],
  );
  if (!role) {
    throw new RuntimeRoleError(
      `Role « ${runtimeRole} » does not exist: create it first (LOGIN, no other attribute).`,
    );
  }
  if (role.is_current) {
    throw new RuntimeRoleError("Run this as the schema owner, not as the runtime role.");
  }
  if (role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls) {
    throw new RuntimeRoleError(
      `Role « ${runtimeRole} » has administrative attributes: a runtime role must not.`,
    );
  }

  const { rows: [current] } = await client.query<{ database: string; version: number }>(
    "SELECT current_database() AS database, current_setting('server_version_num')::int AS version",
  );
  const { database, version } = current!;
  // MAINTAIN (VACUUM, REINDEX, LOCK TABLE…) exists from PostgreSQL 17.
  const tableExtras = version >= 170000 ? ["TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"] : ["TRUNCATE", "REFERENCES", "TRIGGER"];
  const grantee = ident(runtimeRole);
  await client.query("BEGIN");
  try {
    for (const statement of [
      `GRANT CONNECT ON DATABASE ${ident(database)} TO ${grantee}`,
      `GRANT USAGE ON SCHEMA public TO ${grantee}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${grantee}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${grantee}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${grantee}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${grantee}`,
      // Rights granted to this role beyond its scope, earlier or by hand.
      `REVOKE CREATE ON SCHEMA public FROM ${grantee}`,
      `REVOKE CREATE, TEMPORARY ON DATABASE ${ident(database)} FROM ${grantee}`,
      `REVOKE ${tableExtras.join(", ")} ON ALL TABLES IN SCHEMA public FROM ${grantee}`,
      `REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM ${grantee}`,
    ]) {
      await client.query(statement);
    }
    const { rows: [drizzle] } = await client.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') AS present",
    );
    if (drizzle?.present) await client.query(`REVOKE ALL ON SCHEMA drizzle FROM ${grantee}`);

    const problems = await effectiveExcess(client, runtimeRole, database, tableExtras, drizzle?.present === true);
    if (problems.length > 0) {
      throw new RuntimeRoleError(
        `Role « ${runtimeRole} » still has rights beyond the runtime scope, through PUBLIC or another role; fix them first:\n- ${problems.join("\n- ")}`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * What the role can still do beyond its scope once its own grants are set:
 * rights it inherits (role memberships, PUBLIC) or objects it owns. Those are
 * not this script's to change silently: it reports them.
 */
async function effectiveExcess(
  client: ClientBase,
  role: string,
  database: string,
  tableExtras: string[],
  hasDrizzleSchema: boolean,
): Promise<string[]> {
  const problems: string[] = [];
  const { rows: memberships } = await client.query<{ rolname: string }>(
    `SELECT granted.rolname FROM pg_auth_members m
       JOIN pg_roles member ON member.oid = m.member
       JOIN pg_roles granted ON granted.oid = m.roleid
      WHERE member.rolname = $1 ORDER BY granted.rolname`,
    [role],
  );
  for (const { rolname } of memberships) problems.push(`member of role ${rolname} (REVOKE ${rolname} FROM ${role})`);

  const { rows: owned } = await client.query<{ kind: string; name: string }>(
    `SELECT 'table' AS kind, c.relname AS name FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
      WHERE r.rolname = $1 AND c.relnamespace = 'public'::regnamespace
     UNION ALL
     SELECT 'schema', n.nspname FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE r.rolname = $1
     UNION ALL
     SELECT 'database', d.datname FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba
      WHERE r.rolname = $1 AND d.datname = $2`,
    [role, database],
  );
  for (const { kind, name } of owned) problems.push(`owns ${kind} ${name}`);

  const { rows: [scope] } = await client.query<{ schema_create: boolean; database_create: boolean; drizzle_usage: boolean }>(
    `SELECT has_schema_privilege($1, 'public', 'CREATE') AS schema_create,
            has_database_privilege($1, $2, 'CREATE') AS database_create,
            ${hasDrizzleSchema ? "has_schema_privilege($1, 'drizzle', 'USAGE')" : "false"} AS drizzle_usage`,
    [role, database],
  );
  if (scope?.schema_create) problems.push("can create in schema public (REVOKE CREATE ON SCHEMA public FROM PUBLIC)");
  if (scope?.database_create) problems.push(`can create schemas in ${database} (REVOKE CREATE ON DATABASE ${database} FROM PUBLIC)`);
  if (scope?.drizzle_usage) problems.push("can use schema drizzle, the migration journal");

  const { rows: tables } = await client.query<{ name: string; privilege: string }>(
    `SELECT c.relname AS name, p.privilege
       FROM pg_class c CROSS JOIN unnest($2::text[]) AS p(privilege)
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
        AND has_table_privilege($1, c.oid, p.privilege)
      ORDER BY c.relname, p.privilege`,
    [role, tableExtras],
  );
  for (const { name, privilege } of tables) problems.push(`has ${privilege} on ${name}`);

  // UPDATE on a sequence allows setval: rewinding item keys would collide.
  const { rows: sequences } = await client.query<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace
        -- CASE keeps the check off non-sequences, whatever the plan's order.
        AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege($1, c.oid, 'UPDATE') ELSE false END
      ORDER BY c.relname`,
    [role],
  );
  for (const { name } of sequences) problems.push(`has UPDATE (setval) on sequence ${name}`);
  return problems;
}
