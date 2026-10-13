import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { ShellDataProvider } from "@/components/shell/shell-data";

const route = vi.hoisted(() => ({ pathname: "/b/CASS", search: "view=tree" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

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

function trail() {
  const nav = screen.getByRole("navigation", { name: "Fil d’Ariane" });
  return within(nav)
    .getAllByRole("listitem")
    .filter((item) => item.getAttribute("aria-hidden") !== "true")
    .map((item) => item.textContent);
}

describe("ShellBreadcrumb", () => {
  beforeEach(() => {
    route.pathname = "/b/CASS";
    route.search = "view=tree";
  });

  it("leads an item view with the clickable project then the view", () => {
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(trail()).toEqual(["Pôle civil", "Arbre"]);
    expect(screen.getByRole("link", { name: "Pôle civil" })).toHaveAttribute("href", "/b/CASS");
    expect(screen.getByText("Arbre")).toHaveAttribute("aria-current", "page");
  });

  it("appends the active saved view name", () => {
    route.search = "view=list&v=v1";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(trail()).toEqual(["Pôle civil", "Liste", "Mes urgences"]);
    expect(screen.getByText("Mes urgences")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Liste")).not.toHaveAttribute("aria-current");
  });

  it("keeps the first backlog as context on administration pages", () => {
    route.pathname = "/admin";
    route.search = "";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByRole("link", { name: "Pôle civil" })).toHaveAttribute("href", "/b/CASS");
    expect(screen.getByText("Administration")).toHaveAttribute("aria-current", "page");
  });

  it("links a backlog feature page back to its own backlog", () => {
    route.pathname = "/b/PEN/reports";
    route.search = "view=tree&v=v1";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByRole("link", { name: "Pôle pénal" })).toHaveAttribute("href", "/b/PEN");
    expect(screen.getByText("Rapports")).toHaveAttribute("aria-current", "page");
  });

  it("links the section above a nested page", () => {
    route.pathname = "/b/PEN/releases/r-1";
    route.search = "";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByRole("link", { name: "Releases" })).toHaveAttribute(
      "href",
      "/b/PEN/releases",
    );
  });

  it("leads a backlog access page back through Administration (JIR-85)", () => {
    route.pathname = "/b/PEN/settings/access";
    route.search = "";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} canOpenAdmin />);

    expect(trail()).toEqual(["Administration", "Backlogs", "Pôle pénal", "Accès"]);
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Backlogs" })).toHaveAttribute(
      "href",
      "/admin?tab=backlogs",
    );
    expect(screen.getByRole("link", { name: "Pôle pénal" })).toHaveAttribute("href", "/b/PEN");
    expect(screen.getByText("Accès")).toHaveAttribute("aria-current", "page");
  });

  it("does not link Administration for a viewer who cannot open it", () => {
    route.pathname = "/b/PEN/settings/access";
    route.search = "";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(trail()).toEqual(["Administration", "Backlogs", "Pôle pénal", "Accès"]);
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Backlogs" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pôle pénal" })).toHaveAttribute("href", "/b/PEN");
  });

  it("keeps a lone segment without any backlog", () => {
    route.pathname = "/";
    route.search = "";
    render(<ShellBreadcrumb backlogs={[]} views={[]} />);

    expect(trail()).toEqual(["Backlogs"]);
  });

  it("reads backlogs and views from the shell when not given", () => {
    route.search = "view=list&v=v1";
    render(
      <ShellDataProvider backlogs={backlogs} views={views}>
        <ShellBreadcrumb />
      </ShellDataProvider>,
    );

    expect(trail()).toEqual(["Pôle civil", "Liste", "Mes urgences"]);
  });
});
