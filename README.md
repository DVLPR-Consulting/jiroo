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
- `pnpm db:migrate` — apply migrations (uses `DIRECT_DATABASE_URL`)
- `pnpm db:seed` — seed demo data
- `pnpm db:studio` — Drizzle Studio
- `pnpm check:auth` — headless sign-in smoke check

## Environments

`DATABASE_URL` switches the app between local Docker, Neon (pooled, EU) and the future internal server. Migrations use `DIRECT_DATABASE_URL` (unpooled). Auth secrets live in `.env` / host env; never commit them. The auth API route runs on the Node.js runtime (not edge).

## Design system

Design tokens (oklch) and primitives are ported from the hi-fi handoff in
`.claude/output/design/`. Tokens live in `app/globals.css` (`:root` / `.dark`),
mapped to shadcn tokens via `@theme inline`. Theme (light/dark) and density
(comfy/compact) are persisted in `localStorage` and applied before hydration.
