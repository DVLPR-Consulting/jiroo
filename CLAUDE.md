# Jiroo

Lightweight Jira-like ticket manager for a Cour de cassation team. French UI and content; **English** for code, comments, commit messages, PRs and docs.

## Pilotage du projet — obligatoire pour tous les agents

Lire [AGENTS.md](AGENTS.md) et les [règles communes Git / Linear](docs/project-governance.md)
avant toute intervention. Ce document commun définit les sources de référence,
la validation des plans, le suivi des tickets et PR, et le passage de relais.
La gouvernance et les documents de pilotage sont en français, conformément à la
demande du propriétaire du 2 octobre 2026 ; les conventions du code sont conservées.
Les identifiants et liens Linear restent à vérifier avant toute écriture distante.
En cas d'indisponibilité, utiliser le [dossier non synchronisé](docs/linear-pending.md).

## Product decisions: defer to Jira (REQUIRED)

When a question is about **how a feature should behave** — ranking, board layout,
hierarchy rules, drag-and-drop semantics, filtering, statuses, anything where the
product behaviour is genuinely undecided — **first research how Jira does it** and
align with Jira's proven model. Jiroo is deliberately "Jira's important features,
minus the bloat", so Jira is the reference implementation for behaviour. Cite the
finding (Atlassian docs / reputable write-ups) when proposing the design, then
apply the simplest version consistent with "pas d'usine à gaz". This applies to
behaviour, not to our hard constraints (single polymorphic `items` table, hard-coded
hierarchy/RBAC, no user-facing config) — those stay as specified.

## Development workflow (REQUIRED)

- **One PR per lot.** Each lot from the implementation plan ships as its own pull request against `main`, on a dedicated branch named `lot-N-<slug>` (e.g. `lot-0-design-system`).
- **Atomic commits.** Every commit is one logical, self-contained change that builds and passes tests. No "WIP", no mixed-concern commits.
- **Code review on every commit.** Each atomic commit is code-reviewed before the next one. Under subagent-driven development this is the two-stage review — spec compliance first, then code quality — run after each task/commit.
- **`main` is protected.** Never commit directly to `main`; it only advances by merging reviewed PRs and must always stay green.
- **Pre-commit gate (Husky).** A `pre-commit` hook runs `pnpm typecheck && pnpm lint`; commits that fail either are blocked. Keep every commit green.

## Stack & conventions

- Next.js (App Router) + TypeScript strict, Tailwind v4 + shadcn/ui, PostgreSQL 17 (Docker) + Drizzle ORM, better-auth (+ `twoFactor` TOTP), dnd-kit.
- All item mutations go through a single service layer: **validate (Zod) → mutate → log activity, in one transaction**.
- Hierarchy, statuses and RBAC are hard-coded — no user-facing configuration.
- TDD for pure logic (rank, hierarchy validation, key generation, encryption, RBAC, services). Behavioral tests for UI components; visual fidelity verified by review against the handoff.

## Deployment & environments

- **Test phase:** deployed on **Vercel** (Node runtime) with **Neon** Postgres in an **EU region**. Every PR gets a Vercel preview deploy.
- **Final target:** an **internal sovereign server**. Keep everything portable — single `pg` (node-postgres) driver, no Neon-proprietary features, environment switched by `DATABASE_URL` only (local Docker / Neon / internal).
- Migrations are run manually (`pnpm db:migrate`) against the target env — never auto-migrate at runtime. Secrets live in `.env` (local) and Vercel env vars; never commit them.

## Where things live

- Product plans and decisions: Linear, following `docs/project-governance.md`.
- Historical specs and plans: imported in full into Linear on 2026-10-02 (index
  « Plans et décisions du projet »). Originals stay in `docs/superpowers/` (tracked)
  and `.claude/output/plans/` (gitignored); versioned specs cited by an ongoing
  chantier keep their authority. `docs/linear-pending.md` holds the provenance and
  the degraded-mode procedure.
- Design handoff (visual source of truth): `.claude/output/design/`.
- Design tokens: `app/globals.css` (`:root` / `.dark`), mapped to shadcn via `@theme inline`.
