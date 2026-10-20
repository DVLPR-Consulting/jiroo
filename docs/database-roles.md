# Database roles

Jiroo connects with two PostgreSQL roles (JIR-114):

| Role | Used by | Rights |
| -- | -- | -- |
| Schema owner | `pnpm db:migrate`, `pnpm db:grant-runtime` (`DIRECT_DATABASE_URL`) | Owns the schema and every table; the only role that changes the schema |
| Runtime role | The application (`DATABASE_URL`) | Reads and writes rows, draws sequence values; nothing else |

The runtime role cannot create, alter, drop or truncate tables, nor read the migration journal (`drizzle.__drizzle_migrations`). A leaked application secret therefore cannot change the schema.

`db:grant-runtime` grants these rights and revokes those given to the role beyond them. It then checks what the role can still do through other roles or `PUBLIC` (role memberships, objects it owns, `CREATE` on the schema or the database, `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN` on a table, access to the `drizzle` schema). It never changes `PUBLIC` or another role silently: it lists what to fix and grants nothing until it is fixed.

## Set up

1. Create the runtime role **in SQL**, with `LOGIN` and no other attribute or membership, connected as the schema owner (the Neon SQL Editor, or `psql` on the internal server):

   ```sql
   CREATE ROLE jiroo_runtime LOGIN PASSWORD '…';
   ```

   On Neon, do not create it from the console's Roles page: a console role becomes a member of `neon_superuser`, far beyond this scope, and the script refuses it. The password never goes in the repository: it lives in the secret store, and in the application's `DATABASE_URL` only.

2. Apply the migrations as the schema owner, then grant the runtime role its rights:

   ```sh
   pnpm db:migrate
   JIROO_RUNTIME_ROLE=jiroo_runtime pnpm db:grant-runtime
   ```

   Both read `DIRECT_DATABASE_URL`, the schema owner's direct connection (not a transaction pooler).

3. Point the application's `DATABASE_URL` at the runtime role.

## After each release

`db:grant-runtime` is idempotent. Default privileges already extend the grants to the tables later migrations create, as long as the same owner role runs them; running the command again after `db:migrate` is a harmless check.

## Verify

```sql
SELECT has_table_privilege('jiroo_runtime', 'items', 'INSERT'),   -- true
       has_schema_privilege('jiroo_runtime', 'public', 'CREATE'); -- false
```
