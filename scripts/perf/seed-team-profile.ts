import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { generateNKeysBetween } from "fractional-indexing";
import { eq, sql } from "drizzle-orm";
import { buildPath } from "@/lib/tree/path";
import { user } from "@/lib/db/schema/auth";
import { activities, backlogs, comments, itemFixVersions, itemLabels, itemLinks, items, labels, projectRoles, statuses } from "@/lib/db/schema/domain";

export class TeamProfileSeedError extends Error {}

/** Run before importing any module that opens a database connection. */
export function assertTeamProfileSeedAllowed(env: Readonly<Record<string, string | undefined>>): void {
  if (env.JIROO_ALLOW_TEAM_PROFILE_SEED !== "1") throw new TeamProfileSeedError("Set JIROO_ALLOW_TEAM_PROFILE_SEED=1 explicitly.");
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch { throw new TeamProfileSeedError("An explicit local PostgreSQL URL is required."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.port !== "5434" || !/^\/jir41_perf_[a-f0-9]{12}$/.test(url.pathname)) {
    throw new TeamProfileSeedError("Only a disposable jir41_perf_<12 hex> database on localhost:5434 is allowed.");
  }
  for (const key of url.searchParams.keys()) if (!["application_name", "sslmode"].includes(key)) {
    throw new TeamProfileSeedError("Connection routing and session overrides are not allowed.");
  }
}

type Item = typeof items.$inferInsert & { id: string; key: string; path: string; depth: number };
export type TeamProfile = {
  people: { id: string; email: string }[];
  backlogs: { id: string; key: string; epicId: string; sprintId: string; statuses: { id: string; name: string }[]; writers: { id: string; key: string }[] }[];
};

/** A fresh migrated database only: no reset, delete, sequence rewind, or shared namespace. */
export async function seedTeamProfile(): Promise<TeamProfile> {
  assertTeamProfileSeedAllowed(process.env);
  const password = process.env.JIROO_PERF_PASSWORD;
  if (!password || password.length < 16) throw new TeamProfileSeedError("Supply a synthetic JIROO_PERF_PASSWORD of at least 16 characters in memory.");
  const { db, databasePool } = await import("@/lib/db");
  const lock = await databasePool.connect();
  try {
    await lock.query("select pg_advisory_lock(hashtext('jiroo:team-profile-seed'))");
    const actual = await lock.query<{ name: string }>("select current_database() as name");
    if (actual.rows[0]?.name !== new URL(process.env.DATABASE_URL!).pathname.slice(1)) throw new TeamProfileSeedError("Unexpected database target.");
    const occupied = await db.select({ id: user.id }).from(user).limit(1);
    const existing = await db.select({ id: backlogs.id }).from(backlogs).limit(1);
    if (occupied.length || existing.length) throw new TeamProfileSeedError("This seed requires an empty, freshly migrated database.");
    const [{ updateItem }, { bootstrapAdministrator }, { createUser }, { createBacklog }, { assignBacklogRoleActor }, sprintService, lifecycle, releases] = await Promise.all([
      import("@/lib/services/items"), import("@/lib/services/bootstrap-admin"), import("@/lib/services/users"), import("@/lib/services/backlogs"),
      import("@/lib/services/authorization-admin"), import("@/lib/services/sprints"), import("@/lib/services/sprint-lifecycle"), import("@/lib/services/releases"),
    ]);
    const admin = await bootstrapAdministrator({ email: "person00@perf.jiroo.local", name: "Performance administrator", password });
    const people = [{ id: admin.userId, email: "person00@perf.jiroo.local" }];
    for (let i = 1; i < 50; i++) {
      const email = `person${String(i).padStart(2, "0")}@perf.jiroo.local`;
      const person = await createUser({ name: `Performance member ${String(i).padStart(2, "0")}`, email, password });
      people.push({ id: person.id, email });
    }
    const [memberRole] = await db.select().from(projectRoles).where(eq(projectRoles.key, "members"));
    if (!memberRole) throw new TeamProfileSeedError("Default members role is absent.");
    const result: TeamProfile = { people, backlogs: [] };
    const dateAt = (days: number) => new Date(Date.UTC(2026, 3, 1) + days * 86_400_000);
    for (let b = 0; b < 5; b++) {
      const key = `PERF${String.fromCharCode(65 + b)}`;
      const backlog = await createBacklog({ key, name: `Performance team ${b + 1}`, color: "#7c3030" }, admin.userId);
      for (const person of people) await assignBacklogRoleActor({ backlogId: backlog.id, projectRoleId: memberRole.id, principal: { type: "user", userId: person.id } }, admin.userId);
      const states = await db.select().from(statuses).where(eq(statuses.backlogId, backlog.id));
      const todo = states.find((s) => s.order === 0)!;
      const doing = states.find((s) => s.order === 1)!;
      const review = states.find((s) => s.order === 2)!;
      const done = states.find((s) => s.category === "done")!;
      const ranks = generateNKeysBetween(null, null, 4000);
      const keys = await db.execute<{ n: string }>(sql`select nextval('item_key_seq')::text as n from generate_series(1, 4000)`);
      const rows: Item[] = [];
      const tasks: Item[] = [];
      let subtaskCount = 0;
      const append = (type: Item["type"], parent: Item | null, index: number): Item => {
        const id = randomUUID();
        const state = type === "tache" ? (index % 20 < 5 ? todo : index % 20 < 12 ? doing : index % 20 < 14 ? review : done) : todo;
        const createdAt = dateAt(index % 160);
        const row: Item = {
          id, key: `${key}-${keys.rows[rows.length]!.n}`, backlogId: backlog.id, type,
          kind: index % 7 === 0 ? "bug" : "feature", title: `${type} ${index + 1} — recherche, sécurité et traitement des dossiers`,
          description: `## Objectif\n\nAméliorer le traitement du dossier ${index + 1}.\n\n- [ ] Vérifier les données\n- [ ] Valider avec le métier\n\nCritères de recette et contexte synthétiques pour le profil équipe.`,
          parentId: parent?.id ?? null, statusId: state.id, priority: index % 4,
          estimatePoints: type === "tache" ? [1, 2, 3, 5, 8][index % 5] : null,
          assigneeId: people[index % 50]!.id, reporterId: people[(index + 3) % 50]!.id,
          rank: ranks[rows.length]!, path: buildPath(parent?.path ?? null, id), depth: (parent?.depth ?? -1) + 1,
          startDate: "2026-10-01", dueDate: `2026-11-${String(index % 28 + 1).padStart(2, "0")}`,
          createdAt, updatedAt: dateAt(170 + index % 20), closedAt: state.id === done.id ? dateAt(170) : null,
        };
        rows.push(row);
        return row;
      };
      for (let c = 0; c < 20; c++) {
        const component = append("composant", null, c);
        for (let e = 0; e < 5; e++) {
          const epic = append("epic", component, c * 5 + e);
          for (let t = 0; t < 28; t++) {
            const task = append("tache", epic, tasks.length);
            tasks.push(task);
            if (subtaskCount < 1080) {
              const child = append("soustache", task, subtaskCount++);
              // A done task cannot retain an incomplete child at completion.
              child.statusId = task.statusId; child.closedAt = task.closedAt;
            }
          }
        }
      }
      if (rows.length !== 4000) throw new TeamProfileSeedError("Unexpected hierarchy size.");
      const completedCandidates = tasks.filter((t) => t.statusId === done.id).slice(0, 200);
      for (const task of completedCandidates) { task.statusId = todo.id; task.closedAt = null; }
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i += 300) await tx.insert(items).values(rows.slice(i, i + 300));
        const labelRows = await tx.insert(labels).values(Array.from({ length: 20 }, (_, i) => ({ backlogId: backlog.id, name: `Theme ${i + 1}`, color: "#64748b" }))).returning();
        const marked = rows.filter((_, i) => i % 5 < 2);
        for (let i = 0; i < marked.length; i += 500) await tx.insert(itemLabels).values(marked.slice(i, i + 500).map((item, j) => ({ itemId: item.id, labelId: labelRows[(i + j) % 20]!.id })));
        const notes = tasks.filter((_, i) => i % 5 < 2).flatMap((item, i) => [0, 1].map((n) => ({ itemId: item.id, authorId: people[(i + n) % 50]!.id, body: `Point de suivi ${n + 1} : validation du dossier et des critères de recette.`, createdAt: dateAt(180 + n) })));
        for (let i = 0; i < notes.length; i += 500) await tx.insert(comments).values(notes.slice(i, i + 500));
        const history = rows.map((item) => ({ itemId: item.id, actorId: item.reporterId!, action: "create" as const, at: item.createdAt!, requestCorrelationId: randomUUID() }));
        for (let i = 0; i < history.length; i += 500) await tx.insert(activities).values(history.slice(i, i + 500));
        const changes = tasks.filter((t) => t.statusId !== todo.id).map((item) => ({ itemId: item.id, actorId: item.assigneeId!, action: "status_change" as const, field: "status", oldValue: todo.id, newValue: item.statusId, at: item.updatedAt!, requestCorrelationId: randomUUID() }));
        for (let i = 0; i < changes.length; i += 500) await tx.insert(activities).values(changes.slice(i, i + 500));
        await tx.insert(itemLinks).values(Array.from({ length: 400 }, (_, i) => ({ sourceId: tasks[i * 3]!.id, targetId: tasks[i * 3 + 1]!.id, type: "blocks" as const, createdBy: admin.userId })));
      });
      const doneTasks = [...completedCandidates, ...tasks.filter((t) => t.statusId === done.id)];
      for (let s = 0; s < 2; s++) {
        const sprint = await sprintService.createSprint({ backlogId: backlog.id }, admin.userId);
        await sprintService.assignItemsToSprint({ backlogId: backlog.id, sprintId: sprint.id, itemIds: doneTasks.slice(s * 100, (s + 1) * 100).map((t) => t.id) }, admin.userId);
        await lifecycle.startSprint({ id: sprint.id, backlogId: backlog.id, name: `Completed iteration ${s + 1}`, goal: "Historical performance sample", startAt: `2026-09-${s === 0 ? "01" : "15"}T00:00:00Z`, endAt: `2026-09-${s === 0 ? "14" : "28"}T00:00:00Z`, capacityPoints: null }, admin.userId);
        for (const [i, task] of completedCandidates.slice(s * 100, (s + 1) * 100).entries()) {
          if (i % 20 === 0) await updateItem({ id: task.id, estimatePoints: 5 }, admin.userId);
          await updateItem({ id: task.id, statusId: done.id }, admin.userId);
          task.statusId = done.id;
        }
        await lifecycle.completeSprint({ id: sprint.id, backlogId: backlog.id, destination: { type: "backlog" } }, admin.userId);
      }
      const active = await sprintService.createSprint({ backlogId: backlog.id }, admin.userId);
      const activeTasks = tasks.filter((t) => t.statusId !== done.id).slice(0, 200);
      await sprintService.assignItemsToSprint({ backlogId: backlog.id, sprintId: active.id, itemIds: activeTasks.map((t) => t.id) }, admin.userId);
      await lifecycle.startSprint({ id: active.id, backlogId: backlog.id, name: "Current iteration", goal: "Ten simultaneous contributors", startAt: "2026-10-19T00:00:00Z", endAt: "2026-10-30T00:00:00Z", capacityPoints: null }, admin.userId);
      for (const [i, task] of activeTasks.slice(10, 30).entries()) {
        await updateItem({ id: task.id, estimatePoints: i % 2 ? 3 : 5, statusId: doing.id }, admin.userId);
      }
      for (let r = 0; r < 3; r++) {
        const release = await releases.createRelease({ backlogId: backlog.id, name: `Version ${r + 1}.0`, targetDate: `2026-${r === 0 ? "09-30" : "11-30"}`, driverId: admin.userId }, admin.userId, randomUUID());
        const scope = r === 0 ? doneTasks.slice(0, 100) : tasks.slice(r * 500, (r + 1) * 500);
        await db.insert(itemFixVersions).values(scope.map((t) => ({ backlogId: backlog.id, itemId: t.id, releaseId: release.id, addedBy: admin.userId })));
        if (r === 0) {
          const detail = await releases.getReleaseDetail(backlog.id, release.id);
          if (!detail) throw new TeamProfileSeedError("Release missing after creation.");
          await releases.publishRelease({ backlogId: backlog.id, releaseId: release.id, expectedRevision: detail.revision, expectedScopeRevision: detail.publicationScopeRevision, effectiveDate: "2026-09-30", incompleteDisposition: "keep" }, admin.userId, randomUUID());
        }
      }
      result.backlogs.push({ id: backlog.id, key, epicId: tasks[0]!.parentId!, sprintId: active.id, statuses: states.map(({ id, name }) => ({ id, name })), writers: activeTasks.slice(0, 10).map(({ id, key }) => ({ id, key })) });
      console.error(`Seeded ${key}: ${rows.length} items, 50 memberships, 3 sprints and 3 releases.`);
    }
    await lock.query("analyze");
    return result;
  } finally {
    await lock.query("select pg_advisory_unlock(hashtext('jiroo:team-profile-seed'))").catch(() => {});
    lock.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedTeamProfile().then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => { console.error(error instanceof TeamProfileSeedError ? error.message : "Team profile seed failed; discard the owned database before retrying."); process.exitCode = 1; })
    .finally(async () => { const { databasePool } = await import("@/lib/db"); await databasePool.end(); });
}
