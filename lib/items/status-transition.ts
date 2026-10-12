/**
 * The status a quick transition moves an item to: the next one in the
 * backlog's workflow order (Jira's single « transition » button next to the
 * status). Null at the last status or when the current one is unknown.
 */
export function nextStatus<T extends { id: string; order: number }>(
  statuses: readonly T[],
  currentId: string,
): T | null {
  const ordered = [...statuses].sort((left, right) => left.order - right.order);
  const index = ordered.findIndex((status) => status.id === currentId);
  if (index === -1) return null;
  return ordered[index + 1] ?? null;
}
