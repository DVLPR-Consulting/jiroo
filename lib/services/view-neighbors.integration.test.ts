import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import type { ItemType } from "@/lib/design/constants";
import type { Filters, ViewState } from "@/lib/items/filter";
import { LIST_WINDOW_SIZE } from "@/lib/items/list-window";
import { assignItemsToSprint, createSprint } from "@/lib/services/sprints";
import { backlogSectionNeighbors, loadBacklogWindow } from "@/lib/services/backlog-window";
import { loadListWindow, viewNeighbors, type ViewNeighbors } from "@/lib/services/list-window";
import { treeNeighbors } from "@/lib/services/tree-window";

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
const MANUAL: ViewState = { filters: NO_FILTERS, sort: null, group: null };
const BY_PRIORITY: ViewState = { filters: NO_FILTERS, sort: { field: "title", dir: "desc" }, group: "priority" };

const TASKS = 130;

/**
 * The drawer's previous / next items beyond the rows shown (JIR-153): one
 * Composant, two Epics, 130 Tâches spread over both (ranks shuffled, so the
 * tree and the flat order differ), five Sous-tâches under the first Tâche,
 * three Tâches in a sprint and one deleted.
 */
async function fixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `VN${suffix}`, name: "Voisins du panneau", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo] = await db
    .insert(statuses)
    .values([{ backlogId: backlog.id, name: "À faire", category: "todo" as const, order: 0, color: "#9aa0a6" }])
    .returning();
  type Spec = { name: string; type: ItemType; parent: string | null };
  const specs: Spec[] = [
    { name: "C", type: "composant", parent: null },
    { name: "E1", type: "epic", parent: "C" },
    { name: "E2", type: "epic", parent: "C" },
    ...Array.from({ length: TASKS }, (_, index): Spec => ({
      name: `T${index}`,
      type: "tache",
      parent: index % 3 === 0 ? "E2" : "E1",
    })),
    ...Array.from({ length: 5 }, (_, index): Spec => ({ name: `S${index}`, type: "soustache", parent: "T0" })),
    { name: "X", type: "tache", parent: "E1" },
  ];
  const sorted = generateNKeysBetween(null, null, specs.length);
  // A fixed shuffle: rank i goes to spec (i * 37) mod n (37 is prime with n).
  const ranks = specs.map((_, index) => sorted[(index * 37) % specs.length]!);
  const id = new Map(specs.map((spec) => [spec.name, randomUUID()]));
  const compact = (value: string) => value.replaceAll("-", "");
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const pathOf = (name: string): string => {
    const parent = byName.get(name)!.parent;
    return `${parent ? pathOf(parent) : "root"}.${compact(id.get(name)!)}`;
  };
  const depthOf = (name: string): number => {
    const parent = byName.get(name)!.parent;
    return parent ? depthOf(parent) + 1 : 0;
  };
  const rows = specs.map((spec, index) => ({
    id: id.get(spec.name)!,
    key: `${backlog.key}-${index + 1}`,
    type: spec.type,
    backlogId: backlog.id,
    title: spec.name,
    parentId: spec.parent ? id.get(spec.parent)! : null,
    statusId: todo!.id,
    reporterId: actor.id,
    priority: index % 5,
    rank: ranks[index]!,
    path: pathOf(spec.name),
    depth: depthOf(spec.name),
    deletedAt: spec.name === "X" ? new Date() : null,
  }));
  await db.insert(items).values(rows);
  const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
  await assignItemsToSprint(
    { backlogId: backlog.id, sprintId: sprint.id, itemIds: ["T1", "T2", "T3"].map((name) => id.get(name)!) },
    actor.id,
  );
  return {
    backlogId: backlog.id,
    keyOf: (name: string) => rows.find((row) => row.title === name)!.key,
    rows,
    remove: () => db.delete(backlogs).where(eq(backlogs.id, backlog.id)),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** What the drawer should offer around each key of an ordered view. */
function expected(keys: string[]): Map<string, ViewNeighbors> {
  return new Map(keys.map((key, index) => [key, {
    inView: true,
    previous: keys[index - 1] ?? null,
    next: keys[index + 1] ?? null,
  }]));
}

type Row = Fixture["rows"][number];

const bytewise = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A view's order computed here, apart from the SQL: the hierarchy order
 * without a sort (depth, rank, key), else titles descending; with the
 * priority group, groups in first-seen order.
 */
function flatOrder(rows: Row[], state: ViewState): string[] {
  const sorted = state.sort
    ? [...rows].sort((a, b) => b.title.localeCompare(a.title, "und", { sensitivity: "base" }))
    : [...rows].sort((a, b) => a.depth - b.depth || bytewise(a.rank, b.rank) || bytewise(a.key, b.key));
  if (!state.group) return sorted.map((row) => row.key);
  const groups = new Map<number, Row[]>();
  for (const row of sorted) groups.set(row.priority, [...(groups.get(row.priority) ?? []), row]);
  return [...groups.values()].flat().map((row) => row.key);
}

const live = (f: Fixture) => f.rows.filter((row) => row.deletedAt === null);

/** The Arbre unfolded whole, a parent before its children, siblings by rank. */
function treeOrder(f: Fixture, keep: (row: Row) => boolean): string[] {
  const walk = (parentId: string | null): Row[] => live(f)
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => bytewise(a.rank, b.rank))
    .flatMap((row) => [row, ...walk(row.id)]);
  return walk(null).filter(keep).map((row) => row.key);
}

describeDb("Drawer neighbors beyond the rows shown (JIR-153)", () => {
  it("gives the Liste's neighbors of rows past its first window, in its order", async () => {
    const f = await fixture();
    try {
      for (const state of [MANUAL, BY_PRIORITY]) {
        const keys = flatOrder(live(f), state);
        expect(keys.length).toBeGreaterThan(LIST_WINDOW_SIZE);
        const first = await loadListWindow(f.backlogId, state, { cursor: null });
        expect(first.rows.map((row) => row.key)).toEqual(keys.slice(0, LIST_WINDOW_SIZE));
        const shown = new Set(first.rows.map((row) => row.key));
        const beyond = keys.filter((key) => !shown.has(key));
        expect(beyond.length).toBeGreaterThan(0);
        const wanted = expected(keys);
        for (const key of keys) {
          expect(await viewNeighbors(f.backlogId, state, key), key).toEqual(wanted.get(key));
        }
      }
      // The last row has no next one; a deleted item is not in the view.
      expect(await viewNeighbors(f.backlogId, MANUAL, f.keyOf("X")))
        .toEqual({ inView: false, previous: null, next: null });
    } finally {
      await f.remove();
    }
  }, 60_000);

  it("keeps to the filters: an item they leave out has no neighbors", async () => {
    const f = await fixture();
    try {
      const state: ViewState = { ...MANUAL, filters: { ...NO_FILTERS, priorities: [2] } };
      const keys = flatOrder(live(f).filter((row) => row.priority === 2), state);
      const wanted = expected(keys);
      for (const key of keys) {
        expect(await viewNeighbors(f.backlogId, state, key)).toEqual(wanted.get(key));
      }
      const outside = f.rows.find((row) => row.priority !== 2 && row.deletedAt === null)!;
      expect(await viewNeighbors(f.backlogId, state, outside.key))
        .toEqual({ inView: false, previous: null, next: null });
    } finally {
      await f.remove();
    }
  }, 60_000);

  it("gives the Backlog section's neighbors in its order, without the sprint's tasks", async () => {
    const f = await fixture();
    try {
      for (const state of [MANUAL, BY_PRIORITY]) {
        // Without a sort, the Backlog's manual order is the rank alone.
        const section = live(f).filter((row) => row.type === "tache" && !["T1", "T2", "T3"].includes(row.title));
        const keys = state.sort
          ? flatOrder(section, state)
          : [...section].sort((a, b) => bytewise(a.rank, b.rank)).map((row) => row.key);
        expect(keys.length).toBeGreaterThan(LIST_WINDOW_SIZE);
        const first = await loadBacklogWindow(f.backlogId, state, { cursor: null });
        expect(first.rows.map((row) => row.key)).toEqual(keys.slice(0, LIST_WINDOW_SIZE));
        const wanted = expected(keys);
        for (const key of keys) {
          expect(await backlogSectionNeighbors(f.backlogId, state, key), key).toEqual(wanted.get(key));
        }
        // A sprint's task (shown whole above) and an epic are not in the section.
        for (const name of ["T1", "E1", "S0"]) {
          expect((await backlogSectionNeighbors(f.backlogId, state, f.keyOf(name))).inView).toBe(false);
        }
      }
    } finally {
      await f.remove();
    }
  }, 60_000);

  it("gives the Arbre's neighbors unfolded whole, and only the matches with a filter", async () => {
    const f = await fixture();
    try {
      const keys = treeOrder(f, () => true);
      const wanted = expected(keys);
      for (const key of keys) {
        expect(await treeNeighbors(f.backlogId, NO_FILTERS, key), key).toEqual(wanted.get(key));
      }
      // Filtered to the Tâches: the dimmed Epics and the Sous-tâches are skipped.
      const tasks = treeOrder(f, (row) => row.type === "tache");
      const filtered = expected(tasks);
      const filters: Filters = { ...NO_FILTERS, types: ["tache"] };
      for (const key of tasks) {
        expect(await treeNeighbors(f.backlogId, filters, key), key).toEqual(filtered.get(key));
      }
      expect((await treeNeighbors(f.backlogId, filters, f.keyOf("E1"))).inView).toBe(false);

      // A branch the user folded: its children are skipped, as the rows shown
      // skip them; an item opened inside it keeps its place.
      const e1 = f.rows.find((row) => row.title === "E1")!;
      const insideE1 = (row: Row) => row.path.startsWith(`${e1.path}.`);
      const unfolded = treeOrder(f, (row) => !insideE1(row));
      const skipping = expected(unfolded);
      for (const key of unfolded) {
        expect(await treeNeighbors(f.backlogId, NO_FILTERS, key, [e1.key]), key).toEqual(skipping.get(key));
      }
      const t4 = f.rows.find((row) => row.title === "T4")!;
      expect(insideE1(t4)).toBe(true);
      const withT4 = treeOrder(f, (row) => !insideE1(row) || row.id === t4.id);
      expect(await treeNeighbors(f.backlogId, NO_FILTERS, t4.key, [e1.key])).toEqual(expected(withT4).get(t4.key));
    } finally {
      await f.remove();
    }
  }, 60_000);
});
