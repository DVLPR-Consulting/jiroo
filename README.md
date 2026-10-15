# Jiroo

Lightweight ticket manager (Jira-like) for a Cour de cassation team. French UI.

> Lot 1a — database and auth core. Postgres schema, Drizzle migrations, better-auth and RBAC. UI features land in later lots.

## Requirements

- Node 20+
- pnpm
- Docker (local Postgres)

## Getting started

```bash
cp .env.example .env      # dev values target the Docker Postgres (host port 5433)
docker compose up -d      # Postgres 17 locally
pnpm install
pnpm db:migrate           # apply Drizzle migrations
pnpm db:seed              # demo data (admin, CASS backlog, statuses, items)
pnpm dev
```

Reset the database: `docker compose down -v`.

> Local Postgres is published on host port **5433** (container 5432) to avoid clashing with a system Postgres on 5432.

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript, no emit
- `pnpm test` — unit tests (Vitest)
- `pnpm db:generate` — generate a migration from the schema
- `pnpm db:migrate` — apply migrations (uses `DIRECT_DATABASE_URL`, also used for realtime `LISTEN`; realtime falls back to `DATABASE_URL` if unset)
- `pnpm db:seed` — seed demo data
- `pnpm db:studio` — Drizzle Studio
- `pnpm check:auth` — headless sign-in smoke check

## Authentication

The app uses [better-auth](https://www.better-auth.com/) for authentication.

- **Email + password sign-in.** Users sign in with their email and password.
- **Two-factor authentication (TOTP).** Optional second factor via any
  authenticator app. Enrollment displays a QR code (plus a manual setup key)
  and a set of one-time recovery codes to store safely.
- **Recovery codes.** If the authenticator is unavailable, a one-time recovery
  code can be used instead of the 6-digit TOTP. Each code works once.

### Flow

`login` → (if 2FA is enabled) `/2fa` → app.

After a successful password sign-in, accounts with 2FA enabled are challenged
at `/2fa` for a 6-digit TOTP code (with a recovery-code fallback). Accounts
without 2FA go straight to the app.

### Secrets

The TOTP secret and recovery codes are **encrypted at rest** by better-auth,
keyed on `BETTER_AUTH_SECRET`. Keep this secret stable and private — rotating it
invalidates existing 2FA enrollments.

`BETTER_AUTH_URL` must match the app's origin. Locally this is
`http://localhost:3000` by default; set it to your actual dev port if you run
the server elsewhere.

## App shell & backlogs

After signing in, the user lands in the app shell: a sidebar with a backlog
selector, a topbar, and a view bar. The active backlog is encoded in the URL at
`/b/[key]`, so the current backlog survives reloads and is shareable.

Admins manage backlogs at `/admin`:

- **Create** a backlog — it is provisioned with 4 default statuses.
- **Edit** a backlog's name and color.
- **Soft-archive** a backlog (it is hidden rather than deleted).

Board, list and tree views, search, notifications and new-item are placeholders
until later lots. The current view shows a live item count for the active
backlog.

## Items & hierarchy

Work is broken down along a strict four-level hierarchy:

`Composant > Epic > Tâche > Sous-tâche`

Parenting is validated: an item may only be created or moved under a parent
whose type is exactly one level above it (a tâche under an epic, a sous-tâche
under a tâche, etc.). Top-level items must be composants.

Each item gets a human-readable, sequential key of the form `CASS-N`, allocated
from a Postgres sequence so keys are stable and never reused.

Every item mutation — `createItem`, `updateItem`, `softDeleteItem`,
`restoreItem` — runs through a single transactional service. Within **one
database transaction** the service validates, applies the mutation, and writes
a matching audit row to the `activities` table, so the audit trail can never
drift from the data it describes. `closed_at` is maintained automatically when
an item moves into (or out of) a done-category status.

Deletion is a **soft delete** that cascades over the whole subtree (rows are
locked `FOR UPDATE` while the subtree is marked deleted). Restore is the inverse
and guards against orphans — an item cannot be restored while its parent is
still deleted.

Subtree queries rely on a self-inclusive [`ltree`](https://www.postgresql.org/docs/current/ltree.html)
`path` on each item: the path includes the item's own key and is enforced by a
database `CHECK` constraint, so the materialized hierarchy stays consistent.

Items are created from a backlog view via the **Nouvel item** dialog, which only
offers parents and types allowed by the hierarchy rules.

## Item detail & editing

Clicking an item opens a right slide-over **detail panel**. The selected item is
encoded in the URL at `/b/[key]?item=KEY`, so an open item survives reloads and
is shareable. The panel only renders for items that belong to the current
backlog, so cross-backlog access is guarded.

Most fields are inline-editable and each change is persisted through the
transactional, RBAC-guarded `updateItem` service:

- **Title** — inline text edit.
- **Description** — markdown, rendered with
  [react-markdown](https://github.com/remarkjs/react-markdown) (raw HTML is not
  allowed).
- **Status**, **priority**, **assignee**, **due date** and **labels**.

An **Activité** tab surfaces the audit trail for the item, reading the
`activities` rows written by the same service.

From the panel menu, an item can be **soft-deleted**; the delete cascades over
the whole subtree (see [Items & hierarchy](#items--hierarchy)).

## Views: board, list & tree

A backlog renders in three interchangeable views, selected by the
`?view=board|list|tree` query parameter (the **ViewBar** tabs are plain links,
so the current view and any open `?item=` survive reloads and are shareable).

- **Board** — a kanban whose columns are the backlog's statuses. Like Jira, the
  board is **mono-level**: cards are the working level (**Tâche**) only —
  Sous-tâches stay nested under their tâche (a sub-count badge) and
  Composant/Epic are structure navigated in the other views, never sibling cards
  next to their own children. Dragging a card to another column changes its
  **status**; dragging within a column **reorders** it. The drag layer is
  optimistic, but it sends only the moved card and its neighbours' ids — never a
  rank — so the server computes the authoritative `rank` and is the single
  source of truth.
- **List** — a flat, ordered list of the backlog's items.
- **Tree** — the hierarchy as a collapsible tree, with **drag-and-drop
  reparenting**.

### Ranking & reparenting

Order is a **single global `rank` per backlog** — one
[LexoRank](https://docs.atlassian.com/cloud/jira-software-rest)-style total order
(a [fractional index](https://github.com/rocicorp/fractional-indexing) string,
unique per `backlog_id`) reused by every view, so a reorder rewrites **one row**
and the same value orders tree siblings *and* cards across a status column. On
the server, `rankAtDrop` works over the whole backlog: it locks the moved item's
neighbours `FOR UPDATE`, derives a rank strictly between them, and self-heals a
collapsed or contended gap under concurrent drops.

In the tree, a drop uses **three zones** over the target row — *before* /
*into* / *after* — to mean "reorder above", "become a child", or "reorder
below". When the parent changes, `reparentItem` rewrites the item's
`parent_id`, its `ltree` `path` **and the path of every descendant** in one
transaction, refusing any drop that would create a cycle (a node into its own
subtree) or land under a deleted ancestor. Same-parent drops route to the
lighter `moveItem` (rank only); cross-parent drops route to `reparentItem`.
Both views roll back the optimistic state if the server rejects the move, and
every move writes an audit row.

## Environments

`DATABASE_URL` switches the app between local Docker, Neon (pooled, EU) and the future internal server. Migrations and realtime `LISTEN` use `DIRECT_DATABASE_URL` (direct/unpooled, never Neon's transaction pooler); realtime falls back to `DATABASE_URL` if it is unset. Auth secrets live in `.env` / host env; never commit them. The auth API route runs on the Node.js runtime (not edge).

## Design system

Design tokens (oklch) and primitives are ported from the hi-fi handoff in
`.claude/output/design/`. Tokens live in `app/globals.css` (`:root` / `.dark`),
mapped to shadcn tokens via `@theme inline`. Theme (light/dark) and density
(comfy/compact) are persisted in `localStorage` and applied before hydration.
