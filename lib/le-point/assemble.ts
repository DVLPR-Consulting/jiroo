import type { Blocker, Category, Day, LePointDataset, LePointTicket } from "@/lib/le-point/model";
import { dayInZone } from "@/lib/roadmap/days";

/**
 * « Le point » pilot (JIR-107): turns the rows read from one backlog into the
 * dataset the rules of `model.ts` read. Pure, so it is tested without a
 * database; `load.ts` does the permission-filtered reading.
 */

export type LePointRow = {
  id: string;
  key: string;
  title: string;
  type: "composant" | "epic" | "tache" | "soustache";
  kind: "feature" | "bug";
  parentId: string | null;
  status: string;
  category: Category;
  assigneeId: string | null;
  dueDate: Day | null;
  closedAt: Date | null;
  estimatePoints: number | null;
};

export type LePointSource = {
  /** The reader: the viewer of both perspectives, a reading choice and never a permission. */
  viewerId: string;
  today: Day;
  lastVisit: Day;
  firstVisit: boolean;
  backlog: { key: string; name: string; id?: string };
  /** The backlog's live items, in backlog order. */
  items: LePointRow[];
  /** « source blocks target », the target being one of `items`; a null source is in a backlog the reader cannot browse. */
  blocks: { sourceId: string | null; targetId: string }[];
  /** Live sources of `blocks` in other backlogs the reader may browse. */
  outside: LePointRow[];
  /** Live comments that mention someone. */
  comments: { itemId: string; authorId: string; mentions: string[]; at: Date; body: string }[];
  lastActivity: { itemId: string; at: Date }[];
  /** Archived ones included: they only date a delivery, they are never the next one. */
  releases: { id: string; name: string; planned: Day | null; released: Day | null; archived?: boolean }[];
  fixVersions: { itemId: string; releaseId: string }[];
  sprint: LePointDataset["sprint"];
  /** The items in the active sprint; null without one. */
  sprintItemIds: string[] | null;
  /** Those of `sprintItemIds` that joined after the sprint started: scope added mid-sprint (JIR-124). */
  sprintAddedItemIds?: string[];
  people: { id: string; name: string }[];
  sprintChanges?: {
    kind: "added" | "removed";
    key: string;
    title: string;
    points: number | null;
    at: Date;
    actor: string | null;
  }[];
  sprintVelocity?: number | null;
  members?: { id: string; name: string }[];
  /** Declared absences touching the period around today, `YYYY-MM-DD` both ends included (JIR-124). */
  absences?: { id: string; userId: string; startDate: string; endDate: string }[];
  canManageAbsences?: boolean;
};

const LAST_DAY = "9999-12-31";

export function assembleLePoint(source: LePointSource): LePointDataset {
  const byId = new Map(source.items.map((row) => [row.id, row]));
  const outside = new Map(source.outside.map((row) => [row.id, row]));
  const lastActivity = new Map(source.lastActivity.map((row) => [row.itemId, dayInZone(row.at)]));
  const releaseById = new Map(source.releases.map((release) => [release.id, release]));
  const inSprint = source.sprintItemIds ? new Set(source.sprintItemIds) : null;
  const addedToSprint = new Set(source.sprintAddedItemIds ?? []);
  const versionsOf = new Map<string, string[]>();
  for (const { itemId, releaseId } of source.fixVersions) {
    if (releaseById.has(releaseId)) versionsOf.set(itemId, [...(versionsOf.get(itemId) ?? []), releaseId]);
  }

  // A task belongs to the epic right above it. Sub-tasks do not count towards
  // an objective: Jira's epic progress counts the epic's own issues only.
  const epicOf = (row: LePointRow) => {
    if (row.type !== "tache" || !row.parentId) return null;
    const parent = byId.get(row.parentId);
    return parent?.type === "epic" ? parent : null;
  };

  function toTicket(row: LePointRow): LePointTicket {
    const shape = row.kind === "bug" ? "bug" : row.type === "soustache" ? "subtask" : undefined;
    return {
      key: row.key,
      title: row.title,
      objective: epicOf(row)?.key ?? null,
      status: row.status,
      category: row.category,
      ...(shape ? { shape } : {}),
      // Without a sprint (kanban), a due date is the commitment.
      committed: row.category === "in_progress" || (inSprint ? inSprint.has(row.id) : row.dueDate !== null),
      assignee: row.assigneeId,
      due: row.dueDate,
      ...(row.category === "done" && row.closedAt ? { done: dayInZone(row.closedAt) } : {}),
      lastActivity: lastActivity.get(row.id) ?? null,
      points: row.estimatePoints,
      ...(inSprint?.has(row.id) ? { inSprint: true } : {}),
      ...(addedToSprint.has(row.id) ? { addedAfterStart: true } : {}),
    };
  }

  const blockersOf = new Map<string, Blocker[]>();
  for (const { sourceId, targetId } of source.blocks) {
    const known = sourceId ? (byId.get(sourceId) ?? outside.get(sourceId)) : undefined;
    if (sourceId && !known) continue;
    const blocker: Blocker = known ? { key: known.key } : { hidden: true };
    blockersOf.set(targetId, [...(blockersOf.get(targetId) ?? []), blocker]);
  }

  const tickets: LePointTicket[] = source.items
    .filter((row) => row.type === "tache" || row.type === "soustache")
    .map((row) => {
      const blockedBy = blockersOf.get(row.id);
      return { ...toTicket(row), ...(blockedBy ? { blockedBy } : {}) };
    });
  for (const row of source.outside) tickets.push({ ...toTicket(row), objective: null, external: true });
  // An epic or a component of the backlog can block a task too: it is kept to
  // explain the block, never counted as anyone's work.
  const blockingSources = new Set(source.blocks.map((block) => block.sourceId));
  for (const row of source.items) {
    if (blockingSources.has(row.id) && row.type !== "tache" && row.type !== "soustache") {
      tickets.push({ ...toTicket(row), objective: null, external: true });
    }
  }

  // An objective's delivery: its own fix version, else the versions of its
  // tasks (of the open ones while some are planned); the next unpublished
  // one, else the last published one.
  function deliveryOf(epic: LePointRow) {
    const children = source.items.filter((row) => epicOf(row)?.id === epic.id);
    const open = children.filter((row) => row.category !== "done");
    const own = versionsOf.get(epic.id) ?? [];
    const planned = open.some((row) => versionsOf.has(row.id)) ? open : children;
    const ids = own.length > 0 ? own : planned.flatMap((row) => versionsOf.get(row.id) ?? []);
    const candidates = [...new Set(ids)].map((id) => releaseById.get(id)!);
    const next = candidates
      .filter((release) => !release.released && !release.archived)
      .sort((a, b) => (a.planned ?? LAST_DAY).localeCompare(b.planned ?? LAST_DAY))[0];
    if (next) return next;
    return candidates
      .filter((release) => release.released)
      .sort((a, b) => b.released!.localeCompare(a.released!))[0] ?? null;
  }

  // Shipped: its own fix version is published, else every one of its tasks is
  // in a published version. Anything unknown keeps the objective shown.
  const published = (id: string) => releaseById.get(id)?.released != null;
  function shipped(epic: LePointRow) {
    const own = versionsOf.get(epic.id) ?? [];
    if (own.length > 0) return own.some(published);
    const children = source.items.filter((row) => epicOf(row)?.id === epic.id);
    return children.length > 0 && children.every((row) => (versionsOf.get(row.id) ?? []).some(published));
  }

  const objectives = source.items
    .filter((row) => row.type === "epic")
    .filter((epic) => epic.category !== "done" || !shipped(epic))
    .map((epic) => {
      const release = deliveryOf(epic);
      const objective = { key: epic.key, title: epic.title, due: epic.dueDate };
      // A published version speaks for the whole objective only once all of it shipped.
      if (release?.released && !shipped(epic)) return { ...objective, release: null, partial: true };
      return { ...objective, release: release?.name ?? null };
    });

  const mentions = source.comments.flatMap((comment) => {
    const item = byId.get(comment.itemId);
    if (!item) return [];
    return comment.mentions.map((mentioned) => ({
      ticket: item.key,
      author: comment.authorId,
      mentioned,
      day: dayInZone(comment.at),
      text: comment.body,
    }));
  });

  return {
    today: source.today,
    lastVisit: source.lastVisit,
    ...(source.firstVisit ? { firstVisit: true } : {}),
    backlog: source.backlog,
    people: source.people,
    personas: { developer: source.viewerId, product: source.viewerId },
    sprint: source.sprint
      ? {
          ...source.sprint,
          goal: source.sprint.goal?.trim() || null,
          changes: (source.sprintChanges ?? []).map(({ at, ...change }) => ({ ...change, day: dayInZone(at) })),
          velocity: source.sprintVelocity ?? null,
        }
      : null,
    members: source.members ?? [],
    absences: (source.absences ?? []).map((absence) => ({ id: absence.id, user: absence.userId, start: absence.startDate, end: absence.endDate })),
    ...(source.canManageAbsences ? { canManageAbsences: true } : {}),
    releases: source.releases
      .filter((release) => !release.archived || release.released)
      .map(({ name, planned, released }) => ({ name, planned, released })),
    objectives,
    tickets,
    mentions,
  };
}
