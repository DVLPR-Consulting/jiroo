export const ROOT_LABEL = "root";

// UUID hyphens are illegal in ltree labels; strip them → 32 hex chars (one valid label, PG 14-18).
export function ltreeLabel(id: string): string {
  return id.replace(/-/g, "");
}

// Self-inclusive ltree path: the path ALWAYS ends with the node's own id-label.
// Composant (root) → `root.<id>`; child → `<parentPath>.<id>`.
// Depth relation: depth = nlevel(path) - 2 (the `root` label inflates nlevel — composant
// nlevel 2 / depth 0). `depth` is always stored via childDepth, never derived from nlevel
// at runtime; this comment guards Lot 4 / the CHECK constraint / reports from an off-by-one.
export function buildPath(parentPath: string | null, ownId: string): string {
  return `${parentPath ?? ROOT_LABEL}.${ltreeLabel(ownId)}`;
}

export function childDepth(parentDepth: number | null): number {
  return parentDepth == null ? 0 : parentDepth + 1;
}
