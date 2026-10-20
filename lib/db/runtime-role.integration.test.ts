import "dotenv/config";

import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { grantRuntimeRole, RuntimeRoleError } from "@/lib/db/runtime-role";

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

// The schema owner: the migrated test database's own connection.
const OWNER_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const suffix = randomBytes(4).toString("hex");
const RUNTIME = `jiroo_rt_test_${suffix}`;
const ADMIN_LIKE = `jiroo_rt_admin_${suffix}`;
const PASSWORD = randomBytes(18).toString("base64url");
const LATER_TABLE = `runtime_role_later_${suffix}`;
const BACKLOG_KEY = `RT${[...randomBytes(4)].map((byte) => String.fromCharCode(65 + (byte % 26))).join("")}`;

/** The same database, signed in as the runtime role. */
function runtimeUrl(): string {
  const url = new URL(OWNER_URL);
  url.username = RUNTIME;
  url.password = PASSWORD;
  return url.toString();
}

async function expectDenied(client: Client, statement: string) {
  await expect(client.query(statement)).rejects.toMatchObject({ code: "42501" });
}

describeDb("grantRuntimeRole (JIR-114)", () => {
  const owner = new Client({ connectionString: OWNER_URL });
  let runtime: Client | undefined;

  beforeAll(async () => {
    await owner.connect();
    await owner.query(`CREATE ROLE ${RUNTIME} LOGIN PASSWORD '${PASSWORD}'`);
    await owner.query(`CREATE ROLE ${ADMIN_LIKE} LOGIN CREATEDB`);
    await grantRuntimeRole(owner, RUNTIME);
    // Idempotent: a second run changes nothing and does not fail.
    await grantRuntimeRole(owner, RUNTIME);
    runtime = new Client({ connectionString: runtimeUrl() });
    await runtime.connect();
  });

  afterAll(async () => {
    await runtime?.end();
    await owner.query(`DROP TABLE IF EXISTS ${LATER_TABLE}`);
    for (const role of [RUNTIME, ADMIN_LIKE]) {
      await owner.query(`DROP OWNED BY ${role}`).catch(() => {});
      await owner.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await owner.end();
  });

  it("reads and writes rows and draws keys, inside a rolled back transaction", async () => {
    await runtime!.query("BEGIN");
    try {
      const { rows: [backlog] } = await runtime!.query<{ id: string }>(
        "INSERT INTO backlogs (key, name) VALUES ($1, 'Runtime role') RETURNING id",
        [BACKLOG_KEY],
      );
      await runtime!.query("UPDATE backlogs SET name = 'Renamed' WHERE id = $1", [backlog!.id]);
      await runtime!.query("SELECT nextval('item_key_seq')");
      await runtime!.query("DELETE FROM backlogs WHERE id = $1", [backlog!.id]);
      await runtime!.query("SELECT count(*) FROM items");
    } finally {
      await runtime!.query("ROLLBACK");
    }
  });

  it("cannot change the schema nor read the migration journal", async () => {
    await expectDenied(runtime!, "CREATE TABLE runtime_role_forbidden (id int)");
    await expectDenied(runtime!, "ALTER TABLE items ADD COLUMN runtime_forbidden int");
    await expectDenied(runtime!, "DROP TABLE items");
    await expectDenied(runtime!, "TRUNCATE items");
    await expectDenied(runtime!, "SELECT * FROM drizzle.__drizzle_migrations");
  });

  it("extends the grants to a table a later migration creates", async () => {
    await owner.query(`CREATE TABLE ${LATER_TABLE} (id serial PRIMARY KEY, label text)`);
    await runtime!.query(`INSERT INTO ${LATER_TABLE} (label) VALUES ('ok')`);
    const { rows } = await runtime!.query(`SELECT label FROM ${LATER_TABLE}`);
    expect(rows).toEqual([{ label: "ok" }]);
  });

  it("revokes rights granted to the role beyond its scope", async () => {
    await owner.query(`GRANT TRUNCATE, REFERENCES, TRIGGER ON items TO ${RUNTIME}`);
    await owner.query(`GRANT UPDATE ON SEQUENCE item_key_seq TO ${RUNTIME}`);
    await owner.query(`GRANT CREATE ON SCHEMA public TO ${RUNTIME}`);
    await grantRuntimeRole(owner, RUNTIME);
    const { rows: [rights] } = await owner.query(
      `SELECT has_table_privilege($1, 'items', 'TRUNCATE') AS truncate,
              has_table_privilege($1, 'items', 'REFERENCES') AS references,
              has_table_privilege($1, 'items', 'TRIGGER') AS trigger,
              has_sequence_privilege($1, 'item_key_seq', 'UPDATE') AS setval,
              has_schema_privilege($1, 'public', 'CREATE') AS create`,
      [RUNTIME],
    );
    expect(rights).toEqual({ truncate: false, references: false, trigger: false, setval: false, create: false });
  });

  it("refuses a role that still creates in the schema through PUBLIC", async () => {
    await owner.query("GRANT CREATE ON SCHEMA public TO PUBLIC");
    try {
      await expect(grantRuntimeRole(owner, RUNTIME)).rejects.toThrow(
        /can create in schema public \(REVOKE CREATE ON SCHEMA public FROM PUBLIC\)/,
      );
    } finally {
      await owner.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    }
  });

  it("refuses a role that can still rewind a sequence through PUBLIC", async () => {
    await owner.query("GRANT UPDATE ON SEQUENCE item_key_seq TO PUBLIC");
    try {
      await expect(grantRuntimeRole(owner, RUNTIME)).rejects.toThrow(/UPDATE \(setval\) on sequence item_key_seq/);
    } finally {
      await owner.query("REVOKE UPDATE ON SEQUENCE item_key_seq FROM PUBLIC");
    }
  });

  it("refuses a role that inherits another role's rights", async () => {
    await owner.query(`GRANT pg_read_all_data TO ${RUNTIME}`);
    try {
      await expect(grantRuntimeRole(owner, RUNTIME)).rejects.toThrow(/member of role pg_read_all_data/);
    } finally {
      await owner.query(`REVOKE pg_read_all_data FROM ${RUNTIME}`);
    }
  });

  it("refuses a missing role, an administrative one, and a malformed name", async () => {
    await expect(grantRuntimeRole(owner, `jiroo_missing_${suffix}`)).rejects.toThrow(RuntimeRoleError);
    await expect(grantRuntimeRole(owner, ADMIN_LIKE)).rejects.toThrow(/administrative attributes/);
    await expect(grantRuntimeRole(owner, 'x"; DROP TABLE items; --')).rejects.toThrow(/Invalid role name/);
  });

  it("refuses to run as the runtime role itself", async () => {
    await expect(grantRuntimeRole(runtime!, RUNTIME)).rejects.toThrow(/schema owner/);
  });
});
