# Releases depth (PR2) — review and local acceptance

## Status

**READY_FOR_PR (local).** Releases PR2 (Linear JIR-39) is implemented task by
task, every commit was reviewed (spec compliance, then code quality), and a
final whole-branch spec/security review found no Critical or Important issue.
No push, PR, Codex review or remote mutation is part of this record; the Codex
review required before opening the PR is still pending.

## Scope and provenance

- Base: `8970b51` (`main` content: Next.js 16.3.3, Better Auth 1.6.22,
  migrations up to 0014).
- Accepted source: `e3a650a` (recorded in the run manifest).
- Migration: `drizzle/0015_jira_releases_depth.sql` — nullable `releases.rank`
  and unique index `(backlog_id, rank)`; no backfill, no FK change. Applied
  only to local disposable databases.
- Plan: Linear document « Releases PR2 — plan d’implémentation (2026-10-02) »,
  validated by the owner on 2 October 2026 with overrides D8 (a), D14 (a), D15.

## Commits and per-commit review

| Task | Commit(s) | Review verdict | Follow-up |
|---|---|---|---|
| 1 Migration 0015 + Zod commands | `295b210` | Approve | — |
| 2 Pure version order | `c7cbba5` | Approve | — |
| 3 Merge/delete with link transfer | `7b6f2a5` | Approve, 2 Important (multi-batch and trashed links untested) | `34a041e` |
| 4 Persistent manual order | `80bef88` | Approve | `bc948a5` (legacy create test) |
| 5 Release notes builder + read model | `5b47aa5` | Approve with fixes (block-level Markdown escaping) | `cf6399c` |
| 6 Server Actions | `e225196` | Approve | — |
| 7 UI merge/delete/reorder | `01ecc18` | Approve with fixes (stale revision on rapid reorder, rollback target, dialog preview at mount) | `3e1e063` |
| 8 Notes route and editor | `48ecf81` | Approve with fixes (download URL revocation, edits lost on option change) | `ef73ecd` |
| 9 Deleted versions in filters | `fdfbd98` | Approve | — |
| 10 Playwright S17–S27 | `62445d1` | Approve with changes (forge merge/reorder too, weak activity assertion, unwaited reads) | `e3a650a` |

Final whole-branch review (`8970b51...e3a650a`): 0 Critical, 0 Important.
It verified cross-backlog isolation, the action order (validation, session,
`manage_releases`, service), the lock order (backlog → releases by ID → items by
ID, all writers serialized on the backlog lock), snapshot immutability (only FK
`SET NULL`), the event written before the DELETE, batching, Markdown/HTML
injection and stale writes. Remaining Minors are listed below.

## Decisions taken during execution (Jira-aligned)

- New versions are appended at the end of the manual order, as in Jira; on a
  backlog that still has legacy unranked versions, creation materializes their
  ranks in display order (no revision bump, no event).
- The target event is named `release_items_received` (payload `operation:
  merge|delete`) because it also records a delete with transfer.
- Links of trashed items are transferred or removed with an activity; the
  impact fingerprint and the empty-version check count live items only.

## Acceptance

Run `20261002-releases-depth-delivery-02`, full Chromium suite, isolated local
`jiroo_e2e` behind `next dev` on port 3010: **63/63**, 145.8 s, Releases 27/27.
0 HTTP 4xx/5xx, 0 page error, 0 defect. The 7 failed requests are injected
faults labelled `[expected]` (Releases S07, S12, S14, S21 ×3, S23). The 154
artefacts contain no PostgreSQL URL, local secret, system identifier, `Cookie`
or `Authorization` header. The earlier `-01` attempt stopped in global setup
before any test (persistent-audit variables missing).

| PR2 scenario | Duration |
|---|---:|
| S17 merge with deduplication, removed from list, filter and picker | 1 987 ms |
| S18 published merge keeps snapshots and destination labels | 1 309 ms |
| S19 delete with transfer then removal, correlated activities | 2 376 ms |
| S20 specialist with `manage_releases` only merges and deletes (D8 a) | 2 095 ms |
| S21 editor/reader: no controls, forged delete/merge/reorder refused | 3 165 ms |
| S22 stale impact preview refused, new count shown | 668 ms |
| S23 intercepted delete keeps dialog and selection | 623 ms |
| S24 drag-and-drop then Monter, same order everywhere and for a second user | 3 613 ms |
| S25 notes follow the current state, published or not (D14 a) | 2 704 ms |
| S26 notes edit, copy and download Markdown/HTML without raw HTML | 563 ms |
| S27 deleted version ignored in URL and saved view; 390/768/1024/1440 | 4 396 ms |

Other gates: 1 411 non-DB tests, 279/279 PostgreSQL integration tests run
serially, TypeScript, ESLint (one pre-existing warning) and `next build` green.
Merge/delete volume: 1, 100, 500, 1 000 and 1 001 links all-or-nothing with a
query count fixed per write batch.

## Final Acceptance Checklist (amended by the owner's validation)

1. Merge/delete transfer or remove Fix versions all-or-nothing with
   deduplication and one correlated activity per item — met.
2. A linked version cannot be deleted without an explicit choice; an empty one
   is deleted after a simple confirmation — met.
3. No snapshot or historical label is rewritten; references become NULL with
   their names kept — met.
4. **Amended by D8 (a):** `manage_releases` alone administers versions,
   including link transfer/removal; `edit_items` without `manage_releases`
   never manages them; absent and foreign IDs are indistinguishable — met.
5. Stale source/target revisions and impact fingerprint refused without
   writing; network failure keeps the input — met.
6. Persistent manual order shared by list, Version filter and pickers, after
   reload and for a second user, keyboard accessible — met.
7. **Amended by D14 (a):** notes always reflect the version's current items,
   editable and exportable as Markdown and HTML without injection — met.
8. Filters and views pointing to a deleted version never yield a misleading
   empty list — met.
9. typecheck, lint, build, unit, DB integration and full Chromium green — met.
10. Spec and quality/security reviews without open Critical/Important — met;
    **Codex review not yet run**.

## Open Minors

- Notes above 5 000 items are cut by text key order (the builder sorts keys
  naturally).
- Bare URLs in titles render as links in the preview (`javascript:` links are
  neutralized; no raw HTML).
- Focus returns to the document after a delete from the list; the notes preview
  adds a second `<h1>`; "Copier le HTML" copies HTML as plain text.
- The inner sub-query of the label read in `removeReleaseInTx` is not scoped by
  backlog (safe: release IDs are global and the outer query is scoped).

## Out of scope (as validated)

Related work, Affects versions, approvals, Git/PR/build/deployment data,
Release Burndown / Version Report, server-saved notes, navigation of orphaned
snapshots, Firefox/WebKit and screen readers.
