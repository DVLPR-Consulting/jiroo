import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, itemLabels, items, labels, statuses } from "@/lib/db/schema/domain";
import type { Filters } from "@/lib/items/filter";
import type { TreeMatchCursor } from "@/lib/items/tree-window";
import { moveItem, reparentItem } from "@/lib/services/items";
import { loadTreeChildren, loadTreeMatchWindow } from "@/lib/services/tree-window";
import { treeViewRows } from "@/lib/services/view-rows";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

const NO_FILTERS: Filters = {
  q: "",
  types: [],
  statusIds: [],
  priorities: [],
  assignees: [],
  labels: [],
  releaseIds: [],
  sprintIds: [],
  kind: [],
  underIds: [],
};

/** In the backlog's single rank order, every level interleaved. */
const NAMES = ["C1", "T1", "E1", "T2", "S1", "T3", "C2", "T4", "E2", "X1", "T5", "T6", "S2", "E3", "T7"] as const;
type Name = (typeof NAMES)[number];

const PARENT: Record<Name, Name | null> = {
  C1: null,
  C2: null,
  E1: "C1",
  E2: "C1",
  E3: "C2",
  T1: "E1",
  T2: "E1",
  T3: "E1",
  T4: "E1",
  T5: "E1",
  X1: "E1",
  T6: "E2",
  T7: "E2",
  S1: "T1",
  S2: "T1",
};

const TYPE = { C: "composant", E: "epic", T: "tache", X: "tache", S: "soustache" } as const;

/** Matches the « En cours » status filter. */
const DOING: ReadonlySet<Name> = new Set(["E2", "T2", "T5", "S2"]);

/**
 * The Arbre by windows (JIR-147, JIR-120 D5):
 *
 *   C1 ─ E1 ─ T1 ─ S1, S2
 *      │     ├ T2, T3, T4, T5   (X1, deleted, between T4 and T5)
 *      └ E2 ─ T6, T7
 *   C2 ─ E3 (no children)
 *
 * The global rank order interleaves the levels
 * (C1 T1 E1 T2 S1 T3 C2 T4 E2 X1 T5 T6 S2 E3 T7): T2's next item in the
 * backlog is a Sous-tâche and T3's a Composant, never their next sibling.
 */
async function fixture() {
  const [actor] = await db.select({ id: user.id, name: user.name }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `TW${suffix}`, name: "Arbre par fenêtres", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo, doing] = await db
    .insert(statuses)
    .values([
      { backlogId: backlog.id, name: "À faire", category: "todo" as const, order: 0, color: "#9aa0a6" },
      { backlogId: backlog.id, name: "En cours", category: "in_progress" as const, order: 1, color: "#d99a2b" },
    ])
    .returning();
  const ranks = generateNKeysBetween(null, null, NAMES.length);
  const id = Object.fromEntries(NAMES.map((name) => [name, randomUUID()])) as Record<Name, string>;
  const compact = (value: string) => value.replaceAll("-", "");
  const pathOf = (name: Name): string => {
    const parent = PARENT[name];
    return `${parent ? pathOf(parent) : "root"}.${compact(id[name])}`;
  };
  const depthOf = (name: Name): number => (PARENT[name] ? depthOf(PARENT[name]!) + 1 : 0);
  const rows = NAMES.map((name, index) => ({
    id: id[name],
    key: `${backlog.key}-${index + 1}`,
    type: TYPE[name[0] as keyof typeof TYPE],
    backlogId: backlog.id,
    title: name,
    parentId: PARENT[name] ? id[PARENT[name]!] : null,
    statusId: DOING.has(name) ? doing!.id : todo!.id,
    reporterId: actor.id,
    assigneeId: name === "T2" ? actor.id : null,
    rank: ranks[index]!,
    path: pathOf(name),
    depth: depthOf(name),
    deletedAt: name === "X1" ? new Date() : null,
  }));
  await db.insert(items).values(rows);
  const [label] = await db
    .insert(labels)
    .values({ backlogId: backlog.id, name: "Front", color: "--label-2" })
    .returning();
  await db.insert(itemLabels).values({ itemId: id.T1, labelId: label!.id });
  return {
    actorId: actor.id,
    actorName: actor.name,
    backlogId: backlog.id,
    doingId: doing!.id,
    labelId: label!.id,
    id,
    title: new Map(rows.map((row) => [row.id, row.title])),
    rank: new Map(rows.map((row) => [row.id, row.rank])),
    remove: () => db.delete(backlogs).where(eq(backlogs.id, backlog.id)),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** A parent's children, read window after window, as titles. */
async function childTitles(f: Fixture, parent: Name, limit = 2): Promise<string[]> {
  const titles: string[] = [];
  let cursor: string | null = null;
  for (let read = 0; read < 100; read += 1) {
    const window = await loadTreeChildren(f.backlogId, f.id[parent], { cursor, limit });
    titles.push(...window.rows.map((row) => f.title.get(row.id)!));
    cursor = window.nextCursor;
    if (!cursor) break;
  }
  return titles;
}

async function rowOf(f: Fixture, name: Name) {
  const [row] = await db.select().from(items).where(eq(items.id, f.id[name]));
  return row!;
}

async function expectUniqueRanks(f: Fixture) {
  const rows = await db.select({ rank: items.rank }).from(items).where(eq(items.backlogId, f.backlogId));
  expect(new Set(rows.map((row) => row.rank)).size).toBe(rows.length);
}

describeDb("Arbre children by windows (JIR-147)", () => {
  it("serves a parent's live children window by window in rank order", async () => {
    const f = await fixture();
    try {
      const first = await loadTreeChildren(f.backlogId, f.id.E1, { cursor: null, limit: 2 });
      expect(first.parentId).toBe(f.id.E1);
      expect(first.total).toBe(5);
      expect(first.rows.map((row) => row.title)).toEqual(["T1", "T2"]);
      expect(first.nextCursor).toBe(f.rank.get(f.id.T2));
      expect(first.rows[0]).toEqual({
        id: f.id.T1,
        key: expect.any(String),
        type: "tache",
        title: "T1",
        parentId: f.id.E1,
        statusId: expect.any(String),
        priority: 0,
        depth: 2,
        rank: f.rank.get(f.id.T1),
        path: expect.stringMatching(/^root\./),
        labels: [{ id: f.labelId, name: "Front", color: "--label-2" }],
        assigneeId: null,
        assigneeName: null,
        childCount: 2,
      });
      expect(first.rows[1]).toMatchObject({ assigneeId: f.actorId, assigneeName: f.actorName, childCount: 0 });

      // The deleted X1 never comes; the last window says there is no more.
      expect(await childTitles(f, "E1")).toEqual(["T1", "T2", "T3", "T4", "T5"]);
      const last = await loadTreeChildren(f.backlogId, f.id.E1, { cursor: f.rank.get(f.id.T4)!, limit: 2 });
      expect(last.rows.map((row) => row.title)).toEqual(["T5"]);
      expect(last.nextCursor).toBeNull();
      expect(await childTitles(f, "T1", 100)).toEqual(["S1", "S2"]);
      expect(await childTitles(f, "E3")).toEqual([]);
    } finally {
      await f.remove();
    }
  });

  it("serves nothing of a parent from another backlog", async () => {
    const f = await fixture();
    const other = await fixture();
    try {
      const window = await loadTreeChildren(other.backlogId, f.id.E1, { cursor: null, limit: 100 });
      expect(window).toEqual({ parentId: f.id.E1, total: 0, rows: [], nextCursor: null });
    } finally {
      await f.remove();
      await other.remove();
    }
  });
});

describeDb("Arbre filtered by windows (JIR-147)", () => {
  const doing = (f: Fixture): Filters => ({ ...NO_FILTERS, statusIds: [f.doingId] });

  async function walk(f: Fixture, limit: number) {
    const windows = [];
    let cursor: TreeMatchCursor | null = null;
    for (let read = 0; read < 100; read += 1) {
      const window = await loadTreeMatchWindow(f.backlogId, doing(f), { cursor, limit });
      windows.push(window);
      cursor = window.nextCursor;
      if (!cursor) break;
    }
    return windows;
  }

  it("serves the matches in hierarchy order with the ancestors each window needs", async () => {
    const f = await fixture();
    try {
      const [first, second, ...rest] = await walk(f, 2);
      expect(rest).toEqual([]);
      expect(first!.total).toBe(4);
      const shown = (window: typeof first) =>
        window!.rows.map((row) => `${row.title}${row.matched ? "" : "·"}`);
      // Matches by depth then rank; dimmed ancestors (·) in the same order.
      expect(shown(first)).toEqual(["C1·", "E1·", "E2", "T2"]);
      expect(first!.nextCursor).toEqual({ depth: 2, rank: f.rank.get(f.id.T2) });
      expect(shown(second)).toEqual(["C1·", "E1·", "T1·", "T5", "S2"]);
      expect(second!.nextCursor).toBeNull();
      // Filtered rows carry no child count: only the rows served are shown.
      expect(first!.rows.every((row) => row.childCount === undefined)).toBe(true);
    } finally {
      await f.remove();
    }
  });

  it("walks to the same matches and ancestors as the whole filtered tree, never a match twice", async () => {
    const f = await fixture();
    try {
      const reference = await treeViewRows(f.backlogId, doing(f));
      for (const limit of [1, 2, 3, 100]) {
        const windows = await walk(f, limit);
        const matched = windows.flatMap((window) => window.rows.filter((row) => row.matched).map((row) => row.id));
        const context = new Set(windows.flatMap((window) => window.rows.filter((row) => !row.matched).map((row) => row.id)));
        expect(matched).toEqual(reference.matchedIds);
        expect(new Set(matched).size).toBe(matched.length);
        expect(context).toEqual(new Set(reference.contextIds));
        // Every match comes with its whole live ancestry, matched before or now.
        const shownSoFar = new Set<string>();
        for (const window of windows) {
          for (const row of window.rows) shownSoFar.add(row.id);
          for (const row of window.rows) {
            if (row.parentId) expect(shownSoFar.has(row.parentId)).toBe(true);
          }
        }
        expect(windows.every((window) => window.total === reference.matchedIds.length)).toBe(true);
      }
    } finally {
      await f.remove();
    }
  });

  it("answers an empty window past the last match with the total", async () => {
    const f = await fixture();
    try {
      const window = await loadTreeMatchWindow(f.backlogId, doing(f), {
        cursor: { depth: 3, rank: f.rank.get(f.id.S2)! },
        limit: 2,
      });
      expect(window).toEqual({ total: 4, rows: [], nextCursor: null });
    } finally {
      await f.remove();
    }
  });
});

describeDb("Arbre drop placement with windows (JIR-147)", () => {
  it("drops into a parent right after its last loaded child, at a window edge", async () => {
    const f = await fixture();
    try {
      // E1 shows T1 and T2; T2's next item in the backlog is S1, a Sous-tâche.
      await reparentItem({ id: f.id.T6, newParentId: f.id.E1, beforeId: f.id.T2, afterId: null }, f.actorId);
      expect(await childTitles(f, "E1")).toEqual(["T1", "T2", "T6", "T3", "T4", "T5"]);
      expect(await childTitles(f, "E2")).toEqual(["T7"]);
      const moved = await rowOf(f, "T6");
      expect(moved).toMatchObject({ parentId: f.id.E1, depth: 2 });
      expect(moved.path.startsWith(`${(await rowOf(f, "E1")).path}.`)).toBe(true);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("drops into a parent not unfolded as its first child, never after children not shown", async () => {
    const f = await fixture();
    try {
      await reparentItem({ id: f.id.T6, newParentId: f.id.E1 }, f.actorId);
      expect(await childTitles(f, "E1")).toEqual(["T6", "T1", "T2", "T3", "T4", "T5"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("keeps the rank of a drop into a parent without children instead of the backlog's last rank", async () => {
    const f = await fixture();
    try {
      await reparentItem({ id: f.id.T6, newParentId: f.id.E3 }, f.actorId);
      const moved = await rowOf(f, "T6");
      expect(moved).toMatchObject({ parentId: f.id.E3, rank: f.rank.get(f.id.T6), depth: 2 });
      expect(await childTitles(f, "E3")).toEqual(["T6"]);
      expect(await childTitles(f, "E2")).toEqual(["T7"]);
    } finally {
      await f.remove();
    }
  });

  it("keeps the rank of a drop without neighbors into the same parent", async () => {
    const f = await fixture();
    try {
      await reparentItem({ id: f.id.T3, newParentId: f.id.E1 }, f.actorId);
      expect((await rowOf(f, "T3")).rank).toBe(f.rank.get(f.id.T3));
      expect(await childTitles(f, "E1")).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    } finally {
      await f.remove();
    }
  });

  it("changes parent between two loaded children and carries the subtree along", async () => {
    const f = await fixture();
    try {
      await reparentItem({ id: f.id.T1, newParentId: f.id.E2, beforeId: f.id.T6, afterId: f.id.T7 }, f.actorId);
      expect(await childTitles(f, "E2")).toEqual(["T6", "T1", "T7"]);
      expect(await childTitles(f, "E1")).toEqual(["T2", "T3", "T4", "T5"]);
      const task = await rowOf(f, "T1");
      expect(task.path.startsWith(`${(await rowOf(f, "E2")).path}.`)).toBe(true);
      for (const name of ["S1", "S2"] as const) {
        const child = await rowOf(f, name);
        expect(child.depth).toBe(3);
        expect(child.path.startsWith(`${task.path}.`)).toBe(true);
      }
      expect(await childTitles(f, "T1")).toEqual(["S1", "S2"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("reorders after the last loaded sibling at a window edge", async () => {
    const f = await fixture();
    try {
      // « After T2 » with T3 not loaded: no next neighbor; T2's next item is S1.
      await moveItem({ id: f.id.T5, beforeId: f.id.T2, afterId: null }, f.actorId);
      expect(await childTitles(f, "E1")).toEqual(["T1", "T2", "T5", "T3", "T4"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("still refuses a cycle and leaves the hierarchy as it was", async () => {
    const f = await fixture();
    try {
      const before = await Promise.all((["T1", "S1", "S2"] as const).map((name) => rowOf(f, name)));
      await expect(reparentItem({ id: f.id.T1, newParentId: f.id.T1 }, f.actorId)).rejects.toThrow(/Cycle/);
      // Under its own Sous-tâche: refused before any write.
      await expect(reparentItem({ id: f.id.T1, newParentId: f.id.S1 }, f.actorId)).rejects.toThrow();
      await expect(reparentItem({ id: f.id.E1, newParentId: f.id.T1 }, f.actorId)).rejects.toThrow();
      const after = await Promise.all((["T1", "S1", "S2"] as const).map((name) => rowOf(f, name)));
      expect(after.map(({ parentId, path, depth, rank }) => ({ parentId, path, depth, rank })))
        .toEqual(before.map(({ parentId, path, depth, rank }) => ({ parentId, path, depth, rank })));
    } finally {
      await f.remove();
    }
  });
});
