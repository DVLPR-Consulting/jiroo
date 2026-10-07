export type ShellMode = "Board" | "Liste" | "Arbre";
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
