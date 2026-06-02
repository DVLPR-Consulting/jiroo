# Jiroo

Lightweight ticket manager (Jira-like) for a Cour de cassation team. French UI.

> Lot 0 — project scaffold and design system. Database, auth and features land in later lots.

## Requirements

- Node 20+
- pnpm

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 — it redirects to `/design`, the design-system showcase.

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript, no emit
- `pnpm test` — run unit tests (Vitest)

## Design system

Design tokens (oklch) and primitives are ported from the hi-fi handoff in
`.claude/output/design/`. Tokens live in `app/globals.css` (`:root` / `.dark`),
mapped to shadcn tokens via `@theme inline`. Theme (light/dark) and density
(comfy/compact) are persisted in `localStorage` and applied before hydration.
