import "dotenv/config";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items } from "@/lib/db/schema/domain";
import { createBacklog } from "@/lib/services/backlogs";
import { createItem, rankAtDrop } from "@/lib/services/items";

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
  // (a) seeded admin id (actor for createItem)
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, adminEmail));
  if (!admin) throw new Error("Seeded admin introuvable — exécute le seed d'abord.");
  const actorId = admin.id;

  // (b) throwaway backlog (also creates its 4 statuses)
  const tb = await createBacklog({ key: "ZZRK", name: "Rank test", color: "#30547c" });
  console.log(`Created throwaway backlog ZZRK (${tb.id}).`);

  try {
    // (c) composant C (no parent) + a second root composant C2. Rank is a single GLOBAL order
    // per backlog, so every item below shares one rank space: C(a0) < C2(a1) < E1 < E2 < E3.
    const c = await createItem({ backlogId: tb.id, type: "composant", title: "C" }, actorId);
    await createItem({ backlogId: tb.id, type: "composant", title: "C2" }, actorId);

    // (d) 3 epic children of C — appended at the global tail in order → ranks r1 < r2 < r3
    await createItem({ backlogId: tb.id, type: "epic", parentId: c.id, title: "E1" }, actorId);
    await createItem({ backlogId: tb.id, type: "epic", parentId: c.id, title: "E2" }, actorId);
    await createItem({ backlogId: tb.id, type: "epic", parentId: c.id, title: "E3" }, actorId);

    // Read children ids + ranks, ordered asc(rank).
    const children = await db
      .select({ id: items.id, rank: items.rank, title: items.title })
      .from(items)
      .where(and(eq(items.parentId, c.id), isNull(items.deletedAt)))
      .orderBy(asc(items.rank));
    if (children.length !== 3) throw new Error(`Attendu 3 enfants, obtenu ${children.length}.`);
    const [e1, e2, e3] = children;
    const r1 = e1!.rank;
    const r2 = e2!.rank;
    const r3 = e3!.rank;
    assert(r1 < r2 && r2 < r3, `append order yields r1 < r2 < r3 (${r1} < ${r2} < ${r3})`);

    // --- scenarios (each in its own tx so nothing is persisted to items) ---

    // between E1,E2 — use E3 as the "moved" id (excluded from the group)
    const gotBetween = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e3!.id, e1!.id, e2!.id),
    );
    assert(r1 < gotBetween && gotBetween < r2, `between E1,E2 → r1 < got < r2 (got ${gotBetween})`);

    // CROSS-PARENT (the board-reorder fix): move root C between E1,E2 (children of C). Under a
    // global rank a root item CAN be ranked between two items of a different parent → r1 < got < r2.
    const gotCross = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, c.id, e1!.id, e2!.id),
    );
    assert(r1 < gotCross && gotCross < r2, `cross-parent (move C between E1,E2) → r1 < got < r2 (got ${gotCross})`);

    // top: before=null, after=E1 → D3 re-derives the global predecessor (C2) → got < r1
    const gotTop = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e3!.id, null, e1!.id),
    );
    assert(gotTop < r1, `top (after=E1) → got < r1 (got ${gotTop})`);

    // bottom: before=E3, after=null → E3 is the global max → got > r3
    const gotBottom = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e1!.id, e3!.id, null),
    );
    assert(gotBottom > r3, `bottom (before=E3) → got > r3 (got ${gotBottom})`);

    // no bounds (before/after null) → append at the GLOBAL tail of the backlog (there is no
    // per-parent "empty group" anymore; the order space is the whole backlog) → got > r3
    const gotTail = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e1!.id, null, null),
    );
    assert(gotTail > r3, `no bounds → append at global tail, got > r3 (got ${gotTail})`);

    // one-sided re-derive (D3): only afterId=E2, beforeId=null. E1 exists below E2 →
    // server re-derives before=E1 → r1 < got < r2 (NOT top).
    const gotDerive = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e3!.id, null, e2!.id),
    );
    assert(r1 < gotDerive && gotDerive < r2, `D3 re-derive (after=E2) → r1 < got < r2 (got ${gotDerive})`);

    // inverted (D2): before=E2, after=E1 (swapped) → normalized → r1 < got < r2
    const gotInverted = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e3!.id, e2!.id, e1!.id),
    );
    assert(r1 < gotInverted && gotInverted < r2, `D2 inverted (before=E2,after=E1) → r1 < got < r2 (got ${gotInverted})`);

    // stale/self neighbor: beforeId = a random non-member uuid, afterId=E2 → stale before is
    // dropped (not in group), then D3 re-derives before=E1 → r1 < got < r2.
    const stale = "00000000-0000-0000-0000-000000000000";
    const gotStale = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e3!.id, stale, e2!.id),
    );
    assert(r1 < gotStale && gotStale < r2, `stale before (non-member uuid) + after=E2 → r1 < got < r2 (got ${gotStale})`);

    // stale/self neighbor: beforeId = a random non-member uuid, afterId=E1 → stale before
    // dropped, D3 re-derives the global predecessor (C2) below E1 → got < r1.
    const gotStaleTop = await db.transaction((tx) =>
      rankAtDrop(tx, tb.id, e3!.id, stale, e1!.id),
    );
    assert(gotStaleTop < r1, `stale before + after=E1 → got < r1 (got ${gotStaleTop})`);
  } finally {
    // cleanup: hard-delete the throwaway backlog (cascades items/statuses/activities)
    await db.delete(backlogs).where(eq(backlogs.key, "ZZRK"));
    const remaining = await db.select({ id: backlogs.id }).from(backlogs).where(eq(backlogs.key, "ZZRK"));
    assert(remaining.length === 0, `cleanup: 0 backlogs with key ZZRK remain (got ${remaining.length})`);
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
