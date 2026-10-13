import { describe, expect, it } from "vitest";
import {
  activeProjectView,
  deriveBreadcrumb,
  deriveShellContext,
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
      allItemsHref: "/b/CASS",
      activeNav: null,
    });
  });

  it("uses board and Tous les items when a backlog URL has no view parameters", () => {
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
      allItemsHref: "/b/CASS",
      activeNav: "all",
    });
  });

  it("does not use a saved view belonging to another backlog", () => {
    expect(
      deriveShellContext({
        pathname: "/b/CASS",
        search: new URLSearchParams("view=tree&v=view-2"),
        backlogs,
        views,
      }),
    ).toMatchObject({
      mode: "Arbre",
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
      allItemsHref: "/b/CASS",
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
    ).toMatchObject({ section, activeNav, allItemsHref: "/b/CASS" });
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
      allItemsHref: "/b/CASS",
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
      allItemsHref: "/b/PEN",
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
  it("lists the six project views in sidebar order", () => {
    expect(PROJECT_VIEWS.map((view) => view.label)).toEqual([
      "Backlog",
      "Board",
      "Liste",
      "Arbre",
      "Releases",
      "Rapports",
    ]);
  });

  it.each([
    ["backlog", "/b/CASS?view=backlog"],
    ["board", "/b/CASS?view=board"],
    ["list", "/b/CASS?view=list"],
    ["tree", "/b/CASS?view=tree"],
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
    ["/b/CASS/releases", "", "releases"],
    ["/b/CASS/releases/r-1/notes", "", "releases"],
    ["/b/CASS/reports", "view=list", "reports"],
  ] as const)("activates the view of %s?%s", (pathname, search, expected) => {
    expect(activeProjectView(pathname, new URLSearchParams(search), "CASS")).toBe(expected);
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
  const crumbs = (pathname: string, search = "", list = backlogs) =>
    deriveBreadcrumb({ pathname, search: new URLSearchParams(search), backlogs: list, views });

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

  it("keeps a lone segment without any backlog", () => {
    expect(crumbs("/", "", [])).toEqual([{ label: "Backlogs" }]);
    expect(crumbs("/admin", "", [])).toEqual([{ label: "Administration" }]);
  });
});
