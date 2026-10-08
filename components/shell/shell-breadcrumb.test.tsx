import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";

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

    expect(screen.getByRole("link", { name: "Pôle civil" })).toHaveAttribute("href", "/b/CASS");
    expect(screen.getByText("Administration")).toHaveAttribute("aria-current", "page");
  });

  it("describes the requested backlog reports section", () => {
    route.pathname = "/b/PEN/reports";
    route.search = "view=tree&v=v1";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByRole("link", { name: "Pôle pénal" })).toHaveAttribute("href", "/b/PEN");
    expect(screen.getByText("Rapports")).toHaveAttribute("aria-current", "page");
  });

  it("lets the parent segment yield below the mobile breakpoint", () => {
    route.search = "view=list&v=v1";
    const { container } = render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    const trail = container.querySelector('[aria-hidden="true"]');
    expect(trail).toHaveAttribute("title", "Pôle civil · Liste / Mes urgences");
    expect(container.querySelector('[data-slot="shell-breadcrumb-parent"]'))
      .toHaveClass("hidden", "md:inline");
    const current = container.querySelector('[data-slot="shell-breadcrumb-current"]');
    expect(current).toHaveTextContent("Mes urgences");
    expect(current).not.toHaveClass("hidden");
  });

  it("keeps a lone segment visible at every width", () => {
    route.pathname = "/";
    route.search = "";
    const { container } = render(<ShellBreadcrumb backlogs={[]} views={[]} />);

    expect(container.querySelector('[data-slot="shell-breadcrumb-current"]')).toBeNull();
    const parent = container.querySelector('[data-slot="shell-breadcrumb-parent"]');
    expect(parent).toHaveTextContent("Jiroo");
    expect(parent).not.toHaveClass("hidden");
  });

  it("links the backlog segment back to the backlog home outside backlog views", () => {
    route.pathname = "/aide";
    route.search = "";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    const nav = screen.getByRole("navigation", { name: "Fil d’Ariane" });
    expect(within(nav).getByRole("link", { name: "Pôle civil" })).toHaveAttribute(
      "href",
      "/b/CASS",
    );
  });

  it("links a backlog feature page back to its own backlog", () => {
    route.pathname = "/b/PEN/releases";
    route.search = "";
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.getByRole("link", { name: "Pôle pénal" })).toHaveAttribute("href", "/b/PEN");
  });

  it("does not link the segment inside a backlog view", () => {
    render(<ShellBreadcrumb backlogs={backlogs} views={views} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
