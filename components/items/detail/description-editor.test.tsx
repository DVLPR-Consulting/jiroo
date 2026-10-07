import { render, screen, waitFor, within } from "@testing-library/react";
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

const TEMPLATE = "## Étapes pour reproduire\n1. \n2. \n\n## Critères\n- [ ] ";

async function openEditor(description: string | null) {
  const user = userEvent.setup();
  render(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description={description} />);
  await user.click(
    screen.getByRole("button", { name: description ? "Éditer" : "Ajouter une description" }),
  );
  const editor = await screen.findByRole("textbox", { name: "Description" });
  return { user, editor };
}

describe("DescriptionEditor", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("edits the Markdown description as formatted content", async () => {
    const { editor } = await openEditor(TEMPLATE);
    await waitFor(() =>
      expect(within(editor).getByRole("heading", { level: 2, name: "Étapes pour reproduire" }))
        .toBeVisible(),
    );
    expect(within(editor).getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("toolbar", { name: "Mise en forme" })).toBeVisible();
    expect(screen.queryByText("## Étapes pour reproduire")).toBeNull();
  });

  it("saves the untouched Markdown unchanged", async () => {
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true });
    const { user } = await openEditor(TEMPLATE);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: TEMPLATE,
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("sends the Markdown produced by the toolbar on Enregistrer", async () => {
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true });
    const { user, editor } = await openEditor("Texte");
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Gras" }));
    expect(screen.getByText("9 / 20 000")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: "**Texte**",
    });
  });

  it("restores the read mode on Annuler without saving", async () => {
    const { user, editor } = await openEditor("Texte");
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Gras" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(mocks.updateItemAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.getByText("Texte").tagName).toBe("P");
    // Reopening starts again from the stored value.
    await user.click(screen.getByRole("button", { name: "Éditer" }));
    const reopened = await screen.findByRole("textbox", { name: "Description" });
    await waitFor(() => expect(reopened).toHaveTextContent("Texte"));
    expect(reopened.querySelector("strong")).toBeNull();
  });

  it("clears the description with null when emptied", async () => {
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true });
    const { user, editor } = await openEditor("Texte");
    await user.click(editor);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    expect(screen.getByText("0 / 20 000")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: null,
    });
  });

  it("counts the Markdown against the limit and associates a precise server error", async () => {
    mocks.updateItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Description trop longue (20 000 max).",
      fieldErrors: { description: ["Description trop longue (20 000 max)."] },
    });
    const { user, editor } = await openEditor("Texte");

    expect(screen.getByText("5 / 20 000")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Description trop longue (20 000 max).")).toBeVisible();
    expect(editor).toHaveAttribute("aria-invalid", "true");
    expect(editor.getAttribute("aria-describedby")).toMatch(/\S+ \S+/);
  });

  it("keeps a table description editable as raw Markdown", async () => {
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true });
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    const { user } = await openEditor(table);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Description" }).tagName).toBe("TEXTAREA"),
    );
    const raw = screen.getByRole("textbox", { name: "Description" });
    expect(raw).toHaveValue(table);
    expect(raw).toHaveAttribute("maxlength", "20000");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: table,
    });
  });
});
