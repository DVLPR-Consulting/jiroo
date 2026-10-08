import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewBar } from "@/components/shell/view-bar";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/components/shell/view-url-state", () => ({
  useViewUrlState: () => {
    const initial = new URLSearchParams(
      "item=CASS-42&q=auth&view=board&tag=alpha&tag=beta",
    );
    return {
      href: (mutate: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(initial);
        mutate(params);
        return `/b/CASS?${params.toString()}`;
      },
      push: (mutate: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(initial);
        mutate(params);
        mocks.push(`/b/CASS?${params.toString()}`);
      },
    };
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onNavigate,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onNavigate?: (event: { preventDefault: () => void }) => void;
  }) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onNavigate?.({ preventDefault: () => undefined });
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/components/theme/density-toggle", () => ({
  DensityToggle: () => <button type="button">Densité</button>,
}));

describe("ViewBar", () => {
  beforeEach(() => {
    mocks.push.mockReset();
  });

  it("wraps secondary controls before the primary cluster", () => {
    const { container } = render(
      <ViewBar
        view="board"
        groupControlSlot={<button type="button">Grouper</button>}
        viewActionsSlot={<button type="button">Vues</button>}
        workflowSlot={<button type="button">Statuts</button>}
      />,
    );

    expect(container.firstElementChild).toHaveClass("flex-wrap", "min-h-[46px]");
    expect(screen.getByRole("button", { name: "Grouper" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Vues" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Statuts" }).closest(
      '[data-slot="primary-actions"]',
    )).not.toBeNull();
  });

  it("opens Backlog while preserving unrelated URL state", () => {
    render(<ViewBar view="board" />);

    const backlogLink = screen.getByRole("link", { name: "Backlog" });
    expect(backlogLink).toHaveAttribute(
      "href",
      "/b/CASS?item=CASS-42&q=auth&view=backlog&tag=alpha&tag=beta",
    );

    fireEvent.click(backlogLink);

    expect(mocks.push).toHaveBeenCalledWith(
      "/b/CASS?item=CASS-42&q=auth&view=backlog&tag=alpha&tag=beta",
    );
  });

  it("links natively to completed-feature routes without carrying view state", () => {
    render(<ViewBar view="board" backlogKey="CASS" />);

    const releasesLink = screen.getByRole("link", { name: "Releases" });
    const reportsLink = screen.getByRole("link", { name: "Rapports" });
    expect(releasesLink).toHaveAttribute("href", "/b/CASS/releases");
    expect(reportsLink).toHaveAttribute("href", "/b/CASS/reports");
    expect(releasesLink.compareDocumentPosition(reportsLink))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(releasesLink);
    fireEvent.click(reportsLink);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
