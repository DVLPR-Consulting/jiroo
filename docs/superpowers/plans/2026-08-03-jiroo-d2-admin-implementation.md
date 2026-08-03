# Jiroo D2 Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the administration area with backlog-key renaming, user creation, and persisted role management matching the Jiroo handoff.

**Architecture:** Keep `/admin` as a protected Server Component that loads both datasets, then delegate interactions to focused client components. Backlog-key changes run in one Drizzle transaction, lock the backlog and its items, rewrite every item key, and add an activity row per changed item. User mutations continue through better-auth and the existing RBAC-guarded Server Actions.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Drizzle ORM/Postgres, better-auth 1.6, Zod 4, Radix/shadcn primitives, Vitest.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` and `node_modules/next/dist/docs/01-app/02-guides/authentication.md` before editing Server Actions or auth code.
- French UI copy; roles are stored as `admin | contributor | viewer`.
- Never trust role or identity values supplied by the client.
- Preserve the current admin's session when creating another user.
- A backlog-key change updates live and soft-deleted item keys atomically and audits every changed item.
- Old URLs containing the previous backlog or item key are intentionally invalid after confirmation.
- Follow TDD and commit each task independently.

---

## File Structure

- `lib/items/backlog-key.ts`: pure planning of old-to-new item-key rewrites.
- `lib/items/backlog-key.test.ts`: key rewrite and collision-independent validation tests.
- `lib/validation/backlog.ts`: accepts the normalized key on backlog updates.
- `lib/validation/backlog.test.ts`: update-schema coverage.
- `lib/services/backlogs.ts`: transactional backlog and item-key update.
- `app/actions/backlogs.ts`: admin identity propagation and French error mapping.
- `lib/items/users.ts`: admin-user validation and role labels.
- `lib/items/users.test.ts`: validation regression coverage.
- `lib/services/users.ts`: list/create/update persistence and missing-user guards.
- `app/actions/users.ts`: admin-only actions and self-demotion guard.
- `components/admin/admin-tabs.tsx`: accessible Backlogs/Users tab state.
- `components/admin/user-admin.tsx`: user list and inline role controls.
- `components/admin/user-create-dialog.tsx`: controlled create-user form.
- `components/admin/backlog-admin.tsx`: editable backlog key with confirmation.
- `app/(app)/admin/page.tsx`: protected data loading and page composition.

### Task 1: Backlog-key rewrite core and validation

**Files:**
- Create: `lib/items/backlog-key.ts`
- Create: `lib/items/backlog-key.test.ts`
- Modify: `lib/validation/backlog.ts`
- Modify: `lib/validation/backlog.test.ts`

**Interfaces:**
- Produces: `planItemKeyRewrite(rows, currentBacklogKey, newBacklogKey): Array<{ id: string; oldKey: string; newKey: string }>`.
- Produces: `updateBacklogSchema` data `{ id, key, name, color }` with uppercase key.

- [ ] **Step 1: Write failing pure tests**

```ts
import { describe, expect, it } from "vitest";
import { planItemKeyRewrite } from "./backlog-key";

describe("planItemKeyRewrite", () => {
  it("preserves numeric suffixes for live and deleted rows", () => {
    expect(planItemKeyRewrite([
      { id: "1", key: "CASS-12" },
      { id: "2", key: "CASS-1042" },
    ], "CASS", "PEN")).toEqual([
      { id: "1", oldKey: "CASS-12", newKey: "PEN-12" },
      { id: "2", oldKey: "CASS-1042", newKey: "PEN-1042" },
    ]);
  });

  it("rejects malformed persisted keys instead of guessing", () => {
    expect(() => planItemKeyRewrite([{ id: "1", key: "bad" }], "CASS", "PEN"))
      .toThrow("Clé d’item invalide: bad");
  });
});
```

Add update-schema tests proving `cass` becomes `CASS` and a key containing digits is rejected.

- [ ] **Step 2: Run the targeted tests and confirm RED**

Run: `pnpm test -- lib/items/backlog-key.test.ts lib/validation/backlog.test.ts`

Expected: FAIL because `planItemKeyRewrite` does not exist and `updateBacklogSchema` does not accept `key`.

- [ ] **Step 3: Implement the pure rewrite and update schema**

```ts
const ITEM_KEY_RE = /^[A-Z]{2,6}-(\d+)$/;

export function planItemKeyRewrite(
  rows: Array<{ id: string; key: string }>,
  currentBacklogKey: string,
  newBacklogKey: string,
) {
  if (currentBacklogKey === newBacklogKey) return [];
  return rows.map((row) => {
    const match = ITEM_KEY_RE.exec(row.key);
    if (!match) throw new Error(`Clé d’item invalide: ${row.key}`);
    return { id: row.id, oldKey: row.key, newKey: `${newBacklogKey}-${match[1]}` };
  });
}
```

Reuse the same transformed key schema in create and update validation so normalization cannot diverge.

- [ ] **Step 4: Run targeted tests and confirm GREEN**

Run: `pnpm test -- lib/items/backlog-key.test.ts lib/validation/backlog.test.ts`

Expected: both files pass.

- [ ] **Step 5: Commit the core**

```bash
git add lib/items/backlog-key.ts lib/items/backlog-key.test.ts lib/validation/backlog.ts lib/validation/backlog.test.ts
git commit -m "feat(admin): validate backlog key renames"
```

### Task 2: Transactional backlog-key rename

**Files:**
- Modify: `lib/items/backlog-key.test.ts`
- Modify: `lib/services/backlogs.ts`
- Modify: `app/actions/backlogs.ts`
- Modify: `components/admin/backlog-admin.tsx`

**Interfaces:**
- Consumes: `planItemKeyRewrite` and normalized `updateBacklogSchema`.
- Produces: `updateBacklog(input: unknown, actorId: string)` returning `{ backlog, previousKey }` or `null`.
- Produces: `updateBacklogAction({ id, key, name, color })` with `{ ok, error? }`.

- [ ] **Step 1: Lock the pure helper contract before database work**

Extend `lib/items/backlog-key.test.ts` with a regression test showing an unchanged prefix returns an empty rewrite list:

```ts
expect(planItemKeyRewrite([{ id: "1", key: "CASS-12" }], "CASS", "CASS"))
  .toEqual([]);
```

- [ ] **Step 2: Run the regression test before database work**

Run: `pnpm test -- lib/items/backlog-key.test.ts`

Expected: PASS because Task 1 already defines the three-argument helper contract.

- [ ] **Step 3: Implement the Drizzle transaction**

In `updateBacklog`:

1. parse input;
2. start `db.transaction`;
3. select the backlog with `.for("update")`;
4. select every `{ id, key }` item for its `backlogId` with `.for("update")`, without a deleted filter;
5. derive rewrites;
6. update the backlog key/name/color;
7. update each item key and insert an `activities` row `{ action: "update", field: "key", oldValue, newValue, actorId }`;
8. return `{ backlog: updatedBacklog, previousKey: current.key }`.

Do not catch unique violations inside the transaction. Let Postgres roll back every row, then map code `23505` in the action to `Cette clé est déjà utilisée.`. Map malformed data to `Modification impossible.`.

- [ ] **Step 4: Pass the authenticated admin id from the action**

Change `assertAdmin()` to return `session.user.id`, update the action input type to include `key`, and call `updateBacklog(input, adminId)`. Use the returned `previousKey` and `backlog.key` to revalidate `/admin`, `/`, `/mine`, `/trash`, and both old/new backlog paths after a successful key change.

- [ ] **Step 5: Make backlog key editable with explicit confirmation**

Remove `keyEditable={false}` for edit mode. When the submitted key differs, show a second confirmation view containing:

```tsx
<p>La clé et toutes les clés d’items seront renommées. Les anciens liens ne fonctionneront plus.</p>
```

Only invoke the action from the confirmation button. Surface `result.error` in the dialog and keep it open on failure.

- [ ] **Step 6: Verify the rename against local Postgres**

Run the app with the migrated/seeded local database, create an empty test backlog, create an item, soft-delete it, rename the backlog, then verify both live and deleted keys have the new prefix and the activity table contains the matching key updates. Rename it back before finishing.

- [ ] **Step 7: Run checks and commit**

Run: `pnpm test -- lib/items/backlog-key.test.ts lib/validation/backlog.test.ts && pnpm typecheck && pnpm lint`

```bash
git add lib/items/backlog-key.test.ts lib/items/backlog-key.ts lib/services/backlogs.ts app/actions/backlogs.ts components/admin/backlog-admin.tsx
git commit -m "feat(admin): rename backlog keys atomically"
```

### Task 3: Harden user services and actions

**Files:**
- Modify: `lib/items/users.ts`
- Modify: `lib/items/users.test.ts`
- Modify: `lib/services/users.ts`
- Modify: `app/actions/users.ts`

**Interfaces:**
- Produces: `listAdminUsers(): Promise<AdminUserRow[]>`.
- Produces: `setUserRole(userId: string, role: Role): Promise<AdminUserRow>` and throws `Utilisateur introuvable.` when no row changes.
- Produces: `createUser(input: unknown): Promise<AdminUserRow>` with normalized lowercase email.

- [ ] **Step 1: Add failing validation tests**

Add cases proving e-mail normalization and non-empty user ids:

```ts
expect(createUserInput.parse({ ...valid, email: " ADMIN@EXAMPLE.COM " }).email)
  .toBe("admin@example.com");
expect(setRoleInput.safeParse({ userId: "", role: "viewer" }).success).toBe(false);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm test -- lib/items/users.test.ts`

Expected: the lowercase and empty-id assertions fail.

- [ ] **Step 3: Implement normalization and persistence guards**

Use `.toLowerCase()` after trimming the e-mail and `.min(1)` for `userId`. Rename the admin listing to `listAdminUsers` to avoid collision with assignee `listUsers`. Make the role update use `.returning(...)`; throw when no row is returned. Keep `emailAndPassword.autoSignIn: false` and call `auth.api.signUpEmail` without request headers/response so the admin session cannot be replaced.

- [ ] **Step 4: Make action errors exhaustive and safe**

Map duplicate e-mail, invalid e-mail/name/role/password, missing user, and self-demotion to their exact French messages. Unknown failures return `Action impossible.`. Revalidate only `/admin` after success.

- [ ] **Step 5: Run checks and commit**

Run: `pnpm test -- lib/items/users.test.ts && pnpm typecheck && pnpm lint`

```bash
git add lib/items/users.ts lib/items/users.test.ts lib/services/users.ts app/actions/users.ts
git commit -m "fix(admin): harden user role management"
```

### Task 4: Build the user administration UI

**Files:**
- Create: `components/admin/admin-tabs.tsx`
- Create: `components/admin/user-admin.tsx`
- Create: `components/admin/user-admin.test.tsx`
- Create: `components/admin/user-create-dialog.tsx`
- Modify: `app/(app)/admin/page.tsx`

**Interfaces:**
- Consumes: `AdminUserRow`, `ROLE_LABELS`, `createUserAction`, `setUserRoleAction`.
- Produces: `<AdminTabs backlogs users currentUserId />`.

- [ ] **Step 1: Write failing component tests**

Create `components/admin/user-admin.test.tsx` covering:

```tsx
render(<UserAdmin users={users} currentUserId="admin-1" />);
expect(screen.getByText("marie@example.test")).toBeInTheDocument();
expect(screen.getByRole("combobox", { name: /rôle de Marie/i })).toBeDisabled();
await user.selectOptions(screen.getByRole("combobox", { name: /rôle de Thomas/i }), "viewer");
expect(setUserRoleAction).toHaveBeenCalledWith({ userId: "user-2", role: "viewer" });
```

Mock the action module with `vi.mock` and add a failure case asserting the old selected value is restored and the French error is shown.

- [ ] **Step 2: Run the component test and confirm RED**

Run: `pnpm test -- components/admin/user-admin.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement accessible tabs and user list**

`AdminTabs` renders two buttons with `role="tab"`, `aria-selected`, and corresponding `role="tabpanel"`. Default to Backlogs, but accept `?tab=users` links so refresh/share keeps the selected section. `UserAdmin` renders `InitialsAvatar`, name, e-mail, and a labelled native role select. Disable self-demotion choices for the current admin and disable all controls during the active transition.

- [ ] **Step 4: Implement the create-user dialog**

Use controlled fields for name, email, initial password, and role. Do not clear or close on failure. On success, close, reset, and show `Utilisateur créé.` through the existing toast API. Add `autoComplete="new-password"` and never render the password after submission.

- [ ] **Step 5: Wire the protected Server Component**

In `page.tsx`, retain the server-side admin redirect. Load `listBacklogs({ includeArchived: true })` and `listAdminUsers()` in `Promise.all`, then render the handoff heading, explanatory text, and `AdminTabs` with `session.user.id`.

- [ ] **Step 6: Run tests and static checks**

Run: `pnpm test -- components/admin/user-admin.test.tsx lib/items/users.test.ts lib/validation/backlog.test.ts lib/items/backlog-key.test.ts && pnpm typecheck && pnpm lint`

Expected: all pass.

- [ ] **Step 7: Commit the UI**

```bash
git add components/admin/admin-tabs.tsx components/admin/user-admin.tsx components/admin/user-admin.test.tsx components/admin/user-create-dialog.tsx app/'(app)'/admin/page.tsx
git commit -m "feat(admin): add users and roles interface"
```

### Task 5: D2 visual QA and full verification

**Files:**
- Modify if required: D2 files listed above only.

**Interfaces:**
- Produces: verified D2 delivery matching screens 14 and 15.

- [ ] **Step 1: Start the app and inspect `/admin`**

Verify Backlogs and Users tabs at desktop width against `14-admin-backlogs.png` and `15-admin-utilisateurs.png`, including dark theme, compact density, focus rings, long names/e-mails, empty users, pending controls, and error messages.

- [ ] **Step 2: Exercise the complete workflow**

Create a contributor, sign out, sign in as that contributor, confirm `/admin` redirects away, sign back in as admin, change the contributor to viewer, confirm self-demotion is blocked, and rename a backlog containing both live and deleted items.

- [ ] **Step 3: Run the full verification suite**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: 0 failures and a successful production build.

- [ ] **Step 4: Commit QA-only corrections**

If QA required changes, commit only those reviewed corrections:

```bash
git add app/actions/backlogs.ts app/actions/users.ts app/'(app)'/admin/page.tsx components/admin lib/items lib/services lib/validation
git commit -m "fix(admin): address D2 acceptance findings"
```

If no files changed, do not create an empty commit.
