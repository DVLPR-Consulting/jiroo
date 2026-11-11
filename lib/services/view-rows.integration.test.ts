import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogs,
  itemFixVersions,
  itemLabels,
  items,
  labels,
  releases,
  sprintItems,
  sprints,
  statuses,
} from "@/lib/db/schema/domain";
import type { Filters, GroupKey, SortField, ViewState } from "@/lib/items/filter";
import {
  listItemLabelPairs,
  listItems,
  listItemsWithAncestors,
} from "@/lib/services/items";
import { listItemFixVersionPairs } from "@/lib/services/item-fix-versions";
import { listSprintsForBacklog } from "@/lib/services/sprints";
import {
  backlogViewRows,
  listViewRows,
  matchingTaskIds,
  treeViewRows,
} from "@/lib/services/view-rows";
import { listWindowIds, loadListWindow } from "@/lib/services/list-window";
import type { ListCursor } from "@/lib/items/list-window";
import {
  legacyBacklogRows,
  legacyListRows,
  legacyMatchingTaskIds,
  legacyTreeRows,
  type LegacyViewInput,
} from "@/test-utils/legacy-view-rows";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Deterministic PRNG (mulberry32): the dataset is the same on every run. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Titles that exercise the search and the title sort: case and accent
 * variants of the same word (equal for a case-less sort, ties kept in
 * hierarchy order), exact duplicates, diacritic marks that are not letters
 * (`^`, backticks), full case mappings (İ, final sigma), punctuation, digits.
 */
const TITLES = [
  "Écran d'accueil",
  "ecran d'accueil",
  "ECRAN D'ACCUEIL",
  "Zèbre",
  "zebre",
  "abc",
  "Abc",
  "abc",
  "x^2 formule",
  "`code` brut",
  "Ça marche",
  "ça marche",
  "Œuvre",
  "oeuvre",
  "Ärger",
  "arger",
  "Bug 10",
  "Bug 9",
  "bug 9",
  "  espaces autour  ",
  "émoji 🎉",
  "İstanbul",
  "ΣΟΦΙΑ ΣΟΦΟΣ",
  "100 % fiable",
  "under_score",
  "back\\slash",
  "l'apostrophe",
  "naïve café",
  "Naive cafe",
  "Résumé",
  "resume",
  "Δ delta",
  "a-b",
  "ab",
  "a b",
];

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture() {
  const random = prng(143);
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const prefix = Array.from({ length: 5 }, () =>
    letters[Math.floor(Math.random() * letters.length)],
  ).join("");
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: prefix, name: "Parité des vues", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");

  const userSuffix = randomUUID().slice(0, 8);
  const userIds = [`jir143-a-${userSuffix}`, `jir143-b-${userSuffix}`];
  await db.insert(user).values(userIds.map((id, index) => ({
    id,
    name: `Parité ${index}`,
    email: `${id}@example.test`,
  })));

  const [todo, doing, review, done] = await db
    .insert(statuses)
    .values([
      { backlogId: backlog.id, name: "À faire", category: "todo" as const, order: 0, color: "#9aa0a6" },
      { backlogId: backlog.id, name: "En cours", category: "in_progress" as const, order: 1, color: "#3b82f6" },
      // Same order as « En cours »: the status sort keeps hierarchy order on ties.
      { backlogId: backlog.id, name: "En revue", category: "in_progress" as const, order: 1, color: "#a855f7" },
      { backlogId: backlog.id, name: "Terminé", category: "done" as const, order: 3, color: "#22c55e" },
    ])
    .returning();
  if (!todo || !doing || !review || !done) throw new Error("Fixture statuts impossible.");
  const statusIds = [todo.id, doing.id, review.id, done.id];

  const labelRows = await db
    .insert(labels)
    .values(["Front", "Back", "Ops"].map((name) => ({ backlogId: backlog.id, name, color: "#64748b" })))
    .returning();
  const releaseRows = await db
    .insert(releases)
    .values(["2026.11", "2026.12"].map((name) => ({ backlogId: backlog.id, name, createdBy: actor.id })))
    .returning();

  const usedNumbers = new Set<number>();
  // Keys of every length first: a text sort would put « -10 » before « -9 ».
  const firstNumbers = [9, 10, 99, 100, 1000, 2];
  const nextKey = () => {
    const forced = firstNumbers.shift();
    if (forced !== undefined) {
      usedNumbers.add(forced);
      return `${prefix}-${forced}`;
    }
    let n = 1 + Math.floor(random() * 3000);
    while (usedNumbers.has(n)) n = 1 + Math.floor(random() * 3000);
    usedNumbers.add(n);
    return `${prefix}-${n}`;
  };
  // Ranks mix cases and lengths: the hierarchy order compares them bytewise.
  const rankAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const usedRanks = new Set<string>();
  const nextRank = () => {
    let rank = "";
    while (rank === "" || usedRanks.has(rank)) {
      rank = Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick([...rankAlphabet])).join("");
    }
    usedRanks.add(rank);
    return rank;
  };
  // Three base instants and sub-millisecond offsets: equal to the millisecond
  // (ties in the old comparison) yet different in PostgreSQL.
  const instants = ["2026-08-01T09:00:00.120", "2026-08-01T09:00:00.121", "2026-09-15T17:30:05.004"];
  const timestamp = () =>
    sql`${`${pick(instants)}${String(Math.floor(random() * 1000)).padStart(3, "0")}+00`}::timestamptz`;
  const days = ["2026-11-20", "2026-11-21", "2026-12-01", "2027-01-05"];

  type Inserted = { id: string; path: string; depth: number; type: string };
  async function insertItem(
    type: "composant" | "epic" | "tache" | "soustache",
    parent: Inserted | null,
    overrides: Partial<typeof items.$inferInsert> = {},
  ): Promise<Inserted> {
    const id = randomUUID();
    const segment = id.replaceAll("-", "");
    const path = parent ? `${parent.path}.${segment}` : `root.${segment}`;
    const depth = parent ? parent.depth + 1 : 0;
    await db.insert(items).values({
      id,
      key: nextKey(),
      type,
      kind: random() < 0.3 ? "bug" : "feature",
      backlogId: backlog!.id,
      title: pick(TITLES),
      statusId: pick(statusIds),
      priority: Math.floor(random() * 5),
      // Every level may carry points: only tasks count in the totals.
      estimatePoints: random() < 0.7
        ? pick([0, 0.5, 1, 1.25, 2, 3, 5, 8, 13, 0.1, 0.2])
        : null,
      assigneeId: pick([null, actor!.id, ...userIds]),
      reporterId: actor!.id,
      parentId: parent?.id ?? null,
      rank: nextRank(),
      path,
      depth,
      dueDate: random() < 0.4 ? null : pick(days),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      ...overrides,
    });
    return { id, path, depth, type };
  }

  const c1 = await insertItem("composant", null);
  const c2 = await insertItem("composant", null);
  const e1 = await insertItem("epic", c1);
  const e2 = await insertItem("epic", c1);
  const e3 = await insertItem("epic", c2);
  // An epic outside any composant (« Sans composant »).
  const e4 = await insertItem("epic", null);
  const tasks: Inserted[] = [];
  for (let index = 0; index < 70; index += 1) {
    tasks.push(await insertItem("tache", index % 9 === 0 ? null : pick([e1, e2, e3, e4])));
  }
  const subtasks: Inserted[] = [];
  for (let index = 0; index < 35; index += 1) {
    subtasks.push(await insertItem("soustache", pick(tasks)));
  }
  // Soft-deleted rows never show nor count.
  const deletedTask = await insertItem("tache", e1, { deletedAt: new Date() });
  await insertItem("soustache", tasks[1]!, { deletedAt: new Date() });

  for (const row of [...tasks, ...subtasks, e1, e3, deletedTask]) {
    const chosen = labelRows.filter(() => random() < 0.35);
    if (chosen.length > 0) {
      await db.insert(itemLabels).values(chosen.map((label) => ({ itemId: row.id, labelId: label.id })));
    }
    const versions = releaseRows.filter(() => random() < 0.3);
    if (versions.length > 0) {
      await db.insert(itemFixVersions).values(versions.map((release) => ({
        backlogId: backlog.id,
        itemId: row.id,
        releaseId: release.id,
        addedBy: actor!.id,
      })));
    }
  }

  const [s0, s1, s2, s3] = await db
    .insert(sprints)
    .values([
      { backlogId: backlog.id, name: "Sprint 0", state: "completed" as const, rank: "a0", createdBy: actor.id, startedAt: new Date("2026-08-01"), completedAt: new Date("2026-08-15") },
      { backlogId: backlog.id, name: "Sprint 1", state: "active" as const, rank: "a1", createdBy: actor.id, startedAt: new Date("2026-11-01") },
      { backlogId: backlog.id, name: "Sprint 2", state: "planned" as const, rank: "a2", createdBy: actor.id },
      { backlogId: backlog.id, name: "Sprint 3", state: "planned" as const, rank: "a3", createdBy: actor.id },
    ])
    .returning();
  if (!s0 || !s1 || !s2 || !s3) throw new Error("Fixture sprints impossible.");
  const outcomes = ["completed", "removed", "carried_to_backlog", "carried_to_sprint"] as const;
  for (const task of tasks) {
    if (random() < 0.4) {
      const outcome = pick(outcomes);
      await db.insert(sprintItems).values({
        sprintId: s0.id,
        itemId: task.id,
        joinedBy: actor.id,
        joinedAt: new Date("2026-08-01T10:00:00Z"),
        leftAt: new Date("2026-08-15T10:00:00Z"),
        outcome,
        destinationSprintId: outcome === "carried_to_sprint" ? s1.id : null,
      });
    }
    const roll = random();
    const current = roll < 0.2 ? s1 : roll < 0.35 ? s2 : roll < 0.45 ? s3 : null;
    if (current) {
      await db.insert(sprintItems).values({
        sprintId: current.id,
        itemId: task.id,
        joinedBy: actor.id,
        joinedAt: new Date("2026-11-01T10:00:00Z"),
      });
    }
  }
  // A sous-tâche's own membership is ignored: it follows its parent's sprints.
  for (const subtask of subtasks.slice(0, 5)) {
    await db.insert(sprintItems).values({
      sprintId: s0.id,
      itemId: subtask.id,
      joinedBy: actor.id,
      joinedAt: new Date("2026-08-01T10:00:00Z"),
      leftAt: new Date("2026-08-15T10:00:00Z"),
      outcome: "completed",
    });
  }

  return {
    backlog,
    prefix,
    userIds,
    status: { todo, doing, review, done },
    labels: labelRows,
    releases: releaseRows,
    sprints: { s0, s1, s2, s3 },
    tree: { c1, c2, e1, e2, e3, e4 },
    tasks,
    subtasks,
  };
}

async function removeFixture(fixture: Fixture) {
  await db.delete(itemFixVersions).where(eq(itemFixVersions.backlogId, fixture.backlog.id));
  await db.delete(releases).where(eq(releases.backlogId, fixture.backlog.id));
  await db.delete(backlogs).where(eq(backlogs.id, fixture.backlog.id));
  await db.delete(user).where(inArray(user.id, fixture.userIds));
}

/** What the page loaded before JIR-143, read the same way. */
async function legacyInput(backlogId: string, state: ViewState): Promise<LegacyViewInput> {
  const releaseIds = state.filters.releaseIds;
  const [releaseItems, labelPairs, fixVersionPairs, statusRows, snapshot] = await Promise.all([
    listItems(backlogId, { releaseIds }),
    listItemLabelPairs(backlogId),
    listItemFixVersionPairs(backlogId),
    db.select().from(statuses).where(eq(statuses.backlogId, backlogId)),
    listSprintsForBacklog(backlogId),
  ]);
  const releaseFilterActive = releaseIds.length > 0;
  const loaded = releaseFilterActive
    ? await listItemsWithAncestors(backlogId, releaseItems.map((item) => item.id))
    : releaseItems;
  return {
    items: loaded,
    releaseMatchedIds: releaseFilterActive ? new Set(releaseItems.map((item) => item.id)) : null,
    labelPairs,
    fixVersionPairs,
    sprints: snapshot.sprints,
    memberships: snapshot.memberships,
    statuses: statusRows,
    state,
  };
}

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

function filterCases(f: Fixture): Array<[string, Filters]> {
  const filters = (partial: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...partial });
  const [l1, l2, l3] = f.labels;
  const [r1, r2] = f.releases;
  const { s0, s1, s2, s3 } = f.sprints;
  const { c1, c2, e1, e4 } = f.tree;
  const [ua, ub] = f.userIds;
  return [
    ["no filter", NO_FILTERS],
    ["search: accents and case", filters({ q: "ecran" })],
    ["search: upper case with accent", filters({ q: "ÉCRAN" })],
    ["search: trimmed, accented", filters({ q: "  zèbre  " })],
    ["search: a diacritic sign is dropped on both sides", filters({ q: "x2" })],
    ["search: only a diacritic sign", filters({ q: "^" })],
    ["search: key prefix", filters({ q: `${f.prefix.toLowerCase()}-1` })],
    ["search: key number", filters({ q: "12" })],
    ["search: full case mapping (İ)", filters({ q: "istanbul" })],
    ["search: Greek with final sigma", filters({ q: "σοφος" })],
    ["search: emoji", filters({ q: "🎉" })],
    ["search: LIKE wildcards are plain text", filters({ q: "%" })],
    ["search: underscore", filters({ q: "_" })],
    ["search: backslash", filters({ q: "\\" })],
    ["search: apostrophe", filters({ q: "l'a" })],
    ["search: ligature stays a letter", filters({ q: "oe" })],
    ["search: no match", filters({ q: "introuvable" })],
    ["type: tâches", filters({ types: ["tache"] })],
    ["type: structure", filters({ types: ["epic", "composant"] })],
    ["type: sous-tâches", filters({ types: ["soustache"] })],
    ["status: one", filters({ statusIds: [f.status.todo.id] })],
    ["status: two", filters({ statusIds: [f.status.doing.id, f.status.done.id] })],
    ["status: malformed id", filters({ statusIds: ["pas-un-uuid"] })],
    ["status: upper-case id matches nothing", filters({ statusIds: [f.status.todo.id.toUpperCase()] })],
    ["status: unknown id", filters({ statusIds: [randomUUID()] })],
    ["priority: one", filters({ priorities: [0] })],
    ["priority: two", filters({ priorities: [3, 4] })],
    ["assignee: one", filters({ assignees: [ua!] })],
    ["assignee: unassigned", filters({ assignees: ["none"] })],
    ["assignee: one or unassigned", filters({ assignees: [ub!, "none"] })],
    ["label: one", filters({ labels: [l1!.id] })],
    ["label: any of two", filters({ labels: [l2!.id, l3!.id] })],
    ["label: malformed id", filters({ labels: ["x"] })],
    ["version: one", filters({ releaseIds: [r1!.id] })],
    ["version: any of two", filters({ releaseIds: [r1!.id, r2!.id] })],
    ["sprint: completed (final scope only)", filters({ sprintIds: [s0.id] })],
    ["sprint: active", filters({ sprintIds: [s1.id] })],
    ["sprint: none", filters({ sprintIds: ["none"] })],
    ["sprint: planned or none", filters({ sprintIds: [s2.id, "none"] })],
    ["sprint: completed or planned", filters({ sprintIds: [s0.id, s3.id] })],
    ["kind: bug", filters({ kind: ["bug"] })],
    ["under: composant", filters({ underIds: [c1.id] })],
    ["under: epic", filters({ underIds: [e1.id] })],
    ["under: a task (its sous-tâches)", filters({ underIds: [f.tasks[3]!.id] })],
    ["under: malformed id", filters({ underIds: ["nope"] })],
    ["under: two parents", filters({ underIds: [c2.id, e4.id] })],
    ["combined: type, status and search", filters({ types: ["tache"], statusIds: [f.status.todo.id, f.status.review.id], q: "a" })],
    ["combined: version and label", filters({ releaseIds: [r1!.id], labels: [l1!.id] })],
    ["combined: version, under and no sprint", filters({ releaseIds: [r2!.id], underIds: [c1.id], sprintIds: ["none"] })],
    ["combined: unassigned feature of priority 1 or 2", filters({ assignees: ["none"], kind: ["feature"], priorities: [1, 2] })],
  ];
}

const SORTS: ViewState["sort"][] = [
  null,
  ...(["priority", "dueDate", "created", "updated", "key", "title", "status"] as SortField[]).flatMap(
    (field) => (["asc", "desc"] as const).map((dir) => ({ field, dir })),
  ),
];
const GROUPS: Array<GroupKey | null> = [null, "status", "assignee", "priority", "component", "parent"];

/** Every sort × group for a few filters, a deterministic sample for the others. */
function stateCases(f: Fixture): Array<[string, ViewState]> {
  const random = prng(1430);
  const fullMatrix = new Set(["no filter", "combined: type, status and search", "version: one"]);
  return filterCases(f).flatMap(([label, filters]) => {
    const combos = fullMatrix.has(label)
      ? SORTS.flatMap((sort) => GROUPS.map((group) => ({ sort, group })))
      : [
          { sort: null, group: null },
          ...Array.from({ length: 5 }, () => ({
            sort: SORTS[Math.floor(random() * SORTS.length)]!,
            group: GROUPS[Math.floor(random() * GROUPS.length)]!,
          })),
        ];
    return combos.map(({ sort, group }): [string, ViewState] => [
      `${label} · sort ${sort ? `${sort.field}:${sort.dir}` : "none"} · group ${group ?? "none"}`,
      { filters, sort, group },
    ]);
  });
}

describeDb("view rows computed in SQL match the in-memory computation (JIR-143)", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await createFixture();
  }, 120_000);

  afterAll(async () => {
    if (fixture) await removeFixture(fixture);
  });

  it("Liste: same rows, order, groups and group totals", async () => {
    const mismatches: string[] = [];
    for (const [label, state] of stateCases(fixture)) {
      const expected = legacyListRows(await legacyInput(fixture.backlog.id, state));
      const actual = await listViewRows(fixture.backlog.id, state);
      try {
        expect(actual).toEqual(expected);
      } catch {
        mismatches.push(label);
      }
    }
    expect(mismatches).toEqual([]);
  }, 300_000);

  it("Backlog: same rows per section, order and groups, and the same result count", async () => {
    const mismatches: string[] = [];
    for (const [label, state] of stateCases(fixture)) {
      const expected = legacyBacklogRows(await legacyInput(fixture.backlog.id, state));
      const actual = await backlogViewRows(fixture.backlog.id, state);
      try {
        expect(actual).toEqual(expected);
      } catch {
        mismatches.push(label);
      }
    }
    expect(mismatches).toEqual([]);
  }, 300_000);

  it("Arbre: same matches and the same dimmed ancestors, in hierarchy order", async () => {
    const mismatches: string[] = [];
    for (const [label, filters] of filterCases(fixture)) {
      const state = { filters, sort: null, group: null };
      const expected = legacyTreeRows(await legacyInput(fixture.backlog.id, state));
      const actual = await treeViewRows(fixture.backlog.id, filters);
      try {
        expect(actual).toEqual(expected);
      } catch {
        mismatches.push(label);
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);

  it("Board: the same tasks pass the filters", async () => {
    const mismatches: string[] = [];
    for (const [label, filters] of filterCases(fixture)) {
      const state = { filters, sort: null, group: null };
      const expected = legacyMatchingTaskIds(await legacyInput(fixture.backlog.id, state));
      const actual = await matchingTaskIds(fixture.backlog.id, filters);
      try {
        expect(actual).toEqual(expected);
      } catch {
        mismatches.push(label);
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);

  /** Every window of a Liste, read from cursor to cursor, joined back by group. */
  async function walkWindows(state: ViewState, limit: number) {
    const groups: Array<{ key: string; itemIds: string[] }> = [];
    let cursor: ListCursor | null = null;
    let total = -1;
    for (let windows = 0; windows < 1000; windows += 1) {
      const window = await listWindowIds(fixture.backlog.id, state, { cursor, limit });
      expect(window.rows.length).toBeLessThanOrEqual(limit);
      total = window.total;
      for (const row of window.rows) {
        const last = groups.at(-1);
        if (last && last.key === row.groupKey) last.itemIds.push(row.id);
        else groups.push({ key: row.groupKey, itemIds: [row.id] });
      }
      cursor = window.nextCursor;
      if (!cursor) break;
      // A window that is not the last one is full.
      expect(window.rows).toHaveLength(limit);
    }
    return { total, groups };
  }

  it("Liste by windows (JIR-145): the windows, read from cursor to cursor, are the Liste's rows", async () => {
    const mismatches: string[] = [];
    for (const [label, state] of stateCases(fixture)) {
      const expected = await listViewRows(fixture.backlog.id, state);
      const expectedGroups = expected.groups
        .filter((group) => group.itemIds.length > 0)
        .map(({ key, itemIds }) => ({ key, itemIds }));
      for (const limit of [1, 13, 100]) {
        const actual = await walkWindows(state, limit);
        try {
          expect(actual).toEqual({ total: expected.total, groups: expectedGroups });
        } catch {
          mismatches.push(`${label} · windows of ${limit}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  }, 600_000);

  it("Liste by windows: each window names its groups with their figures over the whole group", async () => {
    const mismatches: string[] = [];
    const sample = stateCases(fixture).filter((_, index) => index % 7 === 0);
    for (const [label, state] of sample) {
      const expected = await listViewRows(fixture.backlog.id, state);
      const summaryByKey = new Map(expected.groups.map((group) => [group.key, group.summary]));
      const shown: string[] = [];
      let cursor: ListCursor | null = null;
      do {
        const window = await loadListWindow(fixture.backlog.id, state, { cursor, limit: 40 });
        try {
          expect(window.total).toBe(expected.total);
          expect(window.groups.map((group) => group.key)).toEqual(
            [...new Set(window.rows.map((row) => row.groupKey))],
          );
          for (const group of window.groups) {
            expect(group.summary).toEqual(summaryByKey.get(group.key));
            if (state.group === null) expect(group.label).toBe("");
            else expect(group.label).not.toBe("");
          }
        } catch {
          mismatches.push(label);
        }
        shown.push(...window.rows.map((row) => row.id));
        cursor = window.nextCursor;
      } while (cursor);
      if (shown.join() !== expected.groups.flatMap((group) => group.itemIds).join()) mismatches.push(`${label} · rows`);
    }
    expect(mismatches).toEqual([]);
  }, 300_000);

  it("Liste by windows: rows carry what a Liste row shows", async () => {
    const state: ViewState = { filters: NO_FILTERS, sort: null, group: "parent" };
    const window = await loadListWindow(fixture.backlog.id, state, { cursor: null, limit: 100 });
    expect(window.rows).toHaveLength(100);
    expect(window.nextCursor).not.toBeNull();
    const [labelPairs, versionPairs] = await Promise.all([
      listItemLabelPairs(fixture.backlog.id),
      listItemFixVersionPairs(fixture.backlog.id),
    ]);
    const all = await listItems(fixture.backlog.id);
    const byId = new Map(all.map((item) => [item.id, item]));
    for (const row of window.rows) {
      const item = byId.get(row.id)!;
      expect(row).toMatchObject({
        key: item.key,
        type: item.type,
        title: item.title,
        statusId: item.statusId,
        estimatePoints: item.estimatePoints,
        dueDate: item.dueDate,
        assigneeId: item.assigneeId,
      });
      expect(row.assigneeName === null).toBe(item.assigneeId === null);
      expect(row.labels.map((label) => label.id).sort()).toEqual(
        labelPairs.filter((pair) => pair.itemId === row.id).map((pair) => pair.labelId).sort(),
      );
      expect(row.fixVersions.map((release) => release.id).sort()).toEqual(
        versionPairs.filter((pair) => pair.itemId === row.id).map((pair) => pair.releaseId).sort(),
      );
      const parent = item.parentId ? byId.get(item.parentId) : undefined;
      expect(row.parent).toEqual(parent ? { key: parent.key, title: parent.title, type: parent.type } : null);
      expect(row).not.toHaveProperty("description");
    }
  });

  it("Liste by windows: a cursor is a position in the order, not an offset", async () => {
    const state: ViewState = { filters: NO_FILTERS, sort: { field: "title", dir: "asc" }, group: "status" };
    const first = await listWindowIds(fixture.backlog.id, state, { cursor: null, limit: 20 });
    const before = await walkWindows(state, 1000);
    const allIds = before.groups.flatMap((group) => group.itemIds);
    // An item of the first window disappears: the next window neither skips nor repeats a row.
    const removed = first.rows[3]!.id;
    await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, removed));
    try {
      const next = await listWindowIds(fixture.backlog.id, state, { cursor: first.nextCursor, limit: 20 });
      expect(next.rows.map((row) => row.id)).toEqual(allIds.slice(20, 40));
      expect(next.total).toBe(allIds.length - 1);
    } finally {
      await db.update(items).set({ deletedAt: null }).where(eq(items.id, removed));
    }
    // A cursor of another sort is refused rather than misread.
    await expect(listWindowIds(fixture.backlog.id, { ...state, sort: null }, {
      cursor: first.nextCursor,
      limit: 20,
    })).rejects.toThrow();
  });

  it("the dataset holds the cases the parity must cover", async () => {
    const rows = await db
      .select({ title: items.title, key: items.key, dueDate: items.dueDate })
      .from(items)
      .where(eq(items.backlogId, fixture.backlog.id));
    const numbers = new Set(rows.map((row) => Number(row.key.split("-")[1])));
    expect([9, 10, 99, 100, 1000].every((n) => numbers.has(n))).toBe(true);
    // Titles equal without case or accents, and null due dates.
    const titles = new Set(rows.map((row) => row.title));
    expect(titles.has("Écran d'accueil") && titles.has("ecran d'accueil")).toBe(true);
    expect(rows.some((row) => row.dueDate === null)).toBe(true);
    expect(rows.some((row) => row.dueDate !== null)).toBe(true);
  });
});
