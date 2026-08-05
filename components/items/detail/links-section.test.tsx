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
            },
          },
        ]}
        candidates={[]}
      />,
    );

    const link = screen.getByRole("link", { name: /CASS-58/ });
    const remove = screen.getByRole("button", { name: "Supprimer le lien vers CASS-58" });
    expect(remove).not.toHaveClass("hidden");
    link.focus();
    await user.tab();
    expect(remove).toHaveFocus();
  });
});
