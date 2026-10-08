import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  describe("click to edit (Jira)", () => {
    const RICH = "Voir [la doc](https://exemple.fr) et le **texte**.\n\n- [ ] tâche";

    function renderRead(description: string | null = RICH) {
      render(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description={description} />);
      return screen.queryByRole("button", { name: "Modifier la description" });
    }

    it("exposes the rendering as a focusable « Modifier la description » control", () => {
      const region = renderRead()!;
      expect(region).toHaveAttribute("tabindex", "0");
      expect(region).toHaveClass("cursor-text");
      expect(within(region).getByRole("link", { name: "la doc" })).toBeVisible();
    });

    it("opens the editor when the text is clicked", async () => {
      const user = userEvent.setup();
      renderRead();
      await user.click(screen.getByText("texte"));
      expect(await screen.findByRole("textbox", { name: "Description" })).toBeVisible();
    });

    it("does not open the editor from a link or a task checkbox", async () => {
      const user = userEvent.setup();
      renderRead();
      const link = screen.getByRole("link", { name: "la doc" });
      link.addEventListener("click", (event) => event.preventDefault());
      await user.click(link);
      fireEvent.click(screen.getByRole("checkbox"));
      expect(screen.queryByRole("toolbar")).toBeNull();
      expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
    });

    it("does not hijack a text selection", () => {
      const region = renderRead()!;
      window.getSelection()!.selectAllChildren(region);
      fireEvent.click(screen.getByText("texte"));
      expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
      window.getSelection()!.removeAllRanges();
    });

    it.each(["{Enter}", " "])("opens the editor with %j on the focused rendering", async (key) => {
      const user = userEvent.setup();
      const region = renderRead()!;
      region.focus();
      await user.keyboard(key);
      expect(await screen.findByRole("textbox", { name: "Description" })).toBeVisible();
    });

    it("shows « Éditer » as an outline button with an icon", async () => {
      const user = userEvent.setup();
      renderRead();
      const edit = screen.getByRole("button", { name: "Éditer" });
      expect(edit.tagName).toBe("BUTTON");
      expect(edit).toHaveAttribute("data-slot", "button");
      expect(edit).toHaveAttribute("data-variant", "outline");
      expect(edit.querySelector("svg")).not.toBeNull();
      await user.click(edit);
      expect(await screen.findByRole("textbox", { name: "Description" })).toBeVisible();
    });

    it("makes the empty state the same click-to-edit surface", async () => {
      const user = userEvent.setup();
      renderRead(null);
      const empty = screen.getByRole("button", { name: "Ajouter une description" });
      expect(empty).toHaveClass("cursor-text");
      await user.click(empty);
      expect(await screen.findByRole("textbox", { name: "Description" })).toBeVisible();
    });

    it("keeps the read-only rendering inert", () => {
      render(
        <DescriptionEditor itemId="item-1" backlogKey="DEMO" description={RICH} readOnly />,
      );
      expect(screen.queryByRole("button", { name: "Modifier la description" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Éditer" })).toBeNull();
    });
  });
});
