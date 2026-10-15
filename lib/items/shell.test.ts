import { describe, expect, it } from "vitest";
import {
  activeProjectView,
  deriveBreadcrumb,
  deriveShellContext,
  itemViewFromParam,
  PROJECT_VIEWS,
  projectViewHref,
} from "@/lib/items/shell";

const backlogs = [
  { key: "CASS", name: "Pôle civil" },
  { key: "PEN", name: "Pôle pénal" },
];

const views = [
  { id: "view-1", name: "Mes urgences", backlogKey: "CASS" },
  { id: "view-2", name: "À relire", backlogKey: "PEN" },
];

describe("deriveShellContext", () => {
  it("derives backlog, mode, and matching saved view from the URL", () => {
    expect(
      deriveShellContext({
        pathname: "/b/cass",
        search: new URLSearchParams("view=list&v=view-1"),
        backlogs,
        views,
      }),
    ).toEqual({
      activeBacklogKey: "CASS",
      section: "Pôle civil",
      mode: "Liste",
      viewTitle: "Mes urgences",
      allItemsHref: "/b/CASS?view=list",
      activeNav: null,
    });
  });

  it("opens on the board without marking Tous les items current (JIR-94)", () => {
    expect(
      deriveShellContext({
        pathname: "/b/CASS",
        search: new URLSearchParams(),
        backlogs,
        views,
      }),
    ).toEqual({
      activeBacklogKey: "CASS",
      section: "Pôle civil",
      mode: "Board",
      viewTitle: "Tous les items",
      allItemsHref: "/b/CASS?view=list",
      activeNav: null,
    });
  });

  it("does not use a saved view belonging to another backlog", () => {
    expect(
      deriveShellContext({
        pathname: "/b/CASS",
        search: new URLSearchParams("view=list&v=view-2"),
        backlogs,
        views,
      }),
    ).toMatchObject({
      mode: "Liste",
      viewTitle: "Tous les items",
      activeNav: "all",
    });
  });

  it("derives Mes items and keeps the first available backlog as shell context", () => {
    expect(
      deriveShellContext({
        pathname: "/mine",
        search: new URLSearchParams(),
        backlogs,
        views,
      }),
    ).toEqual({
      activeBacklogKey: "CASS",
      section: "Mes items",
      allItemsHref: "/b/CASS?view=list",
      activeNav: "mine",
    });
  });

  it.each([
    ["/trash", "Corbeille", "trash"],
    ["/admin", "Administration", "admin"],
    ["/aide", "Aide", null],
  ] as const)("derives the exact %s section", (pathname, section, activeNav) => {
    expect(
      deriveShellContext({
        pathname,
        search: new URLSearchParams(),
        backlogs,
        views,
      }),
    ).toMatchObject({ section, activeNav, allItemsHref: "/b/CASS?view=list" });
  });

  it("does not activate an archived or stale backlog route", () => {
    expect(
      deriveShellContext({
        pathname: "/b/old",
        search: new URLSearchParams("view=tree"),
        backlogs,
        views,
      }),
    ).toEqual({
      section: "OLD",
      mode: "Arbre",
      viewTitle: "Tous les items",
      allItemsHref: "/b/CASS?view=list",
      activeNav: null,
    });
  });

  it("falls back to the root when no backlog is available", () => {
    expect(
      deriveShellContext({
        pathname: "/admin",
        search: new URLSearchParams(),
        backlogs: [],
        views: [],
      }),
    ).toEqual({
      section: "Administration",
      allItemsHref: "/",
      activeNav: "admin",
    });
  });

  it("marks the home page as the backlogs list (JIR-82)", () => {
    expect(
      deriveShellContext({
        pathname: "/",
        search: new URLSearchParams(),
        backlogs: [],
        views: [],
      }),
    ).toEqual({
      section: "Backlogs",
      allItemsHref: "/",
      activeNav: "backlogs",
    });
  });

  it("matches special routes exactly instead of by prefix", () => {
    expect(
      deriveShellContext({
        pathname: "/administrator",
        search: new URLSearchParams(),
        backlogs,
        views,
      }),
    ).toMatchObject({ section: "Pôle civil", activeNav: null });
  });

  it.each([
    ["/b/PEN/releases", "Releases"],
    ["/b/pen/roadmap", "Roadmap"],
    ["/b/pen/reports", "Rapports"],
    ["/b/PEN/reports/detail", "Rapports"],
  ] as const)("keeps the requested backlog for %s", (pathname, section) => {
    expect(deriveShellContext({
      pathname,
      search: new URLSearchParams("view=tree&v=view-1"),
      backlogs,
      views,
    })).toEqual({
      activeBacklogKey: "PEN",
      section,
      allItemsHref: "/b/PEN?view=list",
      activeNav: null,
    });
  });
});

describe("deriveShellContext — Tous les items (JIR-94)", () => {
  const navAt = (search: string) =>
    deriveShellContext({
      pathname: "/b/CASS",
      search: new URLSearchParams(search),
      backlogs,
      views,
    }).activeNav;

  it("leads to the backlog's unfiltered Liste", () => {
    expect(
      deriveShellContext({
        pathname: "/b/cass",
        search: new URLSearchParams("view=board&q=bug"),
        backlogs,
        views,
      }).allItemsHref,
    ).toBe("/b/CASS?view=list");
  });

  it("is current on the unfiltered Liste only", () => {
    expect(navAt("view=list")).toBe("all");
    // Sort, group, the Fix versions column or an open item keep every ticket.
    expect(navAt("view=list&sort=key:asc&group=status&fvcol=1&item=CASS-1")).toBe("all");
  });

  it.each(["", "view=board", "view=backlog", "view=tree", "view=unknown"])(
    "is not current on another view (%s)",
    (search) => {
      expect(navAt(search)).toBeNull();
    },
  );

  it.each([
    "q=bug",
    "type=tache",
    "status=s1",
    "prio=1",
    "assignee=none",
    "label=l1",
    "version=r1",
    "sprint=none",
    "kind=bug",
    "under=i1",
  ])("is not current on a Liste filtered by %s", (filter) => {
    expect(navAt(`view=list&${filter}`)).toBeNull();
  });

  it("is not current on a saved view of the backlog", () => {
    expect(navAt("view=list&v=view-1")).toBeNull();
  });

  it("ignores a blank search, which filters nothing", () => {
    expect(navAt("view=list&q=%20%20")).toBe("all");
  });
});

describe("deriveShellContext — backlog access page (JIR-85)", () => {
  it("activates the backlog in the URL, not the first one", () => {
    expect(deriveShellContext({
      pathname: "/b/pen/settings/access",
      search: new URLSearchParams(),
      backlogs,
      views,
    })).toEqual({
      activeBacklogKey: "PEN",
      section: "Accès",
      allItemsHref: "/b/PEN?view=list",
      activeNav: null,
    });
  });

  it("does not activate a stale backlog", () => {
    expect(deriveShellContext({
      pathname: "/b/old/settings/access/",
      search: new URLSearchParams(),
      backlogs,
      views,
    })).toEqual({ section: "Accès", allItemsHref: "/b/CASS?view=list", activeNav: null });
  });
});

describe("deriveShellContext — backlog Développement settings (JIR-95)", () => {
  it("activates the backlog in the URL and names the section", () => {
    expect(deriveShellContext({
      pathname: "/b/pen/settings/development",
      search: new URLSearchParams(),
      backlogs,
      views,
    })).toEqual({
      activeBacklogKey: "PEN",
      section: "Développement",
      allItemsHref: "/b/PEN?view=list",
      activeNav: null,
    });
  });
});

describe("deriveShellContext — Backlog mode", () => {
  it("names the Backlog display mode instead of falling back to Board", () => {
    expect(
      deriveShellContext({
        pathname: "/b/CASS",
        search: new URLSearchParams("view=backlog"),
        backlogs,
        views,
      }),
    ).toMatchObject({ mode: "Backlog" });
  });
});

describe("project views (sidebar)", () => {
  it("lists the seven project views in sidebar order", () => {
    expect(PROJECT_VIEWS.map((view) => view.label)).toEqual([
      "Backlog",
      "Board",
      "Liste",
      "Arbre",
      "Roadmap",
      "Releases",
      "Rapports",
    ]);
  });

  it.each([
    ["backlog", "/b/CASS?view=backlog"],
    ["board", "/b/CASS?view=board"],
    ["list", "/b/CASS?view=list"],
    ["tree", "/b/CASS?view=tree"],
    ["roadmap", "/b/CASS/roadmap"],
    ["releases", "/b/CASS/releases"],
    ["reports", "/b/CASS/reports"],
  ] as const)("links %s to %s", (id, href) => {
    expect(projectViewHref("CASS", id)).toBe(href);
  });

  it("encodes the backlog key", () => {
    expect(projectViewHref("A B", "reports")).toBe("/b/A%20B/reports");
  });

  it.each([
    ["/b/CASS", "", "board"],
    ["/b/cass", "view=list", "list"],
    ["/b/CASS/", "view=backlog", "backlog"],
    ["/b/CASS", "view=unknown", "board"],
    ["/b/CASS/roadmap", "", "roadmap"],
    ["/b/CASS/releases", "", "releases"],
    ["/b/CASS/releases/r-1/notes", "", "releases"],
    ["/b/CASS/reports", "view=list", "reports"],
  ] as const)("activates the view of %s?%s", (pathname, search, expected) => {
    expect(activeProjectView(pathname, new URLSearchParams(search), "CASS")).toBe(expected);
  });

  it.each([
    ["backlog", "backlog"],
    ["board", "board"],
    ["list", "list"],
    ["tree", "tree"],
    ["releases", "board"],
    ["", "board"],
    [null, "board"],
    [undefined, "board"],
  ] as const)("reads ?view=%s as the %s item view", (value, expected) => {
    expect(itemViewFromParam(value)).toBe(expected);
  });

  it.each([
    ["/b/PEN", ""],
    ["/b/CASS/settings/access", ""],
    ["/aide", ""],
    ["/mine", "view=list"],
  ])("activates nothing on %s", (pathname, search) => {
    expect(activeProjectView(pathname, new URLSearchParams(search), "CASS")).toBeNull();
  });
});

describe("deriveBreadcrumb (page header)", () => {
  const crumbs = (pathname: string, search = "", list = backlogs, canOpenAdmin?: boolean) =>
    deriveBreadcrumb({ pathname, search: new URLSearchParams(search), backlogs: list, views, canOpenAdmin });

  it("leads an item view with the clickable project then the view", () => {
    expect(crumbs("/b/CASS", "view=list")).toEqual([
      { label: "Pôle civil", href: "/b/CASS" },
      { label: "Liste" },
    ]);
  });

  it("appends the active saved view name", () => {
    expect(crumbs("/b/cass", "view=backlog&v=view-1")).toEqual([
      { label: "Pôle civil", href: "/b/CASS" },
      { label: "Backlog" },
      { label: "Mes urgences" },
    ]);
  });

  it("ignores a saved view of another backlog", () => {
    expect(crumbs("/b/CASS", "v=view-2")).toEqual([
      { label: "Pôle civil", href: "/b/CASS" },
      { label: "Board" },
    ]);
  });

  it.each([
    ["/b/PEN/releases", "Pôle pénal", "/b/PEN", "Releases"],
    ["/b/pen/roadmap", "Pôle pénal", "/b/PEN", "Roadmap"],
    ["/b/pen/reports", "Pôle pénal", "/b/PEN", "Rapports"],
    ["/aide", "Pôle civil", "/b/CASS", "Aide"],
    ["/admin", "Pôle civil", "/b/CASS", "Administration"],
    ["/mine", "Pôle civil", "/b/CASS", "Mes items"],
    ["/trash", "Pôle civil", "/b/CASS", "Corbeille"],
  ])("links %s back to its project", (pathname, project, href, current) => {
    expect(crumbs(pathname)).toEqual([{ label: project, href }, { label: current }]);
  });

  it("shows the home page alone, above every project (JIR-82)", () => {
    expect(crumbs("/")).toEqual([{ label: "Backlogs" }]);
  });

  it("links the section of a page nested under it", () => {
    expect(crumbs("/b/PEN/releases/r-1")).toEqual([
      { label: "Pôle pénal", href: "/b/PEN" },
      { label: "Releases", href: "/b/PEN/releases" },
    ]);
  });

  it("does not link a stale backlog", () => {
    expect(crumbs("/b/old", "view=tree")).toEqual([{ label: "OLD" }, { label: "Arbre" }]);
  });

  it("places the access page under Administration › Backlogs › project (JIR-85)", () => {
    expect(crumbs("/b/pen/settings/access", "", backlogs, true)).toEqual([
      { label: "Administration", href: "/admin" },
      { label: "Backlogs", href: "/admin?tab=backlogs" },
      { label: "Pôle pénal", href: "/b/PEN" },
      { label: "Accès" },
    ]);
  });

  it.each([false, undefined])("keeps the administration segments as text when canOpenAdmin is %s", (canOpenAdmin) => {
    expect(crumbs("/b/PEN/settings/access", "", backlogs, canOpenAdmin)).toEqual([
      { label: "Administration" },
      { label: "Backlogs" },
      { label: "Pôle pénal", href: "/b/PEN" },
      { label: "Accès" },
    ]);
  });

  it("places the Développement settings under the same trail (JIR-95)", () => {
    expect(crumbs("/b/PEN/settings/development", "", backlogs, true)).toEqual([
      { label: "Administration", href: "/admin" },
      { label: "Backlogs", href: "/admin?tab=backlogs" },
      { label: "Pôle pénal", href: "/b/PEN" },
      { label: "Développement" },
    ]);
  });

  it("names a stale backlog on its access page without linking it", () => {
    expect(crumbs("/b/old/settings/access", "", backlogs, true)).toEqual([
      { label: "Administration", href: "/admin" },
      { label: "Backlogs", href: "/admin?tab=backlogs" },
      { label: "OLD" },
      { label: "Accès" },
    ]);
  });

  it("keeps a lone segment without any backlog", () => {
    expect(crumbs("/", "", [])).toEqual([{ label: "Backlogs" }]);
    expect(crumbs("/admin", "", [])).toEqual([{ label: "Administration" }]);
  });
});
