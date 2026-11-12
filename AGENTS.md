<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Pilotage du projet — obligatoire pour tous les agents

**Codex : rôle limité à la revue.** Sur Jiroo, Codex relit les branches en
lecture seule à la demande de Claude (aucune modification, aucun commit, aucun
push, aucune écriture dans Linear). Le pilotage Linear et les instructions de
suivi sont tenus par Claude Code (voir « Rôles des agents » dans
[docs/project-governance.md](docs/project-governance.md)).

Avant toute intervention, lire [CLAUDE.md](CLAUDE.md) et les
[règles communes Git / Linear](docs/project-governance.md). Elles définissent les
sources de référence, la validation des plans, le suivi des tickets et PR, et le
passage de relais. Les identifiants Linear non vérifiés ne doivent pas être
inventés. En cas d'accès indisponible, suivre le
[dossier non synchronisé](docs/linear-pending.md) et poursuivre seulement les
travaux autorisés indépendants.
