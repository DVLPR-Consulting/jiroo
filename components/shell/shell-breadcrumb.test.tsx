import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";

const route = vi.hoisted(() => ({ pathname: "/b/CASS", search: "view=tree" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

const backlogs = [
  { id: "backlog-1", key: "CASS", name: "Pôle civil" },
  { id: "backlog-2", key: "PEN", name: "Pôle pénal" },
];

const views = [
  { id: "v1", name: "Mes urgences", backlogId: "backlog-1" },
  { id: "v2", name: "À relire", backlogId: "backlog-2" },
];

describe("ShellBreadcrumb", () => {
  beforeEach(() => {
    route.pathname = "/b/CASS";
    route.search = "view=tree";
  });

  it("describes the active backlog, display mode, and default view", () => {
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByText("Pôle civil · Arbre / Tous les items")).toHaveClass("sr-only");
  });

  it("uses the active saved view name", () => {
    route.search = "view=list&v=v1";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByText("Pôle civil · Liste / Mes urgences")).toBeInTheDocument();
  });

  it("keeps the first backlog as context on administration pages", () => {
    route.pathname = "/admin";
    route.search = "";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByText("Pôle civil / Administration")).toBeInTheDocument();
  });

  it("describes the requested backlog reports section", () => {
    route.pathname = "/b/PEN/reports";
    route.search = "view=tree&v=v1";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByText("Pôle pénal / Rapports")).toBeInTheDocument();
  });
});
