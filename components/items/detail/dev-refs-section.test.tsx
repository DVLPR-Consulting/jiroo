import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DevRefsSection } from "@/components/items/detail/dev-refs-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/refs", () => ({
  addRefAction: vi.fn(),
  removeRefAction: vi.fn(),
}));

describe("DevRefsSection", () => {
  it("keeps development-reference removal in keyboard order without hover", async () => {
    const user = userEvent.setup();
    render(
      <DevRefsSection
        itemId="item-1"
        backlogKey="CASS"
        refs={[
          {
            id: "ref-1",
            url: "https://github.com/openai/openai-node/pull/1",
            kind: "pr",
            createdAt: new Date("2026-08-04T10:00:00.000Z"),
          },
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: "PR #1 · openai/openai-node" });
    const remove = screen.getByRole("button", {
      name: "Supprimer le lien PR #1 · openai/openai-node",
    });
    expect(remove).not.toHaveClass("hidden");
    link.focus();
    await user.tab();
    expect(remove).toHaveFocus();
  });
});
