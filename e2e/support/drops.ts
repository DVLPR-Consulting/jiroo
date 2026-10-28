export type DropStatus = { id: string; name: string };
export type DropColumn = DropStatus & { left: number; right: number };
export type DropObservation = {
  itemKey: string; expected: string; announced: string | null; sent: string | null; reloaded: string | null;
};
export type DropTiming = { drops: number; wallMs: number; scrollMs: number; scrollPx: number };

/** Partially visible columns are not offscreen stress targets. Never mutate input. */
export function offscreenDropTargets(columns: readonly DropColumn[], frame: { left: number; right: number }, sourceId: string): DropColumn[] {
  if (![frame.left, frame.right].every(Number.isFinite) || frame.right <= frame.left
    || columns.some(({ left, right }) => !Number.isFinite(left) || !Number.isFinite(right) || right <= left)) {
    throw new Error("Invalid drop geometry.");
  }
  const distance = (column: DropColumn) => column.left >= frame.right ? column.left - frame.right : frame.left - column.right;
  return columns.filter(({ id, left, right }) => id !== sourceId && (left >= frame.right || right <= frame.left))
    .sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function announcedDropStatus(text: string, itemLabel: string, statuses: readonly DropStatus[]): string | null {
  return statuses.find(({ name }) => text === `${itemLabel} déplacé vers ${name}.`)?.id ?? null;
}

/** Plain JSON action arguments, not an expected-status substring search. */
export function readDropAction(body: string | null, itemId: string): { statusId: string | null } | null {
  if (body === null) return null;
  try {
    const args: unknown = JSON.parse(body);
    if (!Array.isArray(args)) return null;
    const matches = args.filter((arg): arg is Record<string, unknown> =>
      typeof arg === "object" && arg !== null && !Array.isArray(arg) && arg.id === itemId);
    if (matches.length !== 1) return null;
    return { statusId: typeof matches[0]!.statusId === "string" ? matches[0]!.statusId : null };
  } catch {
    // Do not print a payload in JSON parse errors.
    return null;
  }
}

export function compareDrop(value: DropObservation, statuses: readonly DropStatus[]) {
  const names = new Map(statuses.map(({ id, name }) => [id, name]));
  const label = (id: string | null) => id === null ? "unavailable" : names.get(id) ?? `unknown status (${id})`;
  return {
    matches: names.has(value.expected) && [value.announced, value.sent, value.reloaded].every((id) => id === value.expected),
    message: `${value.itemKey}: expected=${label(value.expected)}, announced=${label(value.announced)}, sent=${label(value.sent)}, reloaded=${label(value.reloaded)}`,
  };
}

/** Wall time includes fixture resets for budgeting only; they are not tested drops. */
export function estimateDropSeriesMs(timing: DropTiming, targetScrollPx: number, drops: number): number {
  if (![timing.drops, timing.wallMs, timing.scrollMs, timing.scrollPx, targetScrollPx, drops].every(Number.isFinite)
    || timing.drops <= 0 || drops <= 0 || timing.wallMs < timing.scrollMs || timing.scrollMs <= 0 || timing.scrollPx <= 0 || targetScrollPx < 0) {
    throw new Error("A drop estimate requires positive auto-scroll observations.");
  }
  const fixed = (timing.wallMs - timing.scrollMs) / timing.drops;
  const scroll = timing.scrollMs / timing.scrollPx * targetScrollPx;
  return Math.ceil(drops * (fixed + scroll) * 1.25);
}
