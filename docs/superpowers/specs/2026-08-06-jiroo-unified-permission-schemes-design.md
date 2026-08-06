# Jiroo Unified Permission Schemes Design

**Date:** 2026-08-06

**Status:** Approved in conversation

**Product objective:** reach Jira company-managed permission granularity without
maintaining a second authorization engine for a simplified project mode.

## Context

Jiroo currently stores one global `admin`, `contributor`, or `viewer` role on
each account. Most write actions allow administrators and contributors and
reject viewers, while a smaller set of configuration actions requires the
global administrator role. The same account therefore has the same access to
every backlog.

This is insufficient for releases. Jira separates site-wide permissions from
space permissions and uses reusable permission schemes whose grants can target
users, groups, or space roles. Space-role membership is specific to each space.
Jiroo will adopt that structure before implementing Releases/Versions so that
release administration does not depend on another hard-coded role check.

References:

- https://support.atlassian.com/jira-cloud-administration/docs/types-of-permissions-in-jira/
- https://support.atlassian.com/jira-cloud-administration/docs/permissions-for-company-managed-projects/
- https://support.atlassian.com/jira/kb/grant-access-to-single-jira-project-that-uses-a-shared-permission-scheme/

## Goals

1. Give every backlog exactly one reusable permission scheme.
2. Resolve permissions from direct users, global groups, and backlog-specific
   role memberships.
3. Provide global groups and customizable project roles.
4. Offer Simple and Advanced administration over the same stored model.
5. Migrate every existing account without silently removing current access.
6. Enforce permissions in server queries and mutations, not only in React.
7. Provide an explanation of every effective permission decision.
8. Record an immutable security audit trail.
9. Establish `manage_releases` before Releases/Versions is implemented.

## Non-goals

- Jiroo will not maintain separate team-managed and company-managed
  authorization engines.
- This increment does not implement Releases/Versions, issue-level security,
  field-level security, anonymous public access, organization provisioning,
  SSO group synchronization, or SCIM.
- It does not create permissions for attachments, work logs, votes, or other
  product capabilities that Jiroo does not have.
- It does not add explicit deny rules. Grants remain additive, like Jira
  permission schemes.

## Product model

### One engine, two administration modes

Simple mode exposes backlog members with three protected roles:
`Administrateur`, `Membre`, and `Lecteur`. Each simple backlog uses the same
permission model as Advanced mode; the UI hides scheme and grant details.

Advanced mode exposes groups, project roles, reusable permission schemes,
permission grants, and the scheme associated with each backlog. Switching from
Simple to Advanced reveals existing records without transforming or copying
authorization data. A backlog may return to Simple mode only when its effective
configuration can be represented by the three protected roles and its scheme
is not shared. Otherwise the UI explains which advanced configuration prevents
the switch.

### Principals

A permission grant targets exactly one of:

- an individual user;
- a global group;
- a project role;
- any authenticated Jiroo user.

Groups contain users globally. Project roles are reusable definitions, while
their user and group occupants are assigned separately for each backlog. A
user may receive the same permission through several paths. The resolver
returns all matching paths for explanation but treats one match as sufficient.

### Global administrator

The current `admin` account role becomes the bootstrap platform-administrator
capability. Platform administrators bypass backlog permission schemes so that
configuration errors cannot make the instance unrecoverable. This bypass is
always included in permission explanations and every use is auditable. The
legacy `contributor` and `viewer` values cease to authorize backlog operations
after migration.

## Permission catalogue

Permission keys are stable lowercase identifiers stored by key, not a database
enum. Application code owns the catalogue so a deployment may add a permission
without rewriting existing grants. Unknown or retired keys are rejected by
write services and displayed as configuration errors if found in stored data.

### Global permissions

| Key | Capability |
|---|---|
| `administer_jiroo` | Configure the instance and bypass backlog schemes |
| `manage_users_groups` | Create users and manage global groups |
| `create_backlogs` | Create a backlog |
| `bulk_change_items` | Use transactional bulk item mutations, in addition to backlog permissions |
| `browse_users` | Use people pickers and user search |
| `share_global_views` | Publish a view outside one backlog |

Global permissions are granted to groups or users. The protected platform
administrator group holds all global permissions. At least one active account
must retain `administer_jiroo`.

### Backlog permissions

| Key | Capability |
|---|---|
| `browse_backlog` | See the backlog and its items |
| `administer_backlog` | Edit backlog details and advanced settings |
| `manage_members` | Assign users and groups to backlog roles |
| `manage_workflows` | Create, reorder, migrate, and delete statuses |
| `manage_sprints` | Create, edit, start, and complete sprints |
| `manage_releases` | Create, edit, order, release, archive, merge, and delete versions |
| `create_items` | Create items |
| `edit_items` | Edit ordinary item fields, estimates, and future Fix versions |
| `delete_items` | Soft-delete items |
| `restore_items` | Restore or permanently dispose of deleted items |
| `transition_items` | Change item status |
| `schedule_items` | Rank items and assign, move, or remove sprint membership |
| `assign_items` | Change assignee |
| `assignable_user` | Appear as an assignee candidate in this backlog |
| `add_comments` | Add comments |
| `edit_own_comments` | Edit comments authored by the current user |
| `delete_own_comments` | Delete comments authored by the current user |
| `delete_all_comments` | Delete another user's comment |
| `link_items` | Add or remove item links and development references |
| `manage_shared_views` | Create, change, or delete backlog-shared views |

`browse_backlog` is a prerequisite for every other backlog permission. A grant
without effective browse permission is stored and shown by the permission
helper but does not authorize the action. This makes a temporarily incomplete
scheme diagnosable without creating a hidden access path.

Combined operations require every relevant permission. For example, a bulk
Fix-version change requires global `bulk_change_items`, backlog
`browse_backlog`, and backlog `edit_items`. Cross-backlog item operations must
pass the required checks independently for both backlogs.

## Default configuration

Three protected project roles are created:

- `Administrateur`: every backlog permission;
- `Membre`: browse, create, edit, transition, schedule, assign, be assignable,
  add comments, manage own comments, and link items;
- `Lecteur`: browse only.

Protected roles may be renamed only through their translated display label,
may not be deleted, and keep stable keys. Their grants may be customized in
Advanced mode.

The default permission scheme grants permissions only through these roles. A
new backlog receives a private clone of the default scheme, starts in Simple
mode, and assigns its creator to `Administrateur`. It does not automatically
become visible to every existing account.

## Migration

The migration creates the protected roles, default scheme, global permission
records, and security-audit storage before changing authorization reads.

For every existing backlog:

1. create or attach a private default scheme;
2. assign every current global administrator to `Administrateur`;
3. assign every current contributor to `Membre`;
4. assign every current viewer to `Lecteur`;
5. verify that every active account has the same or broader effective access
   than before;
6. only then enable scheme-based enforcement for that backlog.

Existing administrators populate the protected platform-administrator group.
Existing contributors and viewers receive no global authorization from their
legacy role after the cutover. New accounts have no backlog access until they
are added directly, through a group, or through an authenticated-user grant.

The cutover is idempotent. It records a completion marker and aborts rather
than partially enabling the new resolver if any backlog fails equivalence
verification.

## Data model

The implementation adds focused tables with foreign keys and uniqueness
constraints:

- `groups` and `group_members` for global membership;
- `project_roles` for reusable role definitions;
- `backlog_role_actors` for a user or group occupying a role in one backlog;
- `permission_schemes` for reusable scheme metadata and optimistic version;
- `permission_grants` for global or scheme-scoped permission-to-principal
  mappings;
- `backlog_permission_configs` for one scheme and one UI mode per backlog;
- `security_audit_events` for immutable administrative events;
- `authorization_migrations` for the idempotent cutover marker.

Polymorphic principals use an explicit principal type plus nullable foreign-key
columns guarded by database checks so exactly one valid target is present.
Global grants cannot target project roles. Scheme grants can target users,
groups, project roles, or authenticated users. Duplicate grants are prevented
by unique indexes.

Deleting a user removes direct grants and memberships but retains audit actor
labels. Deleting a group is blocked while it occupies a project role or owns a
grant unless the administrator reviews the affected access. A project role or
scheme in use cannot be deleted. Shared schemes are edited in place only after
the UI lists every affected backlog; cloning is the safe default.

## Authorization service

Authorization has one public boundary:

```ts
type PermissionDecision = {
  allowed: boolean;
  permission: PermissionKey;
  scope: { type: "global" } | { type: "backlog"; backlogId: string };
  reasons: PermissionReason[];
};

checkPermission(input): Promise<PermissionDecision>;
requirePermission(input): Promise<PermissionDecision>;
```

The resolver:

1. validates the requested catalogue key and scope;
2. identifies the authenticated account server-side;
3. applies the platform-administrator bypass when appropriate;
4. loads direct and group grants;
5. for backlog scope, loads the configured scheme and role occupancy;
6. enforces `browse_backlog` as a prerequisite;
7. returns every matching or blocking reason in deterministic order.

Request-local memoization may avoid duplicate reads during one render or
mutation. Authorization results are never persisted in the browser and are not
cached across requests. Mutations revalidate every affected route.

Lists, search, recent items, notifications, and direct item lookup constrain
their SQL query to backlogs with effective browse access. They must not fetch
all rows and filter them after materialization.

## Server enforcement and errors

Every Server Action resolves the resource and its backlog from the database
before authorizing. Client-supplied role, permission, backlog ownership, and
actor identifiers are ignored.

An unreadable backlog or item produces a not-found response so its existence is
not disclosed. An authenticated user who can browse the backlog but lacks an
action permission receives a structured forbidden result containing a safe
French message and the missing permission label. Internal grant details are
available only through the permission helper to users with
`administer_backlog` or `administer_jiroo`.

Administrative mutations use transactions. Shared-scheme updates compare the
submitted scheme version with the stored version and reject stale writes with
an explicit reload message. Changing the scheme attached to a backlog and
writing its audit event are atomic.

## Administration UX

Global administration adds `Utilisateurs`, `Groupes`, `Rôles de projet`, and
`Schémas de permissions`. Backlog settings add `Accès`.

Simple mode presents people and groups with the three protected roles. Advanced
mode presents:

- the associated scheme and whether it is shared;
- clone and change-scheme actions;
- a permission matrix with grants by user, group, role, or authenticated user;
- role occupants for the current backlog;
- the affected backlog list before a shared edit;
- security history.

The permission helper accepts a user, backlog, and permission. It states
allowed or refused and lists paths such as direct user grant, membership in a
group, membership in a project role, missing browse prerequisite, or platform
administrator bypass.

The UI prevents removal of the last effective backlog administrator and the
last platform administrator. It does not hide a server rejection behind a
generic toast. Controls disappear when a user cannot perform an action, while
read-only data remains understandable. A backlog without effective browse
permission disappears from navigation, search, recents, and notifications.

## Security audit events

Events cover group lifecycle and membership, project-role lifecycle and
occupancy, scheme lifecycle, grant changes, scheme association, mode changes,
and protected-administrator changes. Each event stores:

- immutable event ID and timestamp;
- actor ID when the account still exists plus an actor label snapshot;
- action key and scope;
- target type and stable target ID;
- normalized old and new values;
- request correlation ID.

Secrets, session tokens, passwords, and raw request bodies are never stored.

## Testing and browser acceptance

### Unit tests

- catalogue scope and prerequisite rules;
- direct, group, role, authenticated-user, and administrator-bypass decisions;
- additive grants and deterministic explanations;
- Simple-mode representability;
- protected administrator and role invariants.

### PostgreSQL integration tests

- constraints and duplicate prevention;
- role occupancy through users and groups;
- shared schemes across two backlogs;
- access removal isolated to the intended backlog;
- transactional scheme association and audit event;
- concurrent scheme edit rejection;
- deletion blockers and rollback;
- idempotent migration and per-user access-equivalence proof.

### Server Action tests

- every current action maps to its declared permission combination;
- forged backlog, user, role, and principal IDs fail safely;
- unreadable resources do not disclose existence;
- global bulk permission never bypasses backlog item permissions.

### Playwright acceptance

Using real accounts and PostgreSQL data:

1. create a group and custom role;
2. clone a scheme and grant selected permissions to the role;
3. attach the scheme to one backlog and assign the group to the role;
4. prove a member gains access there but not in a second backlog;
5. prove direct user, group, and role grants are all explained correctly;
6. prove a reader cannot forge mutations through direct requests;
7. prove a specialized sprint or release manager sees only authorized actions;
8. remove browse access and verify navigation, search, recents, notifications,
   and direct URL behavior;
9. trigger and recover from a stale shared-scheme edit;
10. verify security history and persistence after reload and in a second user
    context.

Every scenario records JavaScript console output, failed network requests, HTTP
errors, operation timings, and a screenshot for each detected defect. The
permission feature is not complete until console and unexpected network errors
are clean and the audit documents are updated.

## Delivery boundaries

This permission system is one audited product increment and precedes
Releases/Versions. Its implementation may use several commits, but it lands as
one pull request because partial authorization migration would create two
conflicting security models.

After merge, the next pull request implements Releases/Versions with multiple
Fix versions per item, `manage_releases` lifecycle authorization, `edit_items`
assignment authorization, publication handling for unfinished items, progress,
history, and Playwright evidence.
