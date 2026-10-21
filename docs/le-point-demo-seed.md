# Seed the Le point comparison backlog (JIR-107)

The script loads `LE_POINT_DEMO` into real `DEMO` / `DEMOX` backlogs while the
isolated `/le-point` prototype continues to use its frozen fixtures.

Use an already migrated local Jiroo database and an existing administrator
outside `@demo.jiroo.local`. Supply its local `DATABASE_URL` and the local app's
`BETTER_AUTH_SECRET` through the environment. The script reads no dotenv file.
The default permission scheme must use project roles, with browse and assignable
rights for members. Existing global policies are preserved.

From the repository root, with its dependencies installed:

```bash
JIROO_ALLOW_DEMO_SEED=1 node --conditions=react-server --import tsx scripts/seed-demo-le-point.ts
# Replace only the reserved demo namespace:
JIROO_ALLOW_DEMO_SEED=1 node --conditions=react-server --import tsx scripts/seed-demo-le-point.ts --reset
```

Only explicit PostgreSQL URLs on `localhost` or `127.0.0.1` are accepted.
Routing query overrides are rejected. On the current review machine, the Jiroo
instance is on port 5434; port 5433 belongs to another project.

Four contributor accounts get random passwords, displayed once after successful
creation. The script writes no credential file. Normal 2FA enrollment applies.
It prints a fixture-key → actual-key table: the shared item sequence keeps
advancing. Mentions use the actual keys. Tasks without an objective go under a
technical “Autres travaux” epic to respect the hierarchy. Objective release
assignments apply to their tasks; fixture release 1.2 has no assigned work and
is published empty, while 1.3 remains unpublished.

An existing `DEMO`, `DEMOX` or reserved demo account causes a refusal without
`--reset`. Reset deletes those two backlogs and `@demo.jiroo.local` accounts,
including their demo release/sprint history, in one transaction. It requires a
local owner allowed to set `session_replication_role`; trigger suppression is
local to history deletion, with FK enforcement restored before live deletion.
Foreign restrictive references roll the whole reset back. Shared permission
schemes are preserved. Creation then uses separate service transactions; after
an interrupted run, repair the local setup and retry with `--reset`.

The single owner-approved cross-backlog SQL link models DEMO-33's hidden
blocker and records activity in the same transaction. All four personas lack
DEMOX access. Existing views assume same-backlog links: their link reader can
show the synthetic target's generic key/title, and their blocked badge ignores
a foreign source. Account for these limits when comparing this case.

Due, sprint and release dates retain the frozen calendar (reference day
2026-11-03). Audit, comment and completion timestamps come from the real
services; last-visit and unknown-history facts are not persisted. Time-based
answers can therefore differ from the frozen prototype. No history is backdated.

The integration suite owns a migrated, bootstrapped disposable local database
named `jir107_seed_<hex>` on port 5434; it checks the local URL before setup
writes. Create the database separately and drop it afterwards:

```bash
JIROO_RUN_DB_TESTS=1 JIROO_ALLOW_DEMO_SEED=1 node node_modules/vitest/vitest.mjs run scripts/seed-demo-le-point.integration.test.ts --project db
```
