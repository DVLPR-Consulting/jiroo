export type ShellMode = "Backlog" | "Board" | "Liste" | "Arbre";
export type ShellNav = "all" | "mine" | "trash" | "admin" | null;

export type ShellContext = {
  activeBacklogKey?: string;
  section: string;
  mode?: ShellMode;
  viewTitle?: string;
  allItemsHref: string;
  activeNav: ShellNav;
};

type ShellBacklog = { key: string; name: string };
type ShellView = { id: string; name: string; backlogKey: string };

const MODE_LABELS: Record<string, ShellMode> = {
  backlog: "Backlog",
  board: "Board",
  list: "Liste",
  tree: "Arbre",
};

export function deriveShellContext({
  pathname,
  search,
  backlogs,
  views,
}: {
  pathname: string;
  search: URLSearchParams;
  backlogs: ShellBacklog[];
  views: ShellView[];
}): ShellContext {
  const firstBacklog = backlogs[0];
  const firstKey = firstBacklog?.key.toUpperCase();
  const allItemsHref = firstKey ? `/b/${firstKey}` : "/";
  const specialRoute = {
    "/mine": { section: "Mes items", activeNav: "mine" as const },
    "/trash": { section: "Corbeille", activeNav: "trash" as const },
    "/admin": { section: "Administration", activeNav: "admin" as const },
    "/aide": { section: "Aide", activeNav: null },
  }[pathname];

  if (specialRoute) {
    return {
      ...(firstKey ? { activeBacklogKey: firstKey } : {}),
      ...specialRoute,
      allItemsHref,
    };
  }

  const completedFeatureMatch = /^\/b\/([^/]+)\/(releases|reports)(?:\/.*)?$/.exec(pathname);
  if (completedFeatureMatch) {
    const requestedKey = decodeURIComponent(completedFeatureMatch[1]!).toUpperCase();
    const backlog = backlogs.find(
      (candidate) => candidate.key.toUpperCase() === requestedKey,
    );
    const feature = completedFeatureMatch[2];
    return {
      ...(backlog ? { activeBacklogKey: requestedKey } : {}),
      section: feature === "releases" ? "Releases" : "Rapports",
      allItemsHref: backlog ? `/b/${requestedKey}` : allItemsHref,
      activeNav: null,
    };
  }

  const backlogMatch = /^\/b\/([^/]+)\/?$/.exec(pathname);
  if (backlogMatch) {
    const requestedKey = decodeURIComponent(backlogMatch[1]!).toUpperCase();
    const backlog = backlogs.find((candidate) => candidate.key.toUpperCase() === requestedKey);
    const mode = MODE_LABELS[search.get("view") ?? ""] ?? "Board";
    const viewId = search.get("v");
    const savedView = viewId
      ? views.find(
          (candidate) =>
            candidate.id === viewId && candidate.backlogKey.toUpperCase() === requestedKey,
        )
      : undefined;

    return {
      ...(backlog ? { activeBacklogKey: requestedKey } : {}),
      section: backlog?.name ?? requestedKey,
      mode,
      viewTitle: savedView?.name ?? "Tous les items",
      allItemsHref: backlog ? `/b/${requestedKey}` : allItemsHref,
      activeNav: backlog && !savedView ? "all" : null,
    };
  }

  return {
    ...(firstKey ? { activeBacklogKey: firstKey } : {}),
    section: firstBacklog?.name ?? "Jiroo",
    allItemsHref,
    activeNav: null,
  };
}

// ---------------------------------------------------------------------------
// Project views (sidebar, JIR-74)
// ---------------------------------------------------------------------------

export type ItemViewId = "backlog" | "board" | "list" | "tree";
export type ProjectViewId = ItemViewId | "releases" | "reports";

/**
 * The project's views, in sidebar order. Item views are display modes of
 * `/b/[key]` (`?view=`); Releases and Rapports are their own routes.
 */
export const PROJECT_VIEWS = [
  { id: "backlog", label: "Backlog", kind: "item" },
  { id: "board", label: "Board", kind: "item" },
  { id: "list", label: "Liste", kind: "item" },
  { id: "tree", label: "Arbre", kind: "item" },
  { id: "releases", label: "Releases", kind: "page" },
  { id: "reports", label: "Rapports", kind: "page" },
] as const satisfies readonly {
  id: ProjectViewId;
  label: string;
  kind: "item" | "page";
}[];

const ITEM_VIEW_IDS: readonly string[] = ["backlog", "board", "list", "tree"];

/** Plain link to a project view (no URL state to keep). */
export function projectViewHref(backlogKey: string, id: ProjectViewId): string {
  const base = `/b/${encodeURIComponent(backlogKey)}`;
  return ITEM_VIEW_IDS.includes(id) ? `${base}?view=${id}` : `${base}/${id}`;
}

/** The project view shown at this URL for `backlogKey`, if any (board by default). */
export function activeProjectView(
  pathname: string,
  search: URLSearchParams,
  backlogKey: string,
): ProjectViewId | null {
  const match = /^\/b\/([^/]+)(?:\/(releases|reports)(?:\/.*)?|\/?)$/.exec(pathname);
  if (!match) return null;
  if (decodeURIComponent(match[1]!).toUpperCase() !== backlogKey.toUpperCase()) return null;
  if (match[2]) return match[2] as ProjectViewId;
  const view = search.get("view") ?? "";
  return ITEM_VIEW_IDS.includes(view) ? (view as ItemViewId) : "board";
}
