# Jiroo Unified Permission Schemes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace global `admin/contributor/viewer` authorization with Jira-like global groups, project roles, reusable permission schemes, per-backlog role occupancy, permission explanations, and one Simple/Advanced administration experience.

**Architecture:** Add a server-only authorization data access layer that resolves additive grants from users, groups, and backlog roles and returns a safe decision DTO. Migrate existing access transactionally, route every read and mutation through the resolver, and expose administration through focused services, Server Actions, and accessible React views. Simple and Advanced modes share the same records; only their administration surfaces differ.

**Tech Stack:** Next.js 16.2.7 App Router and Server Actions, React 19.2.4, TypeScript 5, Drizzle ORM 0.45, PostgreSQL, Zod 4, Vitest/Testing Library, Playwright 1.62 Chromium.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/02-guides/authentication.md` and `node_modules/next/dist/docs/01-app/02-guides/data-security.md` before changing authorization code.
- Authorization lives in a `server-only` DAL and is repeated inside every Server Action; layouts and hidden controls are never the security boundary.
- Every backlog has exactly one permission scheme; schemes may be shared.
- Grants are additive and `browse_backlog` is a prerequisite for every other backlog permission.
- Platform administrators keep a recoverable bypass and every bypass is explainable.
- Existing users retain their current access during the idempotent cutover; new users receive no backlog access automatically.
- Unknown permission keys fail closed.
- No production behavior is written before its test has failed for the expected reason.
- All administrative writes are transactional and append an immutable security audit event.
- Shared-scheme writes use optimistic `version` comparison and reject stale submissions.
- Server results expose minimal DTOs and French safe errors; unreadable backlog resources behave as not found.
- Do not use Next.js experimental `unauthorized()`; preserve the existing session redirects and use `notFound()` for unreadable pages plus structured forbidden action results.
- Browser acceptance must collect console output, failed network requests, HTTP errors, timings, and screenshots for defects under `audit/`.

---

## File Structure

New authorization files are grouped by responsibility:

- `lib/auth/permissions.ts`: stable permission catalogue, labels, scopes, and prerequisites.
- `lib/auth/decision.ts`: pure grant evaluation and explanation ordering.
- `lib/auth/authorization.ts`: server-only DAL and `checkPermission` / `requirePermission` boundary.
- `lib/auth/accessible-backlogs.ts`: SQL predicates and DTO reads for browse-filtered surfaces.
- `lib/auth/action-authorization.ts`: helpers that resolve item, sprint, status, view, or backlog ownership before permission checks.
- `lib/validation/authorization.ts`: schemas for groups, roles, schemes, grants, assignments, and helper queries.
- `lib/services/authorization-bootstrap.ts`: idempotent compatibility migration and default setup.
- `lib/services/authorization-admin.ts`: transactional administration and immutable audit writes.
- `app/actions/authorization.ts`: safe Server Actions and revalidation.
- `app/(app)/b/[key]/settings/access/page.tsx`: backlog-scoped access settings for authorized backlog managers.
- `components/admin/access-admin.tsx`: backlog Simple/Advanced access administration.
- `components/admin/group-admin.tsx`: global group administration.
- `components/admin/global-permission-admin.tsx`: direct user/group global grants guarded by platform administration.
- `components/admin/project-role-admin.tsx`: reusable project-role administration.
- `components/admin/permission-scheme-admin.tsx`: scheme list, clone, matrix, association, and version conflict UI.
- `components/admin/permission-helper.tsx`: effective-access explanation UI.
- `e2e/permission-schemes.spec.ts`: real multi-user browser matrix.

Existing action, service, shell, item, sprint, workflow, trash, search, view, and admin files are modified only where they must consume the new authorization boundary.

---

### Task 1: Stable permission catalogue and pure decision engine

**Files:**
- Create: `lib/auth/permissions.ts`
- Create: `lib/auth/permissions.test.ts`
- Create: `lib/auth/decision.ts`
- Create: `lib/auth/decision.test.ts`
- Modify: `lib/auth/rbac.ts`
- Modify: `lib/auth/rbac.test.ts`

**Interfaces:**
- Produces: `PermissionKey`, `GlobalPermissionKey`, `BacklogPermissionKey`, `permissionDefinition(key)`, `evaluatePermission(input)`.
- Produces: legacy `Role` only for Better Auth session compatibility; it no longer answers backlog authorization.

- [ ] **Step 1: Write failing catalogue tests**

```ts
import { describe, expect, it } from "vitest";
import {
  BACKLOG_PERMISSION_KEYS,
  GLOBAL_PERMISSION_KEYS,
  permissionDefinition,
} from "@/lib/auth/permissions";

describe("permission catalogue", () => {
  it("keeps release management backlog-scoped and browse-gated", () => {
    expect(BACKLOG_PERMISSION_KEYS).toContain("manage_releases");
    expect(permissionDefinition("manage_releases")).toEqual({
      key: "manage_releases",
      label: "Gérer les releases",
      scope: "backlog",
      prerequisite: "browse_backlog",
    });
  });

  it("keeps bulk change global", () => {
    expect(GLOBAL_PERMISSION_KEYS).toContain("bulk_change_items");
    expect(permissionDefinition("bulk_change_items").scope).toBe("global");
  });

  it("rejects an unknown stored key", () => {
    expect(() => permissionDefinition("unknown_permission")).toThrow(
      "Permission inconnue.",
    );
  });
});
```

- [ ] **Step 2: Run the catalogue test and confirm RED**

Run: `pnpm exec vitest run lib/auth/permissions.test.ts`

Expected: FAIL because `@/lib/auth/permissions` does not exist.

- [ ] **Step 3: Implement the typed catalogue**

Create immutable `GLOBAL_PERMISSION_DEFINITIONS` and
`BACKLOG_PERMISSION_DEFINITIONS` records containing every key and French label
from the approved spec. Derive key union types from the records and implement:

```ts
export function permissionDefinition(key: string): PermissionDefinition {
  const definition = PERMISSION_DEFINITIONS[key as PermissionKey];
  if (!definition) throw new Error("Permission inconnue.");
  return definition;
}
```

Every backlog key except `browse_backlog` has prerequisite
`browse_backlog`; global keys have no prerequisite.

- [ ] **Step 4: Run the catalogue test and confirm GREEN**

Run: `pnpm exec vitest run lib/auth/permissions.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing pure decision tests**

```ts
import { describe, expect, it } from "vitest";
import { evaluatePermission } from "@/lib/auth/decision";

describe("evaluatePermission", () => {
  it("allows additive role and group grants and explains both", () => {
    const decision = evaluatePermission({
      permission: "manage_sprints",
      scope: { type: "backlog", backlogId: "b1" },
      platformAdministrator: false,
      hasBrowse: true,
      matches: [
        { type: "group", id: "g1", label: "Scrum Masters" },
        { type: "project_role", id: "r1", label: "Responsable delivery" },
      ],
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasons.map((reason) => reason.type)).toEqual([
      "group_grant",
      "project_role_grant",
    ]);
  });

  it("fails closed when browse is missing", () => {
    expect(
      evaluatePermission({
        permission: "manage_releases",
        scope: { type: "backlog", backlogId: "b1" },
        platformAdministrator: false,
        hasBrowse: false,
        matches: [{ type: "user", id: "u1", label: "Ada" }],
      }),
    ).toMatchObject({
      allowed: false,
      reasons: [{ type: "missing_prerequisite", permission: "browse_backlog" }],
    });
  });

  it("explains the platform administrator bypass", () => {
    expect(
      evaluatePermission({
        permission: "manage_workflows",
        scope: { type: "backlog", backlogId: "b1" },
        platformAdministrator: true,
        hasBrowse: false,
        matches: [],
      }),
    ).toMatchObject({ allowed: true, reasons: [{ type: "platform_administrator" }] });
  });
});
```

- [ ] **Step 6: Run decision tests and confirm RED**

Run: `pnpm exec vitest run lib/auth/decision.test.ts`

Expected: FAIL because `evaluatePermission` does not exist.

- [ ] **Step 7: Implement pure evaluation with deterministic reasons**

Implement `PermissionReason`, `PermissionDecision`, `GrantMatch`, and
`evaluatePermission`. Sort matches by type order `user`, `group`,
`project_role`, `authenticated_user`, then label and ID. Administrator bypass
returns one reason; a missing browse prerequisite returns one blocking reason;
no match returns `no_matching_grant`.

- [ ] **Step 8: Remove legacy authorization helpers from active use**

Keep `ROLES` and `Role` for session compatibility. Mark `canWriteItems`,
`hasRole`, and `requireRole` deprecated in `lib/auth/rbac.ts`; do not delete
them until Task 6 proves no production import remains.

- [ ] **Step 9: Run focused tests and commit**

Run: `pnpm exec vitest run lib/auth/permissions.test.ts lib/auth/decision.test.ts lib/auth/rbac.test.ts`

Expected: PASS.

Commit:

```bash
git add lib/auth/permissions.ts lib/auth/permissions.test.ts lib/auth/decision.ts lib/auth/decision.test.ts lib/auth/rbac.ts lib/auth/rbac.test.ts
git commit -m "feat(auth): define permission catalogue and decisions"
```

---

### Task 2: Database model, constraints, and compatibility bootstrap

**Files:**
- Modify: `lib/db/schema/enums.ts`
- Modify: `lib/db/schema/domain.ts`
- Modify: `lib/db/schema/index.ts`
- Create: `lib/services/authorization-bootstrap.ts`
- Create: `lib/services/authorization-bootstrap.integration.test.ts`
- Create: `drizzle/0010_jira_permission_schemes.sql` through `pnpm db:generate`
- Modify: `drizzle/meta/_journal.json`
- Create: generated `drizzle/meta/0010_snapshot.json`

**Interfaces:**
- Produces tables `userGroups`, `groupMembers`, `projectRoles`, `backlogRoleActors`, `permissionSchemes`, `permissionGrants`, `backlogPermissionConfigs`, `securityAuditEvents`, `authorizationMigrations`.
- Produces `bootstrapAuthorizationModel()` and protected keys `platform-administrators`, `administrators`, `members`, `viewers`, `default-permission-scheme`.

- [ ] **Step 1: Write failing PostgreSQL bootstrap tests**

Guard the suite with `JIROO_RUN_DB_TESTS=1`, following existing integration
tests. Seed one admin, contributor, viewer, and two backlogs. Assert:

```ts
const first = await bootstrapAuthorizationModel();
const second = await bootstrapAuthorizationModel();

expect(first.migrated).toBe(true);
expect(second).toEqual({ migrated: false, reason: "already_completed" });
expect(await effectiveRoleKeys(adminId, backlogA.id)).toContain("administrators");
expect(await effectiveRoleKeys(contributorId, backlogA.id)).toContain("members");
expect(await effectiveRoleKeys(viewerId, backlogA.id)).toContain("viewers");
expect(await effectiveRoleKeys(contributorId, backlogB.id)).toContain("members");
```

Add tests that duplicate group membership and duplicate direct grant violate a
unique constraint, a role actor with both user and group violates a check, and
every backlog config has one scheme.

- [ ] **Step 2: Run bootstrap integration test and confirm RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/authorization-bootstrap.integration.test.ts`

Expected: FAIL because the schema and service do not exist.

- [ ] **Step 3: Add schema enums and tables**

Add PostgreSQL enums:

```ts
export const permissionScopeEnum = pgEnum("permission_scope", ["global", "backlog"]);
export const permissionPrincipalEnum = pgEnum("permission_principal", [
  "user",
  "group",
  "project_role",
  "authenticated_user",
]);
export const accessModeEnum = pgEnum("access_mode", ["simple", "advanced"]);
export const roleActorTypeEnum = pgEnum("role_actor_type", ["user", "group"]);
```

Add the nine tables from the spec with foreign keys, timestamps, checks ensuring
exactly one principal column matches its type, partial unique indexes for each
principal shape, `permission_schemes.version NOT NULL DEFAULT 1`, and one
`backlog_permission_configs` row per backlog using `backlog_id` as primary key.

- [ ] **Step 4: Generate and inspect migration SQL**

Run: `pnpm exec drizzle-kit generate --name jira_permission_schemes`

Expected: one new `0010` migration and snapshot. Inspect the SQL for every
foreign key, check, unique index, and `ON DELETE` behavior before running it.

- [ ] **Step 5: Implement idempotent bootstrap transaction**

`bootstrapAuthorizationModel()` must lock the migration key
`jira-permission-schemes-v1`, create protected groups/roles/default scheme,
insert catalogue grants, create a private scheme config for each backlog,
assign users based on legacy role, verify expected role occupancy, insert the
completion marker, and return the discriminated result. A failure rolls back
all created records.

- [ ] **Step 6: Run migration and integration tests**

Run:

```bash
pnpm db:migrate
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/authorization-bootstrap.integration.test.ts
```

Expected: migration succeeds; integration suite passes.

- [ ] **Step 7: Commit schema and bootstrap**

```bash
git add lib/db/schema lib/services/authorization-bootstrap.ts lib/services/authorization-bootstrap.integration.test.ts drizzle
git commit -m "feat(auth): persist permission schemes and migrated access"
```

---

### Task 3: Server-only authorization DAL and permission helper decisions

**Files:**
- Create: `lib/auth/authorization.ts`
- Create: `lib/auth/authorization.integration.test.ts`
- Create: `lib/auth/action-authorization.ts`
- Create: `lib/auth/action-authorization.integration.test.ts`
- Create: `lib/auth/accessible-backlogs.ts`
- Create: `lib/auth/accessible-backlogs.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 catalogue/decision types and Task 2 schema.
- Produces: `checkPermission({ actorId, permission, scope })`, `requirePermission(...)`, `explainPermission(...)`, `requireBacklogPermissionByKey(...)`, `requireItemPermission(...)`, `requireSprintPermission(...)`, `listAccessibleBacklogIds(userId)`, and browse-filtered backlog DTOs.

- [ ] **Step 1: Write failing resolver integration tests**

Cover direct user, group membership, direct group grant, user-in-role,
group-in-role, authenticated-user grant, multiple reasons, browse prerequisite,
unknown permission, scheme isolation across two backlogs, and bootstrap admin
bypass. The core assertion is:

```ts
await expect(
  checkPermission({
    actorId: specialist.id,
    permission: "manage_releases",
    scope: { type: "backlog", backlogId: backlogA.id },
  }),
).resolves.toMatchObject({
  allowed: true,
  permission: "manage_releases",
  reasons: [{ type: "project_role_grant", label: "Responsable delivery" }],
});

await expect(
  checkPermission({
    actorId: specialist.id,
    permission: "manage_releases",
    scope: { type: "backlog", backlogId: backlogB.id },
  }),
).resolves.toMatchObject({ allowed: false });
```

- [ ] **Step 2: Run resolver tests and confirm RED**

Run: `JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/auth/authorization.integration.test.ts`

Expected: FAIL because the DAL does not exist.

- [ ] **Step 3: Implement `server-only` resolver**

Start `authorization.ts`, `action-authorization.ts`, and
`accessible-backlogs.ts` with `import "server-only";`. Query minimal columns,
combine direct/group/role matches, call Task 1 pure evaluation, and throw typed
`PermissionDeniedError` or `ResourceNotFoundError` from `requirePermission`.
Do not cache across requests.

- [ ] **Step 4: Write failing ownership-resolution tests**

Prove an item/sprint/status ID is resolved to its stored backlog before
authorization and that a forged client backlog ID cannot redirect the check:

```ts
await expect(
  requireItemPermission({
    actorId: member.id,
    itemId: itemInA.id,
    permission: "edit_items",
  }),
).resolves.toMatchObject({ backlogId: backlogA.id, resourceId: itemInA.id });
```

The same actor must be rejected for an item in backlog B even if the request
also submits backlog A's key.

- [ ] **Step 5: Implement ownership helpers and accessible backlog reads**

Implement resolvers for backlog ID/key, item, sprint, status, and saved view.
Implement `listAccessibleBacklogIds` and `listAccessibleBacklogs` using SQL
`EXISTS` branches for direct, group, and role grants plus admin bypass. Do not
materialize forbidden backlogs before filtering.

- [ ] **Step 6: Run authorization integration suites and commit**

Run:

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/auth/authorization.integration.test.ts lib/auth/action-authorization.integration.test.ts lib/auth/accessible-backlogs.integration.test.ts
```

Expected: PASS.

```bash
git add lib/auth
git commit -m "feat(auth): resolve effective backlog permissions"
```

---

### Task 4: Transactional administration services and validation

**Files:**
- Create: `lib/validation/authorization.ts`
- Create: `lib/validation/authorization.test.ts`
- Create: `lib/services/authorization-admin.ts`
- Create: `lib/services/authorization-admin.integration.test.ts`
- Create: `app/actions/authorization.ts`
- Create: `app/actions/authorization.test.ts`

**Interfaces:**
- Consumes: Task 3 authorization DAL.
- Produces: group CRUD/membership, role CRUD/occupancy, scheme clone/grants/association/mode, security history, permission-helper query, and protected-invariant functions.

- [ ] **Step 1: Write failing Zod validation tests**

Assert trimmed names, 80-character limit, stable permission keys, exactly one
principal identifier, UUID validation, and positive integer scheme version:

```ts
expect(
  grantInput.parse({
    schemeId,
    permission: "manage_releases",
    principal: { type: "project_role", projectRoleId },
    expectedVersion: 3,
  }),
).toMatchObject({ permission: "manage_releases", expectedVersion: 3 });

expect(() => grantInput.parse({
  schemeId,
  permission: "not-real",
  principal: { type: "authenticated_user" },
  expectedVersion: 3,
})).toThrow();
```

- [ ] **Step 2: Run validation tests and confirm RED, then implement schemas**

Run: `pnpm exec vitest run lib/validation/authorization.test.ts`

Expected: FAIL before implementation, PASS after adding explicit schemas and
exported inferred input types.

- [ ] **Step 3: Write failing administration integration tests**

Cover:

- group create/add member/remove member/delete blockers;
- custom role create and backlog user/group occupancy;
- scheme clone preserving grants;
- add/remove grant increments version and records audit;
- stale `expectedVersion` rejects without mutation;
- shared-scheme affected-backlog list;
- scheme association atomic with audit;
- last platform administrator and last effective backlog administrator guards;
- switch back to Simple rejected for shared or non-representable schemes.

Use exact stale-write assertion:

```ts
await expect(
  addSchemeGrant({ ...grant, expectedVersion: 1 }, actorId),
).rejects.toThrow("Ce schéma a été modifié. Rechargez la page.");
expect(await readSchemeVersion(schemeId)).toBe(2);
```

- [ ] **Step 4: Implement transactional admin service**

Create one private `appendSecurityAuditEvent(tx, event)` helper. Every exported
write validates input, locks its mutable aggregate, checks invariants, mutates,
and writes an event in the same transaction. Return explicit DTOs rather than
Drizzle rows with internal columns.

- [ ] **Step 5: Write failing Server Action authorization tests**

Mock only session and service boundaries. Prove global administration actions
require `manage_users_groups`, backlog access actions require
`manage_members`, scheme association requires `administer_backlog`, and the
permission helper requires `administer_backlog` or `administer_jiroo`. Creating
groups requires `manage_users_groups`; changing a global permission grant
requires `administer_jiroo`, so a group manager cannot escalate their own
privileges. Every mutating action authorized through the platform-
administrator bypass appends a `platform_administrator_bypass` event in the
authorization DAL before the domain service is invoked, with the same request
correlation ID used by the subsequent audit event. A failed domain mutation
therefore still records that elevated authorization was attempted.

- [ ] **Step 6: Implement safe Server Actions**

Each action derives `actorId` from `getSession()`, calls the permission DAL
before the service, maps `PermissionDeniedError` to:

```ts
{ ok: false as const, error: "Vous n’avez pas la permission « Gérer les membres » pour ce backlog." }
```

Map stale versions and protected-invariant errors verbatim; map unknown errors
to a generic French message. Revalidate `/admin`, affected
`/b/${backlogKey}` paths,
`/`, `/mine`, and `/trash` after access changes.

- [ ] **Step 7: Run administration suites and commit**

Run:

```bash
pnpm exec vitest run lib/validation/authorization.test.ts app/actions/authorization.test.ts
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/authorization-admin.integration.test.ts
```

Expected: PASS.

```bash
git add lib/validation/authorization.ts lib/validation/authorization.test.ts lib/services/authorization-admin.ts lib/services/authorization-admin.integration.test.ts app/actions/authorization.ts app/actions/authorization.test.ts
git commit -m "feat(auth): administer groups roles and schemes safely"
```

---

### Task 5: Migrate all mutation authorization to permission combinations

**Files:**
- Modify and test: `app/actions/backlogs.ts`, `app/actions/backlogs.test.ts`
- Modify and test: `app/actions/items.ts`, `app/actions/items.test.ts`
- Modify and test: `app/actions/sprints.ts`, `app/actions/sprints.test.ts`
- Modify and test: `app/actions/statuses.ts`, `app/actions/statuses.test.ts`
- Modify and test: `app/actions/trash.ts`, `app/actions/trash.test.ts`
- Modify: `app/actions/comments.ts`, `app/actions/labels.ts`, `app/actions/links.ts`, `app/actions/refs.ts`, `app/actions/views.ts`, `app/actions/notifications.ts`, `app/actions/search.ts`
- Add focused action tests where a file has none.

**Interfaces:**
- Consumes: Task 3 ownership-aware authorization helpers.
- Produces: no `canWriteItems` or `requireRole` imports in production Server Actions.

- [ ] **Step 1: Add failing permission mapping tests before each action family**

Use table-driven tests with the stored resource ID and expected keys. The
required mapping is:

| Operation | Required permission(s) |
|---|---|
| create backlog | global `create_backlogs` |
| update/archive backlog | backlog `administer_backlog` |
| create item | `create_items`; plus `schedule_items` when `sprintId` is set |
| ordinary item update | `edit_items` plus `assign_items`, `transition_items`, or `schedule_items` when the changed field belongs to that capability |
| bulk item update | global `bulk_change_items` plus the matching backlog item permission for every patch |
| rank/reparent | `schedule_items` |
| soft delete | `delete_items` |
| restore/permanent trash | `restore_items` |
| create/edit lifecycle sprint | `manage_sprints` |
| assign/move sprint item | `schedule_items` |
| status CRUD/order/migration | `manage_workflows` |
| add/edit/delete comment | corresponding comment permission with ownership check |
| assign item | `assign_items`, and target user must have `assignable_user` |
| link/reference mutation | `link_items` |
| share backlog view | `manage_shared_views`; personal view changes remain owner-scoped plus browse |

For each family, first run the focused test and confirm it fails because the
legacy role helper was called or the new permission helper was not called.

- [ ] **Step 2: Implement action checks closest to the resource**

Replace client-trusted backlog checks with `requireItemPermission`,
`requireSprintPermission`, `requireStatusPermission`, or
`requireBacklogPermissionByKey`. Split `updateItemAction` permissions by actual
fields present. Perform authorization before calling mutation services and
preserve current structured domain errors.

- [ ] **Step 3: Add forged-input and combined-permission tests**

Prove a client cannot authorize an item from backlog B by submitting backlog
A's key, bulk permission alone does not allow edits, `manage_sprints` does not
allow sprint membership movement without `schedule_items`, and an assignee
without `assignable_user` is rejected.

- [ ] **Step 4: Run all Server Action tests**

Run: `pnpm exec vitest run app/actions`

Expected: PASS with no legacy authorization import in action files.

- [ ] **Step 5: Prove legacy production helpers are unused and commit**

Run:

```bash
rg -n "canWriteItems|requireRole\(|hasRole\(" app lib components --glob '!**/*.test.ts' --glob '!**/*.test.tsx'
```

Expected: no production authorization call site. Remove deprecated helper
exports if the result is empty, retain only `Role` and `ROLES` for Better Auth
compatibility, and rerun `pnpm exec vitest run lib/auth/rbac.test.ts`.

```bash
git add app/actions lib/auth/rbac.ts lib/auth/rbac.test.ts
git commit -m "refactor(auth): enforce permissions on every mutation"
```

---

### Task 6: Filter every read path by effective browse access

**Files:**
- Modify and test: `lib/services/backlogs.ts`, `lib/services/backlogs.integration.test.ts`
- Modify and test: `lib/services/search.ts`, `lib/services/search.integration.test.ts`
- Modify and test: `lib/services/shell.ts`, `lib/services/shell.integration.test.ts`
- Modify: `lib/services/items.ts`, `lib/services/views.ts`, `lib/services/notifications.ts`
- Modify: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/mine/page.tsx`, `app/(app)/trash/page.tsx`, `app/(app)/b/[key]/page.tsx`
- Modify: `components/items/backlog-view-content.tsx`
- Modify and test: `app/(app)/page.test.tsx`, `app/(app)/layout.test.tsx`, `components/shell/sidebar.test.tsx`, `components/shell/search-modal.test.tsx`

**Interfaces:**
- Consumes: `listAccessibleBacklogIds` and browse-filtered DAL reads.
- Produces: no forbidden backlog/item appears in navigation, counts, search, recents, notifications, views, mine, trash, or direct URL.

- [ ] **Step 1: Add failing PostgreSQL visibility tests**

Create two backlogs with disjoint browse grants. Assert each user's
`listBacklogsForUser`, shell counts, search, recents, shared views,
notifications, mine, and trash results contain only the accessible backlog.
Assert a platform administrator sees both.

- [ ] **Step 2: Run focused read suites and confirm RED**

Run:

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/backlogs.integration.test.ts lib/services/search.integration.test.ts lib/services/shell.integration.test.ts
```

Expected: FAIL because current queries return cross-backlog rows.

- [ ] **Step 3: Implement SQL-level access filters**

Pass authenticated `userId` into every cross-backlog read. Use accessible-ID
subqueries or joins before limits/order/counts. `getBacklogByKeyForUser`
returns `null` without browse access. Notification and recent-item queries must
drop inaccessible rows even when a stale client key or notification ID exists.

- [ ] **Step 4: Replace role-derived page capabilities**

In `BacklogViewContent`, resolve the backlog with browse access first, then
load a DTO of effective booleans:

```ts
type BacklogCapabilities = {
  createItems: boolean;
  editItems: boolean;
  transitionItems: boolean;
  scheduleItems: boolean;
  assignItems: boolean;
  manageSprints: boolean;
  manageWorkflow: boolean;
  manageMembers: boolean;
};
```

Pass only the booleans needed by each client component. Do not pass grant
records, group membership, or scheme details into ordinary product views.

- [ ] **Step 5: Run service and page/component tests and commit**

Run:

```bash
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/backlogs.integration.test.ts lib/services/search.integration.test.ts lib/services/shell.integration.test.ts
pnpm exec vitest run 'app/(app)' components/items components/shell
```

Expected: PASS.

```bash
git add lib/services 'app/(app)' components/items components/shell
git commit -m "feat(auth): hide inaccessible backlog data"
```

---

### Task 7: Capability-based product UI

**Files:**
- Modify and test: `components/items/item-backlog.tsx`, `components/items/item-backlog.test.tsx`
- Modify and test: `components/items/item-board.tsx`, `components/items/item-board.test.tsx`
- Modify and test: `components/items/item-list.tsx`, `components/items/item-list.test.tsx`
- Modify and test: `components/items/item-tree.tsx`, `components/items/item-tree.test.tsx`
- Modify and test: `components/items/item-detail-panel.tsx`, `components/items/item-detail-panel.test.tsx`
- Modify and test: `components/items/bulk-item-toolbar.tsx`, `components/items/bulk-item-toolbar.test.tsx`
- Modify and test: `components/sprints/sprint-section-header.tsx`, `components/sprints/sprint-section-header.test.tsx`
- Modify and test: `components/statuses/status-manager-dialog.tsx`, `components/statuses/status-manager-dialog.test.tsx`
- Modify and test: `components/shell/sidebar.tsx`, `components/shell/sidebar.test.tsx`
- Create: `lib/auth/capabilities.ts`
- Create: `lib/auth/capabilities.test.ts`

**Interfaces:**
- Consumes: Task 6 `BacklogCapabilities`.
- Produces: focused `ItemCapabilities`, `PlanningCapabilities`, and `WorkflowCapabilities` props with no global role prop.

- [ ] **Step 1: Write failing capability projection tests**

```ts
expect(projectBacklogCapabilities(permissionSet)).toEqual({
  items: { create: true, edit: true, transition: false, assign: false, delete: false },
  planning: { rank: true, assignSprint: true, manageSprints: false },
  workflow: { manage: false },
});
```

Run: `pnpm exec vitest run lib/auth/capabilities.test.ts`

Expected: FAIL before implementing the pure projection.

- [ ] **Step 2: Add failing component tests for specialized users**

Extend existing item, backlog, board, sprint, workflow, bulk-toolbar, sidebar,
and detail tests. Prove:

- a scheduler can rank and assign sprint without editing titles;
- a sprint manager can edit/start/complete sprints without editing items;
- a workflow manager sees `Colonnes` without global admin;
- a member without bulk global permission does not see bulk mutation controls;
- a reader still sees labels, points, statuses, and details without mutation
  affordances.

- [ ] **Step 3: Replace `canWrite` and `role === "admin"` UI branches**

Use narrow capability props. Preserve accessible names, disabled explanations,
optimistic feedback, and rollback behavior. Do not use one broad `canWrite`
boolean because it would collapse distinct Jira permissions.

- [ ] **Step 4: Run component suites and commit**

Run: `pnpm exec vitest run components lib/auth/capabilities.test.ts`

Expected: PASS.

```bash
git add components lib/auth/capabilities.ts lib/auth/capabilities.test.ts
git commit -m "feat(auth): render product actions by capability"
```

---

### Task 8: Simple and Advanced administration UI

**Files:**
- Modify: `app/(app)/admin/page.tsx`
- Modify: `components/admin/admin-tabs.tsx`
- Modify: `components/admin/user-admin.tsx`
- Create and test: `components/admin/group-admin.tsx`, `components/admin/group-admin.test.tsx`
- Create and test: `components/admin/global-permission-admin.tsx`, `components/admin/global-permission-admin.test.tsx`
- Create and test: `components/admin/project-role-admin.tsx`, `components/admin/project-role-admin.test.tsx`
- Create and test: `components/admin/permission-scheme-admin.tsx`, `components/admin/permission-scheme-admin.test.tsx`
- Create and test: `components/admin/access-admin.tsx`, `components/admin/access-admin.test.tsx`
- Create and test: `components/admin/permission-helper.tsx`, `components/admin/permission-helper.test.tsx`
- Modify: `components/admin/backlog-admin.tsx`
- Create and test: `app/(app)/b/[key]/settings/access/page.tsx`, `app/(app)/b/[key]/settings/access/page.test.tsx`

**Interfaces:**
- Consumes: Task 4 admin actions and safe DTOs.
- Produces: five admin tabs and per-backlog access administration.

- [ ] **Step 1: Add failing admin routing and visibility tests**

Update `AdminTab` to the exact union:

```ts
type AdminTab = "backlogs" | "users" | "groups" | "roles" | "schemes";
```

Test links, selected tab semantics, and keyboard focus. Separately prove that a
user with only `manage_members` reaches
`/b/DEMO/settings/access` but receives no global `/admin` navigation or data.

- [ ] **Step 2: Implement global admin tabs with safe server DTOs**

Load only the active tab's data in `app/(app)/admin/page.tsx`. Require the
corresponding global permission before reading. Keep global settings out of the
ordinary sidebar for unauthorized users.

Add a `Permissions globales` section to the Groups tab through
`GlobalPermissionAdmin`. Only `administer_jiroo` may add or remove global user
or group grants; `manage_users_groups` alone may manage group lifecycle and
membership but never global grants.

Remove the editable legacy `admin/contributor/viewer` selector from
`UserAdmin`. `createUserAction` always creates a Better Auth account with the
compatibility value `contributor`, which grants no backlog access. Access is
then assigned through groups and backlog roles. Existing raw `admin` accounts
remain bootstrap administrators but cannot be created through this legacy
field; additional platform administrators are granted `administer_jiroo`
through the protected platform-administrator group.

- [ ] **Step 3: Test and implement groups and roles**

Group UI supports create, rename, add/remove members, blocker details, and
delete confirmation. Role UI supports create, rename, description, protected
role labels, usage count, and deletion blockers. Every pending action exposes
`aria-busy`; every error uses `role="alert"` and preserves entered data.

- [ ] **Step 4: Test and implement scheme matrix**

Render permissions grouped by category and each grant as a removable chip.
Adding a grant uses a principal-type selector and searchable principal field.
Show scheme version, usage count, affected backlog names, clone action, and a
confirmation before shared edits. On stale write, retain the dialog and show
`Ce schéma a été modifié. Rechargez la page.`

- [ ] **Step 5: Test and implement backlog Simple/Advanced access**

The backlog access route resolves `browse_backlog` and then requires either
`manage_members` or `administer_backlog`. Simple mode renders user/group rows
with protected-role selectors. Advanced
mode exposes role occupants, current scheme, scheme change, and the matrix
link. A failed switch back to Simple lists the exact blockers. Removing the
last effective administrator is disabled with an accessible explanation and
still rejected by the action if forged.

- [ ] **Step 6: Test and implement Permission Helper**

Inputs: user, backlog, permission. Result heading is `Autorisé` or `Refusé` and
reasons use business labels only. Include direct user, group, role,
authenticated-user, missing browse, no grant, and platform administrator
messages. Never display raw database UUIDs.

- [ ] **Step 7: Run admin tests and commit**

Run: `pnpm exec vitest run components/admin 'app/(app)/admin' 'app/(app)/b/[key]/settings/access'`

Expected: PASS.

```bash
git add 'app/(app)/admin' 'app/(app)/b/[key]/settings/access' components/admin
git commit -m "feat(admin): manage Jira-like access schemes"
```

---

### Task 9: Real multi-user Playwright matrix and audit evidence

**Files:**
- Modify: `e2e/global.setup.ts`
- Create: `e2e/permission-schemes.spec.ts`
- Modify: `playwright.config.ts` only if additional named storage states are required.
- Modify: `audit/README.md`
- Modify: `audit/roadmap.md`
- Modify: `audit/bugs.md`
- Modify: `audit/ux.md`
- Modify: `audit/benchmark.md`
- Create evidence under `audit/console/`, `audit/network/`, and `audit/screenshots/`.

**Interfaces:**
- Consumes: completed authorization feature.
- Produces: replayable browser proof and updated audit history.

- [ ] **Step 1: Extend real account setup**

Create storage states for platform administrator, member, specialist, reader,
and no-access user. After schema bootstrap, assign roles/groups through service
fixtures, not by changing browser-visible state. Keep 2FA enrollment complete
for every account.

- [ ] **Step 2: Write the Playwright scenarios before relying on them**

Implement scenarios matching all ten acceptance cases in the spec. Each test
registers `page.on("console")`, `page.on("pageerror")`, and response/request
failure listeners, writes explicit operation timings, and fails on unexpected
HTTP 4xx/5xx or JavaScript errors.

Required browser flows:

1. group + custom role + cloned scheme creation;
2. role grant and group occupancy isolated to one backlog;
3. direct/group/role Permission Helper explanations;
4. reader forged Server Action rejection;
5. specialist sprint controls without item/workflow controls;
6. future release manager permission visible in helper but no phantom release UI;
7. browse removal from navigation, search, recents, notifications, and URL;
8. stale shared-scheme conflict and recovery;
9. immutable security history;
10. reload and second-user persistence.

- [ ] **Step 3: Run Playwright and investigate every failure systematically**

Run: `pnpm test:e2e -- e2e/permission-schemes.spec.ts --project=chromium`

Expected: all scenarios pass. For each discovered defect, add a unique
`BUG-JIR-###` entry, reproduction, obtained/expected result, severity, priority,
user/business impact, screenshot, and cause hypothesis before fixing it with a
new failing test.

- [ ] **Step 4: Run the existing Chromium regression matrix**

Run: `pnpm test:e2e -- --project=chromium`

Expected: existing backlog, board, ranking, and sprint scenarios still pass
under migrated permissions.

- [ ] **Step 5: Update audit documents**

Record what was tested, what remains, Jira comparison, performance timings,
console/network evidence, permission coverage, completed/incomplete/missing
features, and the next three priorities. Do not raise the global score without
browser evidence.

- [ ] **Step 6: Commit browser evidence and audit**

```bash
git add e2e playwright.config.ts audit
git commit -m "test(auth): prove permission schemes in Chromium"
```

---

### Task 10: Full verification, review, PR, and merge

**Files:**
- Modify only files required by verified failures or review findings.

**Interfaces:**
- Produces: one reviewed and merged permission-system PR, leaving `main` clean for Releases/Versions.

- [ ] **Step 1: Run fresh complete verification**

Run each command and read its full output:

```bash
pnpm test
JIROO_RUN_DB_TESTS=1 pnpm exec vitest run lib/services/*.integration.test.ts lib/auth/*.integration.test.ts
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e -- --project=chromium
git diff --check origin/main...HEAD
git status --short --branch
```

Expected: zero failures, zero lint/type/build errors, clean diff check, and only
intentional committed changes.

- [ ] **Step 2: Review requirements line by line**

Compare every goal, non-goal, permission, migration invariant, administration
flow, security rule, and Playwright acceptance item in
`docs/superpowers/specs/2026-08-06-jiroo-unified-permission-schemes-design.md`
against code and evidence. Add a failing test and fix any uncovered gap before
continuing.

- [ ] **Step 3: Request independent code review**

Use `superpowers:requesting-code-review` with base SHA `14a828b` and current
HEAD. Fix every Critical and Important finding through TDD, then rerun the full
verification commands affected by each fix.

- [ ] **Step 4: Push and open the authorized PR**

```bash
git push -u origin feat/jira-permission-schemes
gh pr create --base main --head feat/jira-permission-schemes --title "feat(auth): add Jira-like permission schemes" --body-file /tmp/jiroo-permission-schemes-pr-body.md
```

The PR body must summarize model, migration safety, permission matrix,
Playwright evidence, audit changes, and exact verification results. Create the
body file with `apply_patch`, not shell redirection.

- [ ] **Step 5: Verify checks and merge as already authorized**

Run `gh pr checks --watch`. When every required check is green, run
`gh pr merge --merge --delete-branch`. Then switch to `main`, pull
fast-forward, and run `git status --short --branch` plus `git log -3 --oneline`
to prove the merged state.

- [ ] **Step 6: Stop at the incremental audit gate**

Report tested scope, remaining scope, and three absolute next priorities. Wait
for user validation before beginning Releases/Versions, as required by the
incremental audit methodology.
