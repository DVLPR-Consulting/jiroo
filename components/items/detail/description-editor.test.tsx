import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DescriptionEditor } from "@/components/items/detail/description-editor";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/app/actions/items", () => ({
  updateItemAction: mocks.updateItemAction,
}));

describe("DescriptionEditor", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("limits description input and associates a precise server error", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Description trop longue (20 000 max).",
      fieldErrors: { description: ["Description trop longue (20 000 max)."] },
    });
    render(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description="Texte" />);
    await user.click(screen.getByRole("button", { name: "Éditer" }));
    const editor = screen.getByRole("textbox", {
      name: "Description (Markdown supporté)…",
    });

    expect(editor).toHaveAttribute("maxlength", "20000");
    expect(screen.getByText("5 / 20 000")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Description trop longue (20 000 max)."))
      .toBeVisible();
    expect(editor).toHaveAttribute("aria-invalid", "true");
  });
});
