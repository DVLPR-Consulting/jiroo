import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { and, eq, ilike, inArray, notExists, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogPermissionConfigs, backlogs, itemLinks, permissionGrants, permissionSchemes, projectRoles, statuses } from "@/lib/db/schema/domain";
import { LE_POINT_DEMO } from "@/lib/le-point/fixtures";

export class DemoSeedError extends Error {}

/** Check the actual target before importing any database or auth service. */
export function assertDemoSeedAllowed(env: Readonly<Record<string, string | undefined>>): void {
  if (env.JIROO_ALLOW_DEMO_SEED !== "1") {
    throw new DemoSeedError("Set JIROO_ALLOW_DEMO_SEED=1 to allow this local demo seed.");
  }
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch {
    throw new DemoSeedError("An explicit local PostgreSQL DATABASE_URL is required.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname.length < 2) {
    throw new DemoSeedError("An explicit local PostgreSQL DATABASE_URL is required (localhost or 127.0.0.1).");
  }
  // pg gives query.host precedence over URL.hostname: reject routing overrides.
  for (const key of ["host", "hostaddr", "port", "service"]) {
    if (url.searchParams.has(key)) throw new DemoSeedError("DATABASE_URL routing overrides are not allowed.");
  }
}

type ItemIdentity = { id: string; key: string };
export type DemoSeedResult = {
  backlogId: string;
  hiddenBacklogId: string;
  items: Record<string, ItemIdentity>;
  people: Record<string, { id: string; email: string; name: string; password: string }>;
};

/** Only these reserved namespaces are disposable; restore FK checks before live deletes. */
async function resetDemoNamespace(db: DB): Promise<void> {
  await db.transaction(async (tx) => {
    const owned = await tx.select({ id: backlogs.id }).from(backlogs)
      .where(inArray(backlogs.key, ["DEMO", "DEMOX"])).for("update");
    const ids = owned.map((row) => row.id);
    if (ids.length > 0) {
      // Immutable reports have no ordinary purge service. Local to this tx;
      // only history of the exact two locked backlogs is removed.
      await tx.execute(sql`set local session_replication_role = 'replica'`);
      for (const table of ["sprint_report_items", "sprint_report_snapshots", "sprint_events", "release_publication_items", "release_events", "release_publications"]) {
        await tx.execute(sql`delete from ${sql.identifier(table)} where backlog_id = any(${sql.param(ids)}::uuid[])`);
      }
      await tx.execute(sql`set local session_replication_role = 'origin'`);
      await tx.execute(sql`delete from releases where backlog_id = any(${sql.param(ids)}::uuid[])`);
      await tx.delete(backlogs).where(inArray(backlogs.id, ids));
      // Never remove a scheme now shared with a backlog outside the demo.
      await tx.delete(permissionSchemes).where(and(
        inArray(permissionSchemes.key, ids.map((id) => `backlog-${id}-permission-scheme`)),
        eq(permissionSchemes.protected, false),
        notExists(tx.select({ id: backlogPermissionConfigs.backlogId }).from(backlogPermissionConfigs)
          .where(eq(backlogPermissionConfigs.permissionSchemeId, permissionSchemes.id))),
      ));
    }
    // Foreign restrictive references fail and roll the entire reset back.
    await tx.delete(user).where(ilike(user.email, "%@demo.jiroo.local"));
  });
}

export async function seedDemoLePoint(options: { reset?: boolean } = {}): Promise<DemoSeedResult> {
  assertDemoSeedAllowed(process.env);
  const data = LE_POINT_DEMO;
  const hiddenCases = data.tickets.filter((ticket) => ticket.blockedBy?.some((blocker) => "hidden" in blocker));
  if (hiddenCases.length !== 1 || hiddenCases[0]?.key !== "DEMO-33") {
    throw new DemoSeedError("The approved SQL exception is limited to DEMO-33's hidden blocker.");
  }
  const { db, databasePool } = await import("@/lib/db");
  const [backlogService, userService, itemService, linkService, releaseService, sprintService, lifecycleService, commentService, authorizationService] = await Promise.all([
    import("@/lib/services/backlogs"), import("@/lib/services/users"), import("@/lib/services/items"),
    import("@/lib/services/links"), import("@/lib/services/releases"), import("@/lib/services/sprints"),
    import("@/lib/services/sprint-lifecycle"), import("@/lib/services/comments"), import("@/lib/services/authorization-admin"),
  ]);
  const lock = await databasePool.connect();
  try {
    await lock.query("select pg_advisory_lock(hashtext($1))", ["jiroo:demo-le-point-seed"]);
    const existing = await db.select({ id: backlogs.id }).from(backlogs).where(inArray(backlogs.key, ["DEMO", "DEMOX"]));
    const existingPeople = await db.select({ id: user.id }).from(user).where(ilike(user.email, "%@demo.jiroo.local"));
    if (!options.reset && (existing.length > 0 || existingPeople.length > 0)) {
      throw new DemoSeedError("DEMO, DEMOX or reserved demo accounts already exist. Use --reset to replace only that namespace.");
    }
    const administrators = await db.transaction(authorizationService.platformAdministratorIds);
    const storedUsers = await db.select({ id: user.id, email: user.email }).from(user);
    const operator = storedUsers.find((person) => administrators.has(person.id) && !person.email.toLowerCase().endsWith("@demo.jiroo.local"));
    if (!operator) throw new DemoSeedError("Bootstrap a Jiroo administrator outside @demo.jiroo.local first; this script never creates one.");
    const [members] = await db.select().from(projectRoles).where(eq(projectRoles.key, "members"));
    const [scheme] = await db.select().from(permissionSchemes).where(eq(permissionSchemes.key, "default-permission-scheme"));
    const grants = scheme ? await db.select().from(permissionGrants).where(eq(permissionGrants.permissionSchemeId, scheme.id)) : [];
    if (!members || grants.length === 0 || grants.some((grant) => grant.principalType !== "project_role") ||
        !["browse_backlog", "assignable_user"].every((key) => grants.some((grant) => grant.projectRoleId === members.id && grant.permissionKey === key))) {
      throw new DemoSeedError("Demo trials require role-based defaults with browse_backlog and assignable_user for members. Existing global policies are left unchanged.");
    }
    if (options.reset) await resetDemoNamespace(db);
    const backlog = await backlogService.createBacklog({ key: data.backlog.key, name: data.backlog.name, color: "#7c3030" }, operator.id);
    const hiddenBacklog = await backlogService.createBacklog({ key: "DEMOX", name: "DÉMO — Dépendance inaccessible", color: "#64748b" }, operator.id);
    const people: DemoSeedResult["people"] = {};
    for (const person of data.people) {
      const email = `${person.id}@demo.jiroo.local`;
      const password = randomBytes(24).toString("base64url");
      const created = await userService.createUser({ name: person.name, email, password });
      people[person.id] = { id: created.id, email, name: created.name, password };
      await authorizationService.assignBacklogRoleActor({ backlogId: backlog.id, projectRoleId: members.id, principal: { type: "user", userId: created.id } }, operator.id);
      if (!(await backlogService.getBacklogByKeyForUser(backlog.key, created.id)) || await backlogService.getBacklogByKeyForUser(hiddenBacklog.key, created.id)) {
        throw new DemoSeedError("The demo access boundary could not be established.");
      }
    }
    const personId = (id: string | null): string | null => {
      if (id === null) return null;
      const person = people[id];
      if (!person) throw new DemoSeedError(`Unknown fixture person: ${id}`);
      return person.id;
    };
    const releaseIds = new Map<string, string>();
    for (const release of data.releases) {
      const created = await releaseService.createRelease({ backlogId: backlog.id, name: release.name, targetDate: release.planned, driverId: personId(data.personas.product) }, operator.id, randomUUID());
      releaseIds.set(release.name, created.id);
    }
    const root = await itemService.createItem({ backlogId: backlog.id, type: "composant", title: "Démo" }, operator.id);
    const other = await itemService.createItem({ backlogId: backlog.id, type: "epic", parentId: root.id, title: "Autres travaux" }, operator.id);
    const itemMap: DemoSeedResult["items"] = {};
    const item = (key: string): ItemIdentity => {
      const found = itemMap[key];
      if (!found) throw new DemoSeedError(`Unknown fixture item: ${key}`);
      return found;
    };
    const versions = (release: string | null) => {
      if (!release) return [];
      const id = releaseIds.get(release);
      if (!id) throw new DemoSeedError(`Unknown fixture release: ${release}`);
      return [id];
    };
    for (const objective of data.objectives) {
      itemMap[objective.key] = await itemService.createItem({ backlogId: backlog.id, type: "epic", parentId: root.id, title: objective.title, dueDate: objective.due, fixVersionIds: versions(objective.release) }, operator.id);
    }
    const storedStatuses = await db.select().from(statuses).where(eq(statuses.backlogId, backlog.id));
    for (const ticket of data.tickets) {
      const status = storedStatuses.find((candidate) => candidate.name === ticket.status && candidate.category === ticket.category);
      if (!status) throw new DemoSeedError(`Unknown fixture status: ${ticket.status}`);
      const objective = data.objectives.find((candidate) => candidate.key === ticket.objective);
      itemMap[ticket.key] = await itemService.createItem({
        backlogId: backlog.id, type: "tache", parentId: ticket.objective ? item(ticket.objective).id : other.id,
        title: ticket.title, statusId: status.id, assigneeId: personId(ticket.assignee), dueDate: ticket.due,
        fixVersionIds: versions(objective?.release ?? null),
      }, operator.id);
    }
    for (const ticket of data.tickets) for (const blocker of ticket.blockedBy ?? []) {
      if ("key" in blocker) await linkService.addLink({ sourceId: item(blocker.key).id, targetId: item(ticket.key).id, type: "blocks" }, operator.id);
    }
    const hiddenRoot = await itemService.createItem({ backlogId: hiddenBacklog.id, type: "composant", title: "Démo inaccessible" }, operator.id);
    const hiddenEpic = await itemService.createItem({ backlogId: hiddenBacklog.id, type: "epic", parentId: hiddenRoot.id, title: "Travail inaccessible" }, operator.id);
    const hiddenItem = await itemService.createItem({ backlogId: hiddenBacklog.id, type: "tache", parentId: hiddenEpic.id, title: "Élément de démonstration inaccessible" }, operator.id);
    // Owner-approved exception: addLink deliberately rejects cross-backlog links.
    // This one fixed relation and its activity commit together; no service changes.
    await db.transaction(async (tx) => {
      await tx.insert(itemLinks).values({ sourceId: hiddenItem.id, targetId: item("DEMO-33").id, type: "blocks", createdBy: operator.id });
      await tx.insert(activities).values({ itemId: item("DEMO-33").id, actorId: operator.id, action: "update", field: "links", newValue: "Blocked by an inaccessible demo item", requestCorrelationId: randomUUID() });
    });
    for (const mention of data.mentions) {
      const body = mention.text.replace(/DEMO-\d+/g, (key) => item(key).key);
      await commentService.addComment({ itemId: item(mention.ticket).id, body, mentionIds: [personId(mention.mentioned)] }, personId(mention.author)!);
    }
    for (const release of data.releases) if (release.released) {
      const releaseId = releaseIds.get(release.name)!;
      const detail = await releaseService.getReleaseDetail(backlog.id, releaseId);
      if (!detail) throw new DemoSeedError("Created release not found.");
      await releaseService.publishRelease({ backlogId: backlog.id, releaseId, expectedRevision: detail.revision, expectedScopeRevision: detail.publicationScopeRevision, effectiveDate: release.released, incompleteDisposition: "keep" }, operator.id, randomUUID());
    }
    if (data.sprint) {
      const sprint = await sprintService.createSprint({ backlogId: backlog.id }, operator.id);
      await sprintService.assignItemsToSprint({ backlogId: backlog.id, sprintId: sprint.id, itemIds: data.tickets.map((ticket) => item(ticket.key).id) }, operator.id);
      await lifecycleService.startSprint({ id: sprint.id, backlogId: backlog.id, name: data.sprint.name, goal: null, startAt: `${data.sprint.start}T00:00:00.000Z`, endAt: `${data.sprint.end}T00:00:00.000Z`, capacityPoints: null }, operator.id);
    }
    return { backlogId: backlog.id, hiddenBacklogId: hiddenBacklog.id, items: itemMap, people };
  } finally {
    await lock.query("select pg_advisory_unlock(hashtext($1))", ["jiroo:demo-le-point-seed"]).catch(() => {});
    lock.release();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--reset")) throw new DemoSeedError("Usage: seed-demo-le-point.ts [--reset]");
  assertDemoSeedAllowed(process.env);
  const { databasePool } = await import("@/lib/db");
  try {
    const result = await seedDemoLePoint({ reset: args.includes("--reset") });
    console.log("Demo accounts (passwords printed once; enrol 2FA normally):");
    console.table(Object.values(result.people).map(({ name, email, password }) => ({ name, email, password })));
    console.log("Fixture keys → actual keys (the global sequence is never rewound):");
    console.table(Object.entries(result.items).map(([fixture, entry]) => ({ fixture, actual: entry.key })));
    console.log(`Reference calendar: ${LE_POINT_DEMO.today}. Audit and completion timestamps are the actual service timestamps.`);
  } finally { await databasePool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof DemoSeedError ? error.message : "Demo seed failed. A partial namespace may remain: fix the local setup, then use --reset to retry.");
    process.exitCode = 1;
  });
}
