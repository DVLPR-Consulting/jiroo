import { isFiltersActive, parseViewState } from "@/lib/items/filter";

export type ShellMode = "Backlog" | "Board" | "Liste" | "Arbre";
export type ShellNav = "backlogs" | "all" | "mine" | "trash" | "admin" | null;

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

const ACCESS_ROUTE = /^\/b\/([^/]+)\/settings\/access\/?$/;

/**
 * Where « Tous les items » leads: the backlog's Liste, without filters
 * (JIR-94) — like Jira's "All work", every ticket of the project.
 */
function allItemsHrefFor(backlogKey: string): string {
  return `/b/${backlogKey}?view=list`;
}

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
  const allItemsHref = firstKey ? allItemsHrefFor(firstKey) : "/";
  const specialRoute = {
    // The home page lists every backlog (JIR-82, Jira's Projects page).
    "/": { section: "Backlogs", activeNav: "backlogs" as const },
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
      allItemsHref: backlog ? allItemsHrefFor(requestedKey) : allItemsHref,
      activeNav: null,
    };
  }

  // A backlog's access settings belong to that backlog (JIR-85), like Jira's
  // project settings: the sidebar follows the URL, not the first backlog.
  const accessMatch = ACCESS_ROUTE.exec(pathname);
  if (accessMatch) {
    const requestedKey = decodeURIComponent(accessMatch[1]!).toUpperCase();
    const backlog = backlogs.find(
      (candidate) => candidate.key.toUpperCase() === requestedKey,
    );
    return {
      ...(backlog ? { activeBacklogKey: requestedKey } : {}),
      section: "Accès",
      allItemsHref: backlog ? allItemsHrefFor(requestedKey) : allItemsHref,
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
      allItemsHref: backlog ? allItemsHrefFor(requestedKey) : allItemsHref,
      // « Tous les items » is Jira's "All work": the backlog's unfiltered
      // Liste (JIR-94). Board, Backlog, Arbre, a saved view or any active
      // filter are something else, so the link is not current there.
      activeNav:
        backlog && !savedView && mode === "Liste" && !isFiltersActive(parseViewState(search).filters)
          ? "all"
          : null,
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

/** The item view a `?view=` value asks for: Board when absent or unknown. */
export function itemViewFromParam(value: string | null | undefined): ItemViewId {
  return value && ITEM_VIEW_IDS.includes(value) ? (value as ItemViewId) : "board";
}

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
  return itemViewFromParam(search.get("view"));
}

// ---------------------------------------------------------------------------
// Page header breadcrumb (JIR-74)
// ---------------------------------------------------------------------------

export type BreadcrumbSegment = { label: string; href?: string };

/**
 * The trail above the page title: `Projet / Vue`, then `/ Vue enregistrée`
 * when one is active. The project leads back to its home (JIR-72); the last
 * segment is the current page unless the page is nested below it.
 */
export function deriveBreadcrumb(input: {
  pathname: string;
  search: URLSearchParams;
  backlogs: ShellBacklog[];
  views: ShellView[];
  /** Whether the viewer may open Administration → Backlogs (`create_backlogs`); off by default. */
  canOpenAdmin?: boolean;
}): BreadcrumbSegment[] {
  const context = deriveShellContext(input);
  // The home page sits above every project: no project segment.
  if (context.activeNav === "backlogs") return [{ label: context.section }];
  const backlog = context.activeBacklogKey
    ? input.backlogs.find(
        (candidate) => candidate.key.toUpperCase() === context.activeBacklogKey,
      )
    : undefined;
  const project: BreadcrumbSegment | undefined = backlog
    ? { label: backlog.name, href: `/b/${backlog.key.toUpperCase()}` }
    : undefined;

  // Reached from Administration → Backlogs (JIR-85): the trail leads back
  // there, then to the project. Pages the viewer cannot open stay as text.
  const access = ACCESS_ROUTE.exec(input.pathname);
  if (access) {
    const canOpenAdmin = input.canOpenAdmin === true;
    return [
      canOpenAdmin ? { label: "Administration", href: "/admin" } : { label: "Administration" },
      canOpenAdmin ? { label: "Backlogs", href: "/admin?tab=backlogs" } : { label: "Backlogs" },
      project ?? { label: decodeURIComponent(access[1]!).toUpperCase() },
      { label: context.section },
    ];
  }

  if (context.mode) {
    const savedViewId = input.search.get("v");
    const backlogKey = context.activeBacklogKey;
    const savedView =
      backlogKey && savedViewId
        ? input.views.find(
            (view) => view.id === savedViewId && view.backlogKey.toUpperCase() === backlogKey,
          )
        : undefined;
    return [
      project ?? { label: context.section },
      { label: context.mode },
      ...(savedView ? [{ label: savedView.name }] : []),
    ];
  }

  if (!project) return [{ label: context.section }];
  if (context.section === backlog!.name) return [{ label: project.label }];

  const nested = /^\/b\/[^/]+\/(releases|reports)\/.+$/.exec(input.pathname);
  return [
    project,
    nested
      ? { label: context.section, href: `${project.href}/${nested[1]}` }
      : { label: context.section },
  ];
}
