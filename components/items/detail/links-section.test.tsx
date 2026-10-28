import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LinksSection } from "@/components/items/detail/links-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/shell/view-url-state", () => ({
  useViewUrlState: () => ({
    href: () => "/b/CASS?item=CASS-58",
    push: vi.fn(),
  }),
}));

vi.mock("@/app/actions/items", () => ({ updateItemAction: vi.fn() }));

vi.mock("@/app/actions/item-choices", () => ({
  searchBacklogItemsAction: vi.fn(async () => ({ ok: true as const, items: [], limit: 20 })),
}));

vi.mock("@/app/actions/links", () => ({
  addLinkAction: vi.fn(),
  removeLinkAction: vi.fn(),
}));

describe("LinksSection", () => {
  it("keeps relation removal in keyboard order without hover", async () => {
    const user = userEvent.setup();
    render(
      <LinksSection
        itemId="item-1"
        backlogKey="CASS"
        links={[
          {
            id: "link-1",
            sourceId: "item-1",
            targetId: "item-58",
            type: "relates",
            other: {
              id: "item-58",
              key: "CASS-58",
              title: "Item lié",
              type: "epic",
              statusId: "todo",
              statusName: "À faire",
              statusColor: "#999999",
              statusCategory: "todo",
            },
          },
        ]}
       
      />,
    );

    const link = screen.getByRole("link", { name: /CASS-58/ });
    // The Backlog row (JIR-93), its status read-only after the identity.
    const row = screen.getByRole("listitem");
    expect(row).toContainElement(link);
    expect(row).toHaveTextContent("À faire");
    expect(screen.getByRole("img", { name: "À faire" })).toBeInTheDocument();
    const remove = screen.getByRole("button", { name: "Supprimer le lien vers CASS-58" });
    expect(remove).not.toHaveClass("hidden");
    link.focus();
    await user.tab();
    expect(remove).toHaveFocus();
  });

  it("keeps the add form behind « + Lier un item » and closes it again", async () => {
    const user = userEvent.setup();
    render(
      <LinksSection itemId="item-1" backlogKey="CASS" links={[]} />,
    );

    expect(screen.queryByRole("combobox", { name: "Rechercher un item à lier" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /\+ Lier un item/ }));
    expect(screen.getByRole("combobox", { name: "Type de relation" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Rechercher un item à lier" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("combobox", { name: "Rechercher un item à lier" })).not.toBeInTheDocument();
  });

  it("opens the form on request from the drawer's « Lier un item » action", () => {
    const { rerender } = render(
      <LinksSection itemId="item-1" backlogKey="CASS" links={[]} openRequest={0} />,
    );
    rerender(
      <LinksSection itemId="item-1" backlogKey="CASS" links={[]} openRequest={1} />,
    );
    expect(screen.getByRole("combobox", { name: "Rechercher un item à lier" })).toHaveFocus();
  });

  it("shows nothing to add for a viewer without the link right", () => {
    render(
      <LinksSection itemId="item-1" backlogKey="CASS" links={[]} canLink={false} />,
    );
    expect(screen.getByText("Aucun item lié.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Lier un item/ })).not.toBeInTheDocument();
  });
});
