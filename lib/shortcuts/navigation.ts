import type { SequenceShortcutId } from "@/lib/shortcuts/registry";

/** Window event the search palette listens to (« / » shortcut). */
export const OPEN_SEARCH_EVENT = "jiroo:open-search";

/** Last backlog visited on this device, the target of « g » outside a backlog. */
export const LAST_BACKLOG_STORAGE_KEY = "jiroo-last-backlog";

export type GoShortcutId = Extract<SequenceShortcutId, `go.${string}`>;

export const GO_SHORTCUT_IDS = [
  "go.backlog",
  "go.board",
  "go.list",
  "go.tree",
  "go.releases",
  "go.reports",
  "go.help",
] as const satisfies readonly GoShortcutId[];

/** The backlog key in a /b/KEY… path, or null elsewhere. */
export function backlogKeyFromPath(pathname: string): string | null {
  const match = /^\/b\/([^/?#]+)/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/**
 * Where a « g » shortcut leads. Backlog destinations use the current backlog,
 * else the last one visited (Jira's « g a » opens the most recent board);
 * without any, there is nowhere to go and the shortcut does nothing.
 */
export function goShortcutHref(id: GoShortcutId, backlogKey: string | null): string | null {
  if (id === "go.help") return "/aide";
  if (!backlogKey) return null;
  const base = `/b/${encodeURIComponent(backlogKey)}`;
  switch (id) {
    case "go.backlog":
      return `${base}?view=backlog`;
    case "go.board":
      return `${base}?view=board`;
    case "go.list":
      return `${base}?view=list`;
    case "go.tree":
      return `${base}?view=tree`;
    case "go.releases":
      return `${base}/releases`;
    case "go.reports":
      return `${base}/reports`;
  }
}
