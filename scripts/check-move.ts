import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, statuses } from "@/lib/db/schema/domain";
import { createBacklog } from "@/lib/services/backlogs";
import {
  createItem,
  getItemByIdForBacklog,
  listActivities,
  moveItem,
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

async function main() {
  // (a) seeded admin id
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, adminEmail));
  if (!admin) throw new Error("Seeded admin introuvable — exécute le seed d'abord.");
  const actorId = admin.id;

  // (b) throwaway backlog ZZMV (also creates its 4 default statuses)
  const tb = await createBacklog({ key: "ZZMV", name: "Move test", color: "#30557c" }, actorId);
  console.log(`Created throwaway backlog ZZMV (${tb.id}).`);

  try {
    // ZZMV statuses: todo (order 0), doing/in_progress (order 1), review/in_progress (2), done (order 3).
    const [doingStatus] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.backlogId, tb.id), eq(statuses.category, "in_progress")))
      .orderBy(asc(statuses.order))
      .limit(1);
    if (!doingStatus) throw new Error("Aucun statut 'in_progress' pour ZZMV.");
    const [doneStatus] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.backlogId, tb.id), eq(statuses.category, "done")))
      .limit(1);
    if (!doneStatus) throw new Error("Aucun statut 'done' pour ZZMV.");

    // (c) composant C (root), then 3 epic children E1,E2,E3 under C → ranks r1<r2<r3.
    const composant = await createItem(
      { backlogId: tb.id, type: "composant", title: "Composant C" },
      actorId,
    );
    const e1 = await createItem(
      { backlogId: tb.id, type: "epic", parentId: composant.id, title: "E1" },
      actorId,
    );
    const e2 = await createItem(
      { backlogId: tb.id, type: "epic", parentId: composant.id, title: "E2" },
      actorId,
    );
    const e3 = await createItem(
      { backlogId: tb.id, type: "epic", parentId: composant.id, title: "E3" },
      actorId,
    );
    assert(
      e1.rank < e2.rank && e2.rank < e3.rank,
      `initial ranks r1<r2<r3 (got ${e1.rank} < ${e2.rank} < ${e3.rank})`,
    );

    // --- reorder: move E3 between E1 and E2 → r1 < newRank < r2 + a 'move'/'rank' activity for E3.
    const reorderActsBefore = (await listActivities(e3.id)).filter(
      (r) => r.action === "move" && r.field === "rank",
    ).length;
    const movedE3 = await moveItem({ id: e3.id, beforeId: e1.id, afterId: e2.id }, actorId);
    assert(movedE3 != null, `reorder: moveItem(E3) returns a row (got ${movedE3?.id})`);
    assert(
      movedE3!.rank > e1.rank && movedE3!.rank < e2.rank,
      `reorder: E3.rank now r1<rank<r2 (got ${e1.rank} < ${movedE3!.rank} < ${e2.rank})`,
    );
    const reorderActsAfter = (await listActivities(e3.id)).filter(
      (r) => r.action === "move" && r.field === "rank",
    ).length;
    assert(
      reorderActsAfter === reorderActsBefore + 1,
      `reorder: one new 'move'/'rank' activity for E3 (got +${reorderActsAfter - reorderActsBefore})`,
    );

    // --- status change only: move E1 to the in_progress status.
    const e1StatusBefore = e1.statusId;
    const movedE1 = await moveItem({ id: e1.id, statusId: doingStatus.id }, actorId);
    assert(movedE1 != null, `status: moveItem(E1) returns a row (got ${movedE1?.id})`);
    assert(
      movedE1!.statusId === doingStatus.id && movedE1!.statusId !== e1StatusBefore,
      `status: E1.statusId changed to in_progress (got ${movedE1!.statusId})`,
    );
    const e1StatusChangeActs = (await listActivities(e1.id)).filter(
      (r) => r.action === "status_change",
    ).length;
    assert(e1StatusChangeActs >= 1, `status: a 'status_change' activity exists for E1 (got ${e1StatusChangeActs})`);

    // --- status to done sets closedAt: move E2 to the done status.
    const movedE2 = await moveItem({ id: e2.id, statusId: doneStatus.id }, actorId);
    assert(movedE2 != null, `done: moveItem(E2) returns a row (got ${movedE2?.id})`);
    assert(movedE2!.statusId === doneStatus.id, `done: E2.statusId === done status (got ${movedE2!.statusId})`);
    assert(movedE2!.closedAt != null, `done: E2.closedAt IS NOT null (got ${movedE2!.closedAt})`);

    // --- no-op: moveItem on E2 with its SAME status and no neighbors that change its rank.
    // E2 keeps its current statusId and gets no neighbors → rankAtDrop appends against the live
    // tail; E2 is already the group tail here, so its rank is unchanged → no new activity.
    const e2Cur = await getItemByIdForBacklog(e2.id, tb.id);
    if (!e2Cur) throw new Error("E2 introuvable pour le test no-op.");
    const noopActsBefore = (await listActivities(e2.id)).length;
    const noop = await moveItem({ id: e2.id, statusId: e2Cur.statusId }, actorId);
    assert(noop?.id === e2.id, `no-op: moveItem returns the row (got ${noop?.id})`);
    const noopActsAfter = (await listActivities(e2.id)).length;
    assert(
      noopActsAfter === noopActsBefore,
      `no-op: writes no new activity (before ${noopActsBefore}, after ${noopActsAfter})`,
    );
  } finally {
    // cleanup: hard-delete the throwaway backlog (cascades items/statuses/activities)
    await db.delete(backlogs).where(eq(backlogs.key, "ZZMV"));
    const remaining = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "ZZMV"));
    assert(remaining.length === 0, `cleanup: 0 backlogs with key ZZMV remain (got ${remaining.length})`);
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
