import { describe, expect, it } from "vitest";
import { deriveShellContext } from "@/lib/items/shell";

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
