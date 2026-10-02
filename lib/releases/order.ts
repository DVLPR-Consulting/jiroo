import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Manual release order: one fractional-index sequence per backlog (Jira's single
 * version order). Ranks compare in binary (code-unit) order, which matches the
 * `collate "C"` ordering used in SQL for ASCII fractional keys.
 */

export type OrderedRelease = { id: string; rank: string; archived: boolean };

function binaryCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Assigns ranks to rows that have none, keeping the current display order.
 * `rows` must be in display order; unranked rows are placed after every ranked
 * row, in their input order. Returns the rank of every row (existing ranks kept).
 */
export function materializeReleaseRanks(
  rows: ReadonlyArray<{ id: string; rank: string | null }>,
): Map<string, string> {
  const ranks = new Map<string, string>();
  let highest: string | null = null;
  const unranked: string[] = [];
  for (const row of rows) {
    if (row.rank === null) {
      unranked.push(row.id);
      continue;
    }
    ranks.set(row.id, row.rank);
    if (highest === null || binaryCompare(row.rank, highest) > 0) highest = row.rank;
  }
  const generated = generateNKeysBetween(highest, null, unranked.length);
  unranked.forEach((id, index) => ranks.set(id, generated[index]!));
  return ranks;
}

/**
 * Computes the new rank of `releaseId` so that it sits between `beforeId` and
 * `afterId`. Adjacency is validated against the current order of non-archived
 * versions (the only ones draggable); archived versions keep their rank and the
 * new rank never collides with one. Returns the current rank when the position
 * does not change.
 */
export function resolveReleaseRank(input: {
  ordered: readonly OrderedRelease[];
  releaseId: string;
  beforeId: string | null;
  afterId: string | null;
}): string {
  const full = [...input.ordered].sort((left, right) => binaryCompare(left.rank, right.rank));
  const current = full.find((row) => row.id === input.releaseId);
  if (!current) throw new Error("Release introuvable.");
  if (current.archived) throw new Error("Une version archivée ne peut pas être réordonnée.");

  const visible = full.filter((row) => !row.archived);
  const others = visible.filter((row) => row.id !== current.id);
  const beforeIndex = input.beforeId ? others.findIndex((row) => row.id === input.beforeId) : -1;
  const afterIndex = input.afterId ? others.findIndex((row) => row.id === input.afterId) : -1;
  if (
    (input.beforeId && beforeIndex < 0) ||
    (input.afterId && afterIndex < 0) ||
    (input.beforeId && input.afterId && beforeIndex + 1 !== afterIndex) ||
    (input.beforeId && !input.afterId && beforeIndex !== others.length - 1) ||
    (!input.beforeId && input.afterId && afterIndex !== 0) ||
    (!input.beforeId && !input.afterId && others.length > 0)
  ) {
    throw new Error("Voisin invalide pour ce backlog.");
  }

  const targetIndex = input.beforeId ? beforeIndex + 1 : 0;
  if (targetIndex === visible.findIndex((row) => row.id === current.id)) return current.rank;

  // Place the version immediately after `before` (or immediately before `after`)
  // in the full sequence, so archived ranks in between are never reused.
  const rest = full.filter((row) => row.id !== current.id);
  if (input.beforeId) {
    const position = rest.findIndex((row) => row.id === input.beforeId);
    return generateKeyBetween(rest[position]!.rank, rest[position + 1]?.rank ?? null);
  }
  const position = rest.findIndex((row) => row.id === input.afterId);
  return generateKeyBetween(rest[position - 1]?.rank ?? null, rest[position]!.rank);
}
