import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import { createBacklog } from "@/lib/services/backlogs";
import {
  createItem,
  listActivities,
  listItems,
  restoreItem,
  softDeleteItem,
  updateItem,
} from "@/lib/services/items";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}`);
  }
}

async function assertRejects(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    failed += 1;
    console.error(`  FAIL  ${label} (expected throw, but resolved)`);
  } catch {
    passed += 1;
    console.log(`  PASS  ${label} (rejected as expected)`);
  }
}

async function main() {
  // (a) seeded admin id
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, adminEmail));
  if (!admin) throw new Error("Seeded admin introuvable — exécute le seed d'abord.");
  const actorId = admin.id;

  // A CASS status id (cross-backlog negative case). CASS is the canonical seeded backlog.
  const [cass] = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "CASS"));
  if (!cass) throw new Error("Backlog CASS introuvable — exécute le seed d'abord.");
  const [cassStatus] = await db.select({ id: statuses.id }).from(statuses).where(eq(statuses.backlogId, cass.id)).limit(1);
  if (!cassStatus) throw new Error("Aucun statut CASS — exécute le seed d'abord.");

  // (b) throwaway backlog (also creates its 4 statuses)
  const tb = await createBacklog({ key: "ZZTST", name: "Test", color: "#7c3030" }, actorId);
  console.log(`Created throwaway backlog ZZTST (${tb.id}).`);

  try {
    // (c) composant (no parent)
    const composant = await createItem(
      { backlogId: tb.id, type: "composant", title: "Composant racine" },
      actorId,
    );
    assert(/^ZZTST-\d+$/.test(composant.key), `composant.key matches /^ZZTST-\\d+$/ (got ${composant.key})`);
    assert(/^root\.[0-9a-f]{32}$/.test(composant.path), `composant.path === root.<32hex> (got ${composant.path})`);
    assert(composant.depth === 0, `composant.depth === 0 (got ${composant.depth})`);

    // (d) epic under the composant
    const epic = await createItem(
      { backlogId: tb.id, type: "epic", parentId: composant.id, title: "Epic enfant" },
      actorId,
    );
    assert(epic.depth === 1, `epic.depth === 1 (got ${epic.depth})`);
    assert(epic.path.startsWith(`${composant.path}.`), `epic.path startsWith composant.path (got ${epic.path})`);

    // (e) tache under the epic
    const tache = await createItem(
      { backlogId: tb.id, type: "tache", parentId: epic.id, title: "Tache enfant" },
      actorId,
    );
    assert(tache.depth === 2, `tache.depth === 2 (got ${tache.depth})`);
    assert(tache.path.startsWith(`${epic.path}.`), `tache.path startsWith epic.path (got ${tache.path})`);

    // (f) rejections
    await assertRejects("composant-with-parent rejects", () =>
      createItem({ backlogId: tb.id, type: "composant", parentId: composant.id, title: "Invalide" }, actorId),
    );
    await assertRejects("tache under composant (invalid parenting) rejects", () =>
      createItem({ backlogId: tb.id, type: "tache", parentId: composant.id, title: "Invalide" }, actorId),
    );
    await assertRejects("status from CASS (cross-backlog) rejects", () =>
      createItem(
        { backlogId: tb.id, type: "composant", title: "Invalide", statusId: cassStatus.id },
        actorId,
      ),
    );

    // (g) one 'create' activity row per created item
    for (const [item, label] of [
      [composant, "composant"],
      [epic, "epic"],
      [tache, "tache"],
    ] as const) {
      const rows = await listActivities(item.id);
      const creates = rows.filter((r) => r.action === "create");
      assert(creates.length === 1, `${label} has exactly one 'create' activity (got ${creates.length})`);
      assert(creates[0]?.newValue === item.key, `${label} create activity.newValue === key (got ${creates[0]?.newValue})`);
    }

    // (i) updateItem: title change → row updated + 'update'/'title' activity
    const beforeTitleActs = (await listActivities(tache.id)).filter(
      (r) => r.action === "update" && r.field === "title",
    ).length;
    const renamed = await updateItem({ id: tache.id, title: "Tache renommée" }, actorId);
    assert(renamed?.title === "Tache renommée", `updateItem changed tache title (got ${renamed?.title})`);
    const afterTitleActs = (await listActivities(tache.id)).filter(
      (r) => r.action === "update" && r.field === "title",
    ).length;
    assert(afterTitleActs === beforeTitleActs + 1, `one new 'update'/'title' activity added (got +${afterTitleActs - beforeTitleActs})`);

    // (j) status transitions: closedAt set on → done, cleared on → todo.
    // ZZTST already has a seeded 'done' status; add a SECOND 'done' to test transitions.
    const [todoStatus] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.backlogId, tb.id), eq(statuses.category, "todo")))
      .limit(1);
    if (!todoStatus) throw new Error("Aucun statut 'todo' pour ZZTST.");
    const [doneStatus] = await db
      .insert(statuses)
      .values({ backlogId: tb.id, name: "Terminé bis", category: "done", order: 99, color: "#3aa675" })
      .returning({ id: statuses.id });
    if (!doneStatus) throw new Error("Échec insertion du statut 'done' secondaire.");

    const toDone = await updateItem({ id: tache.id, statusId: doneStatus.id }, actorId);
    assert(toDone?.statusId === doneStatus.id, `updateItem moved tache to done status (got ${toDone?.statusId})`);
    assert(toDone?.closedAt != null, `closedAt IS NOT null after → done (got ${toDone?.closedAt})`);

    const toTodo = await updateItem({ id: tache.id, statusId: todoStatus.id }, actorId);
    assert(toTodo?.statusId === todoStatus.id, `updateItem moved tache back to todo status (got ${toTodo?.statusId})`);
    assert(toTodo?.closedAt == null, `closedAt IS null after → todo (got ${toTodo?.closedAt})`);

    // (k) no-op update: same title → returns row, writes NO new activity
    const actsBeforeNoop = (await listActivities(tache.id)).length;
    const noop = await updateItem({ id: tache.id, title: "Tache renommée" }, actorId);
    assert(noop?.id === tache.id, `no-op updateItem returns the row (got ${noop?.id})`);
    const actsAfterNoop = (await listActivities(tache.id)).length;
    assert(actsAfterNoop === actsBeforeNoop, `no-op update writes no activity (before ${actsBeforeNoop}, after ${actsAfterNoop})`);

    // (l) softDeleteItem the composant → cascade: composant+epic+tache all deletedAt set
    const deleted = await softDeleteItem({ id: composant.id }, actorId);
    assert(deleted?.id === composant.id, `softDeleteItem returns the target (got ${deleted?.id})`);
    const deletedFlags = await Promise.all(
      [composant, epic, tache].map(async (it) => {
        const [row] = await db.select({ deletedAt: items.deletedAt }).from(items).where(eq(items.id, it.id));
        return row?.deletedAt != null;
      }),
    );
    assert(deletedFlags.every(Boolean), `cascade: composant+epic+tache all have deletedAt set (got ${deletedFlags})`);
    const delActs = (
      await Promise.all([composant, epic, tache].map((it) => listActivities(it.id)))
    )
      .flat()
      .filter((r) => r.action === "delete" && r.newValue !== null);
    assert(delActs.length === 3, `3 'delete' activity rows added on cascade (got ${delActs.length})`);
    const liveAfterDelete = await listItems(tb.id);
    assert(liveAfterDelete.length === 0, `listItems(ZZTST) returns 0 after soft-delete (got ${liveAfterDelete.length})`);

    // (m) restoreItem the tache while composant still deleted → REJECTS (parent deleted)
    await assertRejects("restore tache while parent deleted rejects", () =>
      restoreItem({ id: tache.id }, actorId),
    );

    // (n) restoreItem the composant → whole subtree live again
    const restored = await restoreItem({ id: composant.id }, actorId);
    assert(restored?.id === composant.id, `restoreItem returns the target (got ${restored?.id})`);
    const liveFlags = await Promise.all(
      [composant, epic, tache].map(async (it) => {
        const [row] = await db.select({ deletedAt: items.deletedAt }).from(items).where(eq(items.id, it.id));
        return row?.deletedAt == null;
      }),
    );
    assert(liveFlags.every(Boolean), `cascade: composant+epic+tache all live again (got ${liveFlags})`);
    const liveAfterRestore = await listItems(tb.id);
    assert(liveAfterRestore.length === 3, `listItems(ZZTST) returns 3 after restore (got ${liveAfterRestore.length})`);
  } finally {
    // (h) hard-delete the throwaway backlog (cascades items/statuses/activities)
    await db.delete(backlogs).where(eq(backlogs.key, "ZZTST"));
    const remaining = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "ZZTST"));
    assert(remaining.length === 0, `cleanup: 0 backlogs with key ZZTST remain (got ${remaining.length})`);
  }
}

main()
  .then(() => {
    console.log(`\n${failed === 0 ? "ALL PASS" : "SOME FAILED"} — ${passed} passed, ${failed} failed.`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("\nFATAL:", err);
    process.exit(1);
  });
