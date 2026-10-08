import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const RICH = "Voir [la doc](https://exemple.fr) et le **texte**.";
const PLACEHOLDER = "Écrivez, ou tapez « / » pour insérer un bloc…";
/** Longer than the autosave pause. */
const AFTER_PAUSE = { timeout: 3000 };

function renderDescription(
  description: string | null,
  props: { readOnly?: boolean; itemId?: string } = {},
) {
  // ProseMirror drops keys typed by user-event in jsdom without a small delay.
  const user = userEvent.setup({ delay: 5 });
  const view = render(
    <DescriptionEditor
      itemId={props.itemId ?? "item-1"}
      backlogKey="DEMO"
      description={description}
      readOnly={props.readOnly}
    />,
  );
  return { user, ...view };
}

async function editor() {
  const textbox = await screen.findByRole("textbox", { name: "Description" });
  await waitFor(() => expect(textbox).toHaveAttribute("contenteditable"));
  return textbox;
}

/** Replaces the whole text (jsdom cannot move the caret with Ctrl+End). */
async function retype(user: ReturnType<typeof userEvent.setup>, text: string) {
  const textbox = await editor();
  await user.click(textbox);
  await user.keyboard("{Control>}a{/Control}");
  await user.keyboard(text);
  return textbox;
}

describe("DescriptionEditor (Notion-like page)", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
    mocks.updateItemAction.mockResolvedValue({ ok: true, item: {} });
  });

  it("renders the description in the editor, editable in place", async () => {
    renderDescription(TEMPLATE);
    const textbox = await editor();
    await waitFor(() =>
      expect(within(textbox).getByRole("heading", { level: 2, name: "Étapes pour reproduire" }))
        .toBeVisible(),
    );
    expect(textbox).toHaveAttribute("contenteditable", "true");
    expect(within(textbox).getByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Éditer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Annuler" })).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Mise en forme" })).toBeNull();
  });

  it("shows the placeholder instead of an empty state", async () => {
    renderDescription(null);
    await editor();
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter une description" })).toBeNull();
  });

  it("autosaves after a pause in typing and reports the status", async () => {
    let resolve!: (value: unknown) => void;
    mocks.updateItemAction.mockImplementationOnce(
      () => new Promise((res) => (resolve = res)),
    );
    const { user } = renderDescription("Texte");
    await retype(user, "Texte complété");
    expect(mocks.updateItemAction).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.updateItemAction).toHaveBeenCalledTimes(1), AFTER_PAUSE);
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: "Texte complété",
    });
    expect(screen.getByText("Enregistrement…")).toBeInTheDocument();
    await act(async () => resolve({ ok: true, item: {} }));
    expect(await screen.findByText("Enregistré")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.getByText("Enregistré").closest("[aria-live]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("saves at once when the editor loses focus", async () => {
    const { user } = renderDescription("Texte");
    await retype(user, "Texte!");
    await act(async () => (await editor()).blur());
    await waitFor(() =>
      expect(mocks.updateItemAction).toHaveBeenCalledWith({
        id: "item-1",
        backlogKey: "DEMO",
        description: "Texte!",
      }),
    );
  });

  it("does not save a description that did not change", async () => {
    const { user } = renderDescription("Texte");
    const textbox = await editor();
    await user.click(textbox);
    await act(async () => textbox.blur());
    await new Promise((res) => setTimeout(res, 1100));
    expect(mocks.updateItemAction).not.toHaveBeenCalled();
  });

  it("saves the pending change when the drawer closes (unmount)", async () => {
    const { user, unmount } = renderDescription("Texte");
    await retype(user, "Texte fin");
    unmount();
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: "Texte fin",
    });
  });

  it("clears the description with null when emptied", async () => {
    const { user } = renderDescription("Texte");
    const textbox = await editor();
    await user.click(textbox);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    await act(async () => textbox.blur());
    await waitFor(() =>
      expect(mocks.updateItemAction).toHaveBeenCalledWith({
        id: "item-1",
        backlogKey: "DEMO",
        description: null,
      }),
    );
  });

  it("keeps the text on failure and retries on demand", async () => {
    mocks.updateItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Mise à jour impossible.",
    });
    const { user } = renderDescription("Texte");
    const textbox = await retype(user, "Texte gardé");
    await act(async () => textbox.blur());
    expect(
      await screen.findByText("Échec de l’enregistrement : Mise à jour impossible."),
    ).toBeInTheDocument();
    expect(textbox).toHaveTextContent("Texte gardé");
    expect(textbox).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(mocks.updateItemAction).toHaveBeenCalledTimes(2));
    expect(mocks.updateItemAction).toHaveBeenLastCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: "Texte gardé",
    });
    expect(await screen.findByText("Enregistré")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
  });

  it("shows the counter only near the limit", async () => {
    const { rerender } = renderDescription("Texte");
    await editor();
    expect(screen.queryByText(/\/ 20 000/)).toBeNull();
    const long = "a".repeat(18_500);
    rerender(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description={long} />);
    expect(await screen.findByText("18 500 / 20 000")).toBeInTheDocument();
  });

  it("takes a description saved elsewhere when nothing is pending", async () => {
    const { rerender } = renderDescription("Avant");
    const textbox = await editor();
    rerender(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description="Après" />);
    await waitFor(() => expect(textbox).toHaveTextContent("Après"));
    expect(mocks.updateItemAction).not.toHaveBeenCalled();
  });

  it("never replaces a change that is not saved yet", async () => {
    const { user, rerender } = renderDescription("Avant");
    const textbox = await retype(user, "Avant local");
    rerender(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description="Distant" />);
    expect(textbox).toHaveTextContent("Avant local");
    await waitFor(
      () =>
        expect(mocks.updateItemAction).toHaveBeenCalledWith({
          id: "item-1",
          backlogKey: "DEMO",
          description: "Avant local",
        }),
      AFTER_PAUSE,
    );
  });

  it("leaves the editor on Escape and lets the next Escape reach the drawer", async () => {
    const { user } = renderDescription("Texte");
    const textbox = await editor();
    await user.click(textbox);
    expect(textbox).toHaveAttribute("data-local-escape");
    await user.keyboard("{Escape}");
    expect(textbox).not.toHaveFocus();
    expect(document.activeElement).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement?.closest("[data-local-escape]")).toBeNull();
  });

  it("handles Escape even when a surrounding dialog cancels it (Radix)", async () => {
    // Radix dialogs preventDefault Escape from a document capture listener.
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", cancel, true);
    try {
      const { user } = renderDescription(null);
      const textbox = await editor();
      await user.click(textbox);
      await user.keyboard("/");
      await screen.findByRole("listbox", { name: "Insérer un bloc" });
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(textbox).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(textbox).not.toHaveFocus();
    } finally {
      document.removeEventListener("keydown", cancel, true);
    }
  });

  it("inserts a block from the « / » menu", async () => {
    const { user } = renderDescription(null);
    const textbox = await editor();
    await user.click(textbox);
    await user.keyboard("/tit");
    const menu = await screen.findByRole("listbox", { name: "Insérer un bloc" });
    expect(within(menu).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Titre 1#",
      "Titre 2##",
      "Titre 3###",
    ]);
    expect(textbox).toHaveAttribute("aria-controls", menu.id);
    await user.click(within(menu).getByRole("option", { name: /Titre 1/ }));
    await user.keyboard("Contexte");
    expect(within(textbox).getByRole("heading", { level: 1, name: "Contexte" })).toBeVisible();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes the « / » menu with Escape without leaving the editor", async () => {
    const { user } = renderDescription(null);
    const textbox = await editor();
    await user.click(textbox);
    await user.keyboard("/");
    await screen.findByRole("listbox", { name: "Insérer un bloc" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(textbox).toHaveFocus();
  });

  it("formats the selection from the selection bar", async () => {
    const { user } = renderDescription("Texte");
    const textbox = await editor();
    await user.click(textbox);
    await user.keyboard("{Control>}a{/Control}");
    const bar = await screen.findByRole("toolbar", { name: "Mise en forme de la sélection" });
    expect(
      within(bar).getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Gras", "Italique", "Barré", "Code", "Lien"]);
    await user.click(within(bar).getByRole("button", { name: "Gras" }));
    await act(async () => textbox.blur());
    await waitFor(() =>
      expect(mocks.updateItemAction).toHaveBeenCalledWith({
        id: "item-1",
        backlogKey: "DEMO",
        description: "**Texte**",
      }),
    );
  });

  it("keeps a table description editable as raw Markdown with an explicit save", async () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    const { user } = renderDescription(table);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Description" }).tagName).toBe("TEXTAREA"),
    );
    const raw = screen.getByRole("textbox", { name: "Description" });
    expect(raw).toHaveAttribute("maxlength", "20000");
    await user.type(raw, "\n| 3 | 4 |");
    await act(async () => raw.blur());
    await new Promise((res) => setTimeout(res, 1100));
    expect(mocks.updateItemAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      description: `${table}\n| 3 | 4 |`,
    });
  });

  it("cancels raw Markdown changes", async () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    const { user } = renderDescription(table);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Description" }).tagName).toBe("TEXTAREA"),
    );
    const raw = screen.getByRole("textbox", { name: "Description" });
    await user.type(raw, "x");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(raw).toHaveValue(table);
  });

  it("keeps unsaved raw Markdown when the description changes elsewhere", async () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    const { user, rerender } = renderDescription(table);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Description" }).tagName).toBe("TEXTAREA"),
    );
    const raw = screen.getByRole("textbox", { name: "Description" });
    await user.type(raw, "x");
    rerender(<DescriptionEditor itemId="item-1" backlogKey="DEMO" description="Distant" />);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(`${table}x`);
  });

  it("returns to the text with Escape from the selection bar", async () => {
    const { user } = renderDescription("Texte");
    const textbox = await editor();
    await user.click(textbox);
    await user.keyboard("{Control>}a{/Control}");
    const bar = await screen.findByRole("toolbar", { name: "Mise en forme de la sélection" });
    const bold = within(bar).getByRole("button", { name: "Gras" });
    bold.focus();
    expect(bar).toHaveAttribute("data-local-escape");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(textbox).toHaveFocus());
  });

  describe("read-only", () => {
    it("uses the same rendering, not editable, with clickable links", async () => {
      renderDescription(RICH, { readOnly: true });
      const textbox = await screen.findByRole("textbox", { name: "Description" });
      await waitFor(() => expect(textbox).toHaveAttribute("contenteditable", "false"));
      expect(textbox).toHaveAttribute("aria-readonly", "true");
      expect(within(textbox).getByRole("link", { name: "la doc" })).toHaveAttribute(
        "href",
        "https://exemple.fr",
      );
      expect(screen.queryByText(PLACEHOLDER)).toBeNull();
      expect(screen.queryByText("Enregistré")).toBeNull();
    });

    it("never saves", async () => {
      renderDescription(RICH, { readOnly: true });
      const textbox = await screen.findByRole("textbox", { name: "Description" });
      fireEvent.blur(textbox);
      await new Promise((res) => setTimeout(res, 1100));
      expect(mocks.updateItemAction).not.toHaveBeenCalled();
    });

    it("says when there is no description", () => {
      renderDescription(null, { readOnly: true });
      expect(screen.getByText("Aucune description.")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("renders unsupported content as formatted Markdown", async () => {
      renderDescription("| a | b |\n|---|---|\n| 1 | 2 |", { readOnly: true });
      expect(await screen.findByRole("table")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });
});
