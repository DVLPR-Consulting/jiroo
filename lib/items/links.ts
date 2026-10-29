import { z } from "zod";

// ---------------------------------------------------------------------------
// LINK_TYPES + LinkType
// ---------------------------------------------------------------------------

export const LINK_TYPES = ["blocks", "relates", "duplicates"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

// ---------------------------------------------------------------------------
// LINK_TYPE_META
// ---------------------------------------------------------------------------

/**
 * Display metadata for each link type.
 * - forward: label shown when the current item is the source.
 * - inverse: label shown when the current item is the target.
 * - symmetric: when true the link reads the same in both directions (forward === inverse).
 */
export const LINK_TYPE_META: Record<
  LinkType,
  { forward: string; inverse: string; symmetric: boolean }
> = {
  blocks: {
    forward: "Bloque",
    inverse: "Est bloqué par",
    symmetric: false,
  },
  relates: {
    forward: "Lié à",
    inverse: "Lié à",
    symmetric: true,
  },
  duplicates: {
    forward: "Duplique",
    inverse: "Est dupliqué par",
    symmetric: false,
  },
};

// ---------------------------------------------------------------------------
// LinkRow
// ---------------------------------------------------------------------------

/** Structural row shape used by the helpers below (mirrors the DB schema). */
export type LinkRow = {
  id: string;
  sourceId: string;
  targetId: string;
  type: LinkType;
};

// ---------------------------------------------------------------------------
// directionFor
// ---------------------------------------------------------------------------

/**
 * Returns the direction of `link` from the perspective of `itemId`, plus the
 * other item's id and the human-readable display label.
 *
 * Assumes `itemId` is either the source or the target of `link`. If neither
 * matches this is a programming error and an exception is thrown.
 */
export function directionFor(
  link: LinkRow,
  itemId: string,
): { direction: "outgoing" | "incoming"; otherId: string; label: string } {
  const meta = LINK_TYPE_META[link.type];

  if (link.sourceId === itemId) {
    return {
      direction: "outgoing",
      otherId: link.targetId,
      label: meta.forward,
    };
  }

  if (link.targetId === itemId) {
    return {
      direction: "incoming",
      otherId: link.sourceId,
      label: meta.inverse,
    };
  }

  throw new Error(
    `directionFor: itemId "${itemId}" is neither source nor target of link "${link.id}".`,
  );
}

// ---------------------------------------------------------------------------
// groupLinksForDisplay
// ---------------------------------------------------------------------------

/**
 * Stable display order for link group labels. Defines the order in which
 * label buckets appear in the UI regardless of data arrival order.
 */
const LABEL_ORDER: string[] = [
  "Bloque",
  "Est bloqué par",
  "Duplique",
  "Est dupliqué par",
  "Lié à",
];

/**
 * Groups an item's links by their display label, preserving the stable
 * `LABEL_ORDER` ordering. Groups with no links are omitted from the result.
 */
export function groupLinksForDisplay<T extends LinkRow>(
  links: T[],
  itemId: string,
): Array<{ label: string; type: LinkType; direction: "outgoing" | "incoming"; items: T[] }> {
  // Build a map from label → { type, direction, items }
  type Bucket = { label: string; type: LinkType; direction: "outgoing" | "incoming"; items: T[] };
  const buckets = new Map<string, Bucket>();

  for (const link of links) {
    const { direction, label } = directionFor(link, itemId);
    if (!buckets.has(label)) {
      buckets.set(label, { label, type: link.type, direction, items: [] });
    }
    buckets.get(label)!.items.push(link);
  }

  // Return buckets in stable LABEL_ORDER, skipping empty labels
  const result: Bucket[] = [];
  for (const label of LABEL_ORDER) {
    const bucket = buckets.get(label);
    if (bucket) result.push(bucket);
  }

  // Append any labels that aren't in LABEL_ORDER (future-proofing)
  for (const [label, bucket] of buckets) {
    if (!LABEL_ORDER.includes(label)) result.push(bucket);
  }

  return result;
}

// ---------------------------------------------------------------------------
// addLinkInput
// ---------------------------------------------------------------------------

export const addLinkInput = z
  .object({
    sourceId: z.string().uuid().toLowerCase(),
    targetId: z.string().uuid().toLowerCase(),
    type: z.enum(LINK_TYPES),
  })
  .refine((d) => d.sourceId !== d.targetId, {
    message: "Un item ne peut pas être lié à lui-même.",
  });

export type AddLinkInput = z.infer<typeof addLinkInput>;

// ---------------------------------------------------------------------------
// wouldCreateDirectCycle
// ---------------------------------------------------------------------------

/**
 * Returns true if adding a `blocks` link from `sourceId` → `targetId` would
 * create a 2-cycle, i.e. a `blocks` link already exists in the opposite
 * direction (`targetId` → `sourceId`).
 *
 * Only applies to `blocks` links — relates/duplicates are not cycle-checked.
 */
export function wouldCreateDirectCycle(
  existing: LinkRow[],
  sourceId: string,
  targetId: string,
): boolean {
  return existing.some(
    (l) => l.type === "blocks" && l.sourceId === targetId && l.targetId === sourceId,
  );
}

// ---------------------------------------------------------------------------
// isDuplicateLink
// ---------------------------------------------------------------------------

/**
 * Returns true if the same logical link already exists in `existing`.
 * - Directional types (`blocks`, `duplicates`): exact `(sourceId, targetId, type)` match.
 * - Symmetric type (`relates`): also matches the reversed `(targetId, sourceId, type)`.
 */
export function isDuplicateLink(
  existing: LinkRow[],
  sourceId: string,
  targetId: string,
  type: LinkType,
): boolean {
  const meta = LINK_TYPE_META[type];

  return existing.some((l) => {
    if (l.type !== type) return false;
    if (l.sourceId === sourceId && l.targetId === targetId) return true;
    // For symmetric types, the reversed pair is the same logical link
    if (meta.symmetric && l.sourceId === targetId && l.targetId === sourceId) return true;
    return false;
  });
}
