import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items } from "@/lib/db/schema/domain";
import { createBacklog } from "@/lib/services/backlogs";
import { createItem, listActivities, reparentItem } from "@/lib/services/items";
import { ltreeLabel } from "@/lib/tree/path";

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
  } catch (e) {
    passed += 1;
    console.log(`  PASS  ${label} (rejected: ${(e as Error).message})`);
  }
}

async function pathOf(id: string): Promise<string> {
  const [row] = await db.select({ path: items.path }).from(items).where(eq(items.id, id));
  return row!.path;
}

async function depthOf(id: string): Promise<number> {
  const [row] = await db.select({ depth: items.depth }).from(items).where(eq(items.id, id));
  return row!.depth;
}

async function main() {
  // seeded admin id
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, adminEmail));
  if (!admin) throw new Error("Seeded admin introuvable — exécute le seed d'abord.");
  const actorId = admin.id;

  // throwaway backlog ZZRP (also creates its 4 statuses)
  const tb = await createBacklog({ key: "ZZRP", name: "Reparent Test", color: "#30557c" }, actorId);
  console.log(`Created throwaway backlog ZZRP (${tb.id}).`);

  try {
    // Setup: composant C1 ; epics E1, E2 under C1 ; tache T1 under E1 ; soustache S1 under T1.
    const c1 = await createItem({ backlogId: tb.id, type: "composant", title: "Composant 1" }, actorId);
    const e1 = await createItem({ backlogId: tb.id, type: "epic", parentId: c1.id, title: "Epic 1" }, actorId);
    const e2 = await createItem({ backlogId: tb.id, type: "epic", parentId: c1.id, title: "Epic 2" }, actorId);
    const t1 = await createItem({ backlogId: tb.id, type: "tache", parentId: e1.id, title: "Tache 1" }, actorId);
    const s1 = await createItem({ backlogId: tb.id, type: "soustache", parentId: t1.id, title: "Soustache 1" }, actorId);
    // second composant C2 — the valid new parent for an epic.
    const c2 = await createItem({ backlogId: tb.id, type: "composant", title: "Composant 2" }, actorId);

    // ---- (1) reparent a subtree: move E1 (epic) from C1 to C2 ----
    const movedE1 = await reparentItem({ id: e1.id, newParentId: c2.id }, actorId);
    assert(movedE1?.parentId === c2.id, `E1.parentId === C2 (got ${movedE1?.parentId})`);

    const e1Path = await pathOf(e1.id);
    const t1Path = await pathOf(t1.id);
    const s1Path = await pathOf(s1.id);
    const c2Label = ltreeLabel(c2.id);
    const e1Label = ltreeLabel(e1.id);
    const t1Label = ltreeLabel(t1.id);
    const s1Label = ltreeLabel(s1.id);

    console.log(`  subtree paths after move:`);
    console.log(`    E1: ${e1Path}`);
    console.log(`    T1: ${t1Path}`);
    console.log(`    S1: ${s1Path}`);

    assert(e1Path === `root.${c2Label}.${e1Label}`, `E1.path === root.<C2>.<E1> (got ${e1Path})`);
    assert(t1Path === `root.${c2Label}.${e1Label}.${t1Label}`, `T1.path === root.<C2>.<E1>.<T1> (got ${t1Path})`);
    assert(
      s1Path === `root.${c2Label}.${e1Label}.${t1Label}.${s1Label}`,
      `S1.path === root.<C2>.<E1>.<T1>.<S1> (got ${s1Path})`,
    );

    // depths unchanged: E1=1, T1=2, S1=3
    assert((await depthOf(e1.id)) === 1, `E1.depth === 1 (unchanged)`);
    assert((await depthOf(t1.id)) === 2, `T1.depth === 2 (unchanged)`);
    assert((await depthOf(s1.id)) === 3, `S1.depth === 3 (unchanged)`);

    // production CHECK still holds for every row in ZZRP
    const checkRes = await db.execute<{ ok: boolean }>(
      sql`SELECT bool_and(subpath(path, nlevel(path) - 1)::text = replace(id::text, '-', '')) AS ok
          FROM items WHERE backlog_id = ${tb.id}`,
    );
    const checkOk = checkRes.rows[0]?.ok;
    console.log(`  CHECK bool_and = ${checkOk}`);
    assert(checkOk === true, `production CHECK (path tail = id) holds for all ZZRP rows (got ${checkOk})`);

    // exactly ONE 'move'/'parent' activity on E1 (old parent C1, new parent C2)
    const e1ParentActs = (await listActivities(e1.id)).filter((r) => r.action === "move" && r.field === "parent");
    assert(e1ParentActs.length === 1, `E1 has exactly one 'move'/'parent' activity (got ${e1ParentActs.length})`);
    assert(
      e1ParentActs[0]?.oldValue === c1.id && e1ParentActs[0]?.newValue === c2.id,
      `E1 'move'/'parent' activity old=C1 new=C2 (got old=${e1ParentActs[0]?.oldValue} new=${e1ParentActs[0]?.newValue})`,
    );

    // ---- (2) hierarchy rejection: reparent T1 (tache) under C1 (composant) ----
    await assertRejects("reparent tache under composant rejects (Hiérarchie invalide)", () =>
      reparentItem({ id: t1.id, newParentId: c1.id }, actorId),
    );

    // ---- (3) same-parent reorder skips rewrite ----
    // E2 is still under C1. Reparent it with newParentId = its CURRENT parent (C1) and
    // afterId = nothing meaningful → here we force a rank change by appending after E2's own
    // group tail. Capture E2.path before/after to assert NO path rewrite happened.
    const e2PathBefore = await pathOf(e2.id);
    // Add a sibling epic E3 under C1 so there is a neighbor to reorder against.
    const e3 = await createItem({ backlogId: tb.id, type: "epic", parentId: c1.id, title: "Epic 3" }, actorId);
    // Move E2 to AFTER E3 within the same parent C1 → rank changes, path must not.
    // E3 becomes the upper neighbor (beforeId), so E2 lands at a fresh rank past E3's.
    const reorderedE2 = await reparentItem({ id: e2.id, newParentId: c1.id, beforeId: e3.id }, actorId);
    const e2PathAfter = await pathOf(e2.id);
    assert(e2PathAfter === e2PathBefore, `same-parent reorder leaves E2.path unchanged (before ${e2PathBefore}, after ${e2PathAfter})`);
    assert(reorderedE2?.parentId === c1.id, `E2.parentId still === C1 after same-parent reorder`);
    const e2RankActs = (await listActivities(e2.id)).filter((r) => r.action === "move" && r.field === "rank");
    assert(e2RankActs.length >= 1, `same-parent reorder wrote a 'move'/'rank' activity (got ${e2RankActs.length})`);
    const e2ParentActs = (await listActivities(e2.id)).filter((r) => r.action === "move" && r.field === "parent");
    assert(e2ParentActs.length === 0, `same-parent reorder wrote NO 'move'/'parent' activity (got ${e2ParentActs.length})`);

    // ---- (4) soft-deleted node returns null ----
    // Manually soft-delete C2's subtree (E1,T1,S1 now live under C2) then reparent a deleted node.
    await db.update(items).set({ deletedAt: new Date() }).where(sql`${items.path} <@ ${await pathOf(c2.id)}::ltree`);
    const deletedReparent = await reparentItem({ id: e1.id, newParentId: c1.id }, actorId);
    assert(deletedReparent === null, `reparent of a soft-deleted node returns null (got ${deletedReparent})`);
    // restore for clean teardown is unnecessary (hard-delete of backlog cascades), but keep state sane
  } finally {
    // hard-delete the throwaway backlog (cascades items → activities/statuses)
    await db.delete(backlogs).where(eq(backlogs.key, "ZZRP"));
    const remaining = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "ZZRP"));
    assert(remaining.length === 0, `cleanup: 0 backlogs with key ZZRP remain (got ${remaining.length})`);
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
