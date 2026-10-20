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

  const { rows: [current] } = await client.query<{ database: string }>(
    "SELECT current_database() AS database",
  );
  const database = current!.database;
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
      // The schema stays the owner's, whatever an older default allowed.
      `REVOKE CREATE ON SCHEMA public FROM ${grantee}`,
    ]) {
      await client.query(statement);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
