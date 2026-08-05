import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditableTitle } from "@/components/items/detail/editable-title";

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

describe("EditableTitle", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("exposes rename as a keyboard button while preserving a heading", async () => {
    const user = userEvent.setup();
    render(
      <EditableTitle
        itemId="item-1"
        itemKey="DEMO-1"
        backlogKey="DEMO"
        title="Titre initial"
      />,
    );

    const rename = screen.getByRole("button", { name: "Renommer DEMO-1" });
    expect(screen.getByRole("heading", { level: 2, name: "Titre initial" })).toBeVisible();
    rename.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("textbox", { name: "Titre de l’item" })).toHaveFocus();
  });

  it("keeps editing and associates the title field error", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Titre trop long (200 max).",
      fieldErrors: { title: ["Titre trop long (200 max)."] },
    });
    render(
      <EditableTitle
        itemId="item-1"
        itemKey="DEMO-1"
        backlogKey="DEMO"
        title="Titre initial"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Renommer DEMO-1" }));
    const input = screen.getByRole("textbox", { name: "Titre de l’item" });
    expect(input).toHaveAttribute("maxlength", "200");
    await user.clear(input);
    await user.type(input, "Nouveau titre");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Titre trop long (200 max).")).toBeVisible();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
  });
});
