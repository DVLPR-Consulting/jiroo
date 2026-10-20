# Database roles

Jiroo connects with two PostgreSQL roles (JIR-114):

| Role | Used by | Rights |
| -- | -- | -- |
| Schema owner | `pnpm db:migrate`, `pnpm db:grant-runtime` (`DIRECT_DATABASE_URL`) | Owns the schema and every table; the only role that changes the schema |
| Runtime role | The application (`DATABASE_URL`) | Reads and writes rows, draws sequence values; nothing else |

The runtime role cannot create, alter, drop or truncate tables, nor read the migration journal (`drizzle.__drizzle_migrations`). A leaked application secret therefore cannot change the schema.

## Set up

1. Create the runtime role, with `LOGIN` and no other attribute (no `SUPERUSER`, `CREATEROLE`, `CREATEDB` or `BYPASSRLS`; the script refuses such a role). On Neon, create it from the console; on the internal server, the database administrator runs:

   ```sql
   CREATE ROLE jiroo_runtime LOGIN PASSWORD '…';
   ```

   The password never goes in the repository: it lives in the secret store, and in the application's `DATABASE_URL` only.

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
