import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CollapsibleItemSection,
  ItemSection,
  ItemSectionHeader,
  ItemSectionSummary,
  SectionSelectAll,
  StatusPointsPills,
} from "@/components/items/item-section";
import { itemsSummaryLabel } from "@/lib/format/plural";

describe("item section", () => {
  it("frames a named card and marks it as a shared item section", () => {
    render(
      <ItemSection aria-label="Tous les items" data-extra="1">
        <p>rows</p>
      </ItemSection>,
    );
    const card = screen.getByRole("region", { name: "Tous les items" });
    expect(card).toHaveAttribute("data-item-section");
    expect(card).toHaveAttribute("data-extra", "1");
    expect(card).toHaveClass("rounded-[var(--radius-lg)]", "border", "border-border");
  });

  it("highlights a drop target", () => {
    render(<ItemSection aria-label="Sprint 1" highlighted>rows</ItemSection>);
    expect(screen.getByRole("region", { name: "Sprint 1" })).toHaveClass("border-[var(--ring)]");
  });

  it("lays out the Backlog header: select-all, chevron, title, summary, points, actions, meta", async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <ItemSectionHeader
        name="Tous les items"
        headingLevel={2}
        expanded
        onExpandedChange={onExpandedChange}
        selectControl={
          <SectionSelectAll
            checked={false}
            indeterminate
            onChange={onSelect}
            label="Sélectionner tous les items visibles"
          />
        }
        summary={<ItemSectionSummary>{itemsSummaryLabel(3, 1)}</ItemSectionSummary>}
        aside={<StatusPointsPills value={{ todo: 5, inProgress: 3, done: 0 }} />}
        meta={<span>Trier</span>}
      />,
    );

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("heading", { level: 2, name: "Tous les items" })).toBeVisible();
    expect(within(header).getByText("3 items · 1 non estimé")).toBeVisible();
    expect(within(header).getByText("Points par statut : À faire 5, En cours 3, Terminé 0"))
      .toBeInTheDocument();
    expect(within(header).getByText("Trier").parentElement).toHaveClass("basis-full");
    const checkbox = within(header).getByRole("checkbox", { name: "Sélectionner tous les items visibles" });
    expect(checkbox).toBePartiallyChecked();
    await user.click(checkbox);
    expect(onSelect).toHaveBeenCalledTimes(1);

    const toggle = within(header).getByRole("button", { name: "Replier Tous les items" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it("leaves out the chevron and the right side when they do not apply", () => {
    const { container } = render(<ItemSectionHeader name="Corbeille" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector(".ml-auto")).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Corbeille" })).toBeVisible();
  });

  it("collapses its rows and footer in the component session only", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleItemSection
        name="Terminés"
        label="Terminés (2)"
        summary={<ItemSectionSummary>2 items</ItemSectionSummary>}
        footer={<nav aria-label="Pagination" />}
      >
        <ul aria-label="Lignes"><li>CASS-1</li></ul>
      </CollapsibleItemSection>,
    );

    const card = screen.getByRole("region", { name: "Terminés (2)" });
    expect(within(card).getByRole("list", { name: "Lignes" })).toBeVisible();
    await user.click(within(card).getByRole("button", { name: "Replier Terminés" }));
    expect(within(card).queryByRole("list")).not.toBeInTheDocument();
    expect(within(card).queryByRole("navigation")).not.toBeInTheDocument();
    expect(within(card).getByText("2 items")).toBeVisible();
    await user.click(within(card).getByRole("button", { name: "Déplier Terminés" }));
    expect(within(card).getByRole("list", { name: "Lignes" })).toBeVisible();
  });
});
