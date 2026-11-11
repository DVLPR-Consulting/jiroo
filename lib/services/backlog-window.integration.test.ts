import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, statuses } from "@/lib/db/schema/domain";
import type { ListCursor } from "@/lib/items/list-window";
import type { Filters, ViewState } from "@/lib/items/filter";
import { rankBacklogItem } from "@/lib/services/items";
import { assignItemsToSprint, createSprint, moveItemToSprint } from "@/lib/services/sprints";
import { loadBacklogWindow } from "@/lib/services/backlog-window";
import { backlogViewRows } from "@/lib/services/view-rows";

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

const NAMES = ["E1", "B1", "B2", "S1", "D1", "B3", "B4", "E2", "B5", "S2", "X1", "B6"] as const;
type Name = (typeof NAMES)[number];

/**
 * The Backlog section by windows (JIR-146, JIR-120 D4): a drop whose next
 * neighbor is not loaded lands right after the last loaded row, never at the
 * end of the section the user does not see.
 *
 * In the backlog's single rank order (every type, every section):
 *   E1 · B1 B2 · S1 · D1 · B3 B4 · E2 · B5 · S2 · X1(deleted) · B6
 * where B* are Backlog-section tasks, S* tasks of a planned sprint, D1 a done
 * task without a sprint, E* epics and X1 a deleted task; B6 sits under E2,
 * every other task under E1. With windows of two, B2's next item in the
 * backlog is a sprint task and B4's an epic.
 */
async function fixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `BW${suffix}`, name: "Backlog par fenêtres", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [todo, done] = await db
    .insert(statuses)
    .values([
      { backlogId: backlog.id, name: "À faire", category: "todo" as const, order: 0, color: "#9aa0a6" },
      { backlogId: backlog.id, name: "Terminé", category: "done" as const, order: 1, color: "#16a34a" },
    ])
    .returning();
  const ranks = generateNKeysBetween(null, null, NAMES.length);
  const id = Object.fromEntries(NAMES.map((name) => [name, randomUUID()])) as Record<Name, string>;
  const compact = (value: string) => value.replaceAll("-", "");
  const rows = NAMES.map((name, index) => {
    const epic = name.startsWith("E");
    const parentId = epic ? null : name === "B6" ? id.E2 : id.E1;
    return {
      id: id[name],
      key: `${backlog.key}-${index + 1}`,
      type: epic ? ("epic" as const) : ("tache" as const),
      backlogId: backlog.id,
      title: name,
      parentId,
      statusId: name === "D1" ? done!.id : todo!.id,
      reporterId: actor.id,
      rank: ranks[index]!,
      estimatePoints: epic ? null : index,
      path: parentId ? `root.${compact(parentId)}.${compact(id[name])}` : `root.${compact(id[name])}`,
      depth: epic ? 0 : 1,
      deletedAt: name === "X1" ? new Date() : null,
    };
  });
  await db.insert(items).values(rows);
  const sprint = await createSprint({ backlogId: backlog.id }, actor.id);
  const emptySprint = await createSprint({ backlogId: backlog.id }, actor.id);
  await assignItemsToSprint({ backlogId: backlog.id, sprintId: sprint.id, itemIds: [id.S1, id.S2] }, actor.id);
  return {
    actorId: actor.id,
    backlogId: backlog.id,
    sprintId: sprint.id,
    emptySprintId: emptySprint.id,
    id,
    title: new Map(rows.map((row) => [row.id, row.title])),
    remove: () => db.delete(backlogs).where(eq(backlogs.id, backlog.id)),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** The Backlog section, read window after window, as titles. */
async function sectionTitles(f: Fixture, limit = 2, state: ViewState = MANUAL): Promise<string[]> {
  const titles: string[] = [];
  let cursor: ListCursor | null = null;
  for (let read = 0; read < 100; read += 1) {
    const window = await loadBacklogWindow(f.backlogId, state, { cursor, limit });
    titles.push(...window.rows.map((row) => f.title.get(row.id)!));
    cursor = window.nextCursor;
    if (!cursor) break;
  }
  return titles;
}

/** A sprint section's tasks, in the Backlog's order. */
async function sprintTitles(f: Fixture, sprintId: string): Promise<string[]> {
  const rows = await backlogViewRows(f.backlogId, MANUAL);
  return (rows.sections.get(sprintId) ?? []).flatMap((group) => group.itemIds).map((id) => f.title.get(id)!);
}

async function expectUniqueRanks(f: Fixture) {
  const rows = await db.select({ rank: items.rank }).from(items).where(eq(items.backlogId, f.backlogId));
  expect(new Set(rows.map((row) => row.rank)).size).toBe(rows.length);
}

describeDb("Backlog section by windows (JIR-146)", () => {
  it("serves the section window by window in rank order, without sprint, done or deleted tasks", async () => {
    const f = await fixture();
    try {
      const first = await loadBacklogWindow(f.backlogId, MANUAL, { cursor: null, limit: 2 });
      expect(first.rows.map((row) => f.title.get(row.id))).toEqual(["B1", "B2"]);
      expect(first.total).toBe(6);
      expect(first.nextCursor).not.toBeNull();
      expect(first.rows[0]).toMatchObject({
        key: expect.any(String),
        type: "tache",
        rank: expect.any(String),
        parent: { title: "E1" },
      });
      expect(await sectionTitles(f)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
      const all = await loadBacklogWindow(f.backlogId, MANUAL, { cursor: null, limit: 100 });
      expect(all.rows).toHaveLength(6);
      expect(all.nextCursor).toBeNull();
      // The sprint sections stay whole, served apart from the Backlog section.
      expect(await sprintTitles(f, f.sprintId)).toEqual(["S1", "S2"]);
      expect((await backlogViewRows(f.backlogId, MANUAL)).sections.has("backlog")).toBe(false);
    } finally {
      await f.remove();
    }
  });

  it("a sprint task dropped after the last loaded row lands right after it, its next item being a sprint task", async () => {
    const f = await fixture();
    try {
      // The client loaded B1 B2: B2 is the last row it has, B3 is not loaded.
      const first = await loadBacklogWindow(f.backlogId, MANUAL, { cursor: null, limit: 2 });
      await moveItemToSprint(
        { backlogId: f.backlogId, itemId: f.id.S2, sprintId: null, beforeId: f.id.B2, afterId: null },
        f.actorId,
      );
      expect(await sectionTitles(f)).toEqual(["B1", "B2", "S2", "B3", "B4", "B5", "B6"]);
      // The next window, read from the cursor the client holds, starts with it, once.
      const next = await loadBacklogWindow(f.backlogId, MANUAL, { cursor: first.nextCursor, limit: 2 });
      expect(next.rows.map((row) => f.title.get(row.id))).toEqual(["S2", "B3"]);
      expect(next.total).toBe(7);
      expect(await sprintTitles(f, f.sprintId)).toEqual(["S1"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("a Backlog task ranked after the last loaded row lands right after it, its next item being an epic", async () => {
    const f = await fixture();
    try {
      // Windows B1 B2 and B3 B4 loaded: B4 is the edge, followed by E2 then B5.
      await rankBacklogItem(
        { backlogId: f.backlogId, id: f.id.B1, beforeId: f.id.B4, afterId: null },
        f.actorId,
      );
      expect(await sectionTitles(f)).toEqual(["B2", "B3", "B4", "B1", "B5", "B6"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("a drop before the first loaded row lands right before it", async () => {
    const f = await fixture();
    try {
      await moveItemToSprint(
        { backlogId: f.backlogId, itemId: f.id.S1, sprintId: null, beforeId: null, afterId: f.id.B1 },
        f.actorId,
      );
      expect(await sectionTitles(f)).toEqual(["S1", "B1", "B2", "B3", "B4", "B5", "B6"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("a drop into an empty section, the Backlog's or a sprint's, keeps every rank unique", async () => {
    const f = await fixture();
    try {
      await moveItemToSprint(
        { backlogId: f.backlogId, itemId: f.id.B3, sprintId: f.emptySprintId, beforeId: null, afterId: null },
        f.actorId,
      );
      expect(await sprintTitles(f, f.emptySprintId)).toEqual(["B3"]);
      // Empty the Backlog section, then drop into it with no neighbor at all.
      await assignItemsToSprint(
        { backlogId: f.backlogId, sprintId: f.sprintId, itemIds: [f.id.B1, f.id.B2, f.id.B4, f.id.B5, f.id.B6] },
        f.actorId,
      );
      const empty = await loadBacklogWindow(f.backlogId, MANUAL, { cursor: null, limit: 2 });
      expect(empty).toMatchObject({ total: 0, rows: [], nextCursor: null });
      await moveItemToSprint(
        { backlogId: f.backlogId, itemId: f.id.B4, sprintId: null, beforeId: null, afterId: null },
        f.actorId,
      );
      expect(await sectionTitles(f)).toEqual(["B4"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("moves between a sprint and the Backlog: a row of a later window goes between two sprint tasks", async () => {
    const f = await fixture();
    try {
      await moveItemToSprint(
        { backlogId: f.backlogId, itemId: f.id.B5, sprintId: f.sprintId, beforeId: f.id.S1, afterId: f.id.S2 },
        f.actorId,
      );
      expect(await sprintTitles(f, f.sprintId)).toEqual(["S1", "B5", "S2"]);
      expect(await sectionTitles(f)).toEqual(["B1", "B2", "B3", "B4", "B6"]);
      // A neighbor of another section is refused, both ways.
      await expect(moveItemToSprint(
        { backlogId: f.backlogId, itemId: f.id.B6, sprintId: f.sprintId, beforeId: f.id.B4, afterId: null },
        f.actorId,
      )).rejects.toThrow("Le voisin n’appartient pas à la section cible.");
      await expect(moveItemToSprint(
        { backlogId: f.backlogId, itemId: f.id.S1, sprintId: null, beforeId: f.id.S2, afterId: null },
        f.actorId,
      )).rejects.toThrow("Le voisin n’appartient pas à la section cible.");
      expect(await sprintTitles(f, f.sprintId)).toEqual(["S1", "B5", "S2"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("two drops at the same window edge at once both land right after it, with unique ranks", async () => {
    const f = await fixture();
    try {
      await Promise.all([
        moveItemToSprint(
          { backlogId: f.backlogId, itemId: f.id.S1, sprintId: null, beforeId: f.id.B2, afterId: null },
          f.actorId,
        ),
        rankBacklogItem(
          { backlogId: f.backlogId, id: f.id.B6, beforeId: f.id.B2, afterId: null },
          f.actorId,
        ),
        rankBacklogItem(
          { backlogId: f.backlogId, id: f.id.B5, beforeId: f.id.B2, afterId: null },
          f.actorId,
        ),
      ]);
      const titles = await sectionTitles(f);
      expect(titles.slice(0, 2)).toEqual(["B1", "B2"]);
      expect(titles.slice(2, 5).sort()).toEqual(["B5", "B6", "S1"]);
      expect(titles.slice(5)).toEqual(["B3", "B4"]);
      await expectUniqueRanks(f);
    } finally {
      await f.remove();
    }
  });

  it("with a sort, a group and a filter, windows walk the filtered section once", async () => {
    const f = await fixture();
    try {
      const sorted: ViewState = { filters: NO_FILTERS, sort: { field: "title", dir: "desc" }, group: null };
      expect(await sectionTitles(f, 2, sorted)).toEqual(["B6", "B5", "B4", "B3", "B2", "B1"]);
      const grouped: ViewState = { filters: { ...NO_FILTERS, underIds: [f.id.E1] }, sort: null, group: "parent" };
      const window = await loadBacklogWindow(f.backlogId, grouped, { cursor: null, limit: 4 });
      expect(window.total).toBe(5);
      // The group spans two windows: its count is the whole filtered group's.
      expect(window.groups).toEqual([{ key: f.id.E1, label: "E1", count: 5 }]);
      expect(await sectionTitles(f, 4, grouped)).toEqual(["B1", "B2", "B3", "B4", "B5"]);
      const byParent: ViewState = { filters: NO_FILTERS, sort: null, group: "parent" };
      const all = await loadBacklogWindow(f.backlogId, byParent, { cursor: null, limit: 100 });
      expect(all.groups).toEqual([
        { key: f.id.E1, label: "E1", count: 5 },
        { key: f.id.E2, label: "E2", count: 1 },
      ]);
    } finally {
      await f.remove();
    }
  });
});
