# Jiroo Burndown — Development Handoff

**Checkpoint date:** 2026-08-17

**Implementation plan:** `docs/superpowers/plans/2026-08-09-jiroo-burndown-planning-predictability-implementation.md`

**Approved design:** `docs/superpowers/specs/2026-08-08-jiroo-burndown-planning-predictability-design.md`

**Checkpoint branch:** `feat/burndown-planning-predictability`

## Environment

- Node `v24.13.0`
- pnpm `10.19.0`
- PostgreSQL on `localhost:5433`
- Dedicated development database used during Tasks 1–4: `jiroo_burndown_predictability`
- The user explicitly requires a normal checkout, not a Git worktree.

On a new computer, install dependencies, then create, migrate and seed a dedicated database before running DB integration tests:

```bash
export PATH="/Users/nkrmr/.nvm/versions/node/v24.13.0/bin:$PATH"
export DIRECT_DATABASE_URL=postgres://jiroo:jiroo@localhost:5433/jiroo_burndown_predictability
export DATABASE_URL="$DIRECT_DATABASE_URL"
export JIROO_RUN_DB_TESTS=1
pnpm install
pnpm db:migrate
pnpm db:seed
```

Adapt the absolute Node path and database credentials to the new computer while preserving Node and pnpm versions.

## Completed and reviewed

### Task 1 — PostgreSQL historical facts

- Implementation: `fd71191 feat(reports): preserve sprint done-at-entry facts`
- Review: clean, no Critical/Important/Minor findings.
- Adds nullable `doneAtStart` facts and the new-row `item_added.nextDone` constraint while preserving legacy rows.

### Task 2 — Atomic done-state capture

- Implementation: `39de8e0 feat(reports): capture sprint done-at-entry state`
- Review fix: `d7e68a5 fix(reports): preserve bulk sprint lock order`
- Review: clean after one fix round.
- The fix ensures the bulk path follows backlog → sprint → memberships → items/statuses lock order.

### Task 3 — Pure burndown calculator

- Implementation: `c1f36b8 feat(reports): calculate explainable sprint burndown`
- Review fix: `43d48fb fix(reports): preserve burndown calculation boundaries`
- Review: clean after one fix round.
- Fixes cover completed unestimated work, mandatory projection boundaries and planning numeric validation.

## Implemented, review pending

### Task 4 — Backlog-scoped immutable read model

- Approved plan clarification: `50a1545 docs: clarify burndown lifecycle replay`
- Implementation: `b724c3e feat(reports): add sprint burndown read model`
- Implementer evidence: 45 focused tests passed; typecheck and lint passed.
- Per-task independent review has **not** run yet. Do not mark Task 4 complete until the SDD task review and any required fix/re-review loop are clean.

The user resolved a plan/design mismatch in favor of the approved design: `sprint_started` and `sprint_completed` are exact zero-delta replay events with their own causes and strict boundary validation. They must never be aliased to `cause="start"` or filtered from aligned event-point pages.

To resume Task 4 review, generate the review package from the implementation base:

```bash
superpowers_dir=/Users/nkrmr/.codex/plugins/cache/openai-curated-remote/superpowers/6.2.0
"$superpowers_dir/skills/subagent-driven-development/scripts/review-package" \
  docs/superpowers/plans/2026-08-09-jiroo-burndown-planning-predictability-implementation.md \
  50a1545 b724c3e
```

Review Task 4 against its brief in the implementation plan, especially:

- active/completed/legacy discrimination;
- no mutable-item reads for completed reports;
- lifecycle and item event replay alignment by sequence;
- fixed query count and no N+1;
- 1,000-participant and 10,000-event evidence;
- concurrent equal-timestamp determinism;
- completed snapshot metric cross-checks;
- seven-sprint velocity context only.

## Not started

- Task 5 — URL state, Server Component route and report navigation.
- Task 6 — Accessible and responsive burndown UI.
- Task 7 — Non-blocking recent-velocity comparison in the Backlog.
- Task 8 — Playwright acceptance, persistent evidence and audit updates.
- Final whole-branch review, full verification and final integration.

## Required continuation workflow

1. Read `AGENTS.md` and the local Next.js 16.2.7 guides named in the implementation plan.
2. Recreate the SDD workspace/ledger if continuing with `superpowers:subagent-driven-development`; the prior `.superpowers` workspace is intentionally not tracked.
3. Record Tasks 1–3 as review-clean and Task 4 as implementation-complete/review-pending.
4. Complete the Task 4 review gate before starting Task 5.
5. Execute Tasks 5–8 sequentially with RED/GREEN, per-task review and fix loops.
6. Run the final whole-branch review and the full acceptance checklist before claiming the feature complete.

This checkpoint is intentionally incomplete product work. The burndown route and user interface are not exposed yet, so the presence of the read model on `main` must not be described as a delivered feature.
