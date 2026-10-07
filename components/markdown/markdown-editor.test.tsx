import { createRef, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown/markdown-editor";

function Harness({
  initial,
  onChange,
  onSubmitShortcut,
  maxLength,
}: {
  initial: string;
  onChange?: (markdown: string) => void;
  onSubmitShortcut?: () => void;
  maxLength?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MarkdownEditor
        value={value}
        label="Contenu"
        maxLength={maxLength}
        onSubmitShortcut={onSubmitShortcut}
        onChange={(markdown) => {
          setValue(markdown);
          onChange?.(markdown);
        }}
      />
      <output data-testid="markdown">{value}</output>
      <button type="button" onClick={() => setValue("## Réinitialisé")}>
        Réinitialiser
      </button>
    </>
  );
}

const markdown = () => screen.getByTestId("markdown").textContent;

async function selectAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("textbox", { name: "Contenu" }));
  await user.keyboard("{Control>}a{/Control}");
}

describe("MarkdownEditor", () => {
  it("renders the initial Markdown as formatted content without emitting a change", async () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={"## Étapes\n\n**gras** et [lien](https://exemple.fr)\n\n- [x] fait\n\n1. un"}
        onChange={onChange}
      />,
    );
    const editor = await screen.findByRole("textbox", { name: "Contenu" });
    await waitFor(() =>
      expect(within(editor).getByRole("heading", { level: 2, name: "Étapes" })).toBeVisible(),
    );
    expect(editor.querySelector("strong")).toHaveTextContent("gras");
    expect(within(editor).getByRole("link", { name: "lien" })).toHaveAttribute(
      "href",
      "https://exemple.fr",
    );
    expect(within(editor).getByRole("checkbox", { name: "Tâche faite : fait" })).toBeChecked();
    expect(within(editor).getAllByRole("listitem")).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("exposes an accessible toolbar with French labels", async () => {
    render(<Harness initial="texte" />);
    const toolbar = await screen.findByRole("toolbar", { name: "Mise en forme" });
    const names = within(toolbar)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Titre 2",
      "Titre 3",
      "Gras",
      "Italique",
      "Barré",
      "Code en ligne",
      "Liste à puces",
      "Liste numérotée",
      "Liste de tâches",
      "Citation",
      "Bloc de code",
      "Lien",
      "Annuler la modification",
      "Rétablir la modification",
    ]);
    expect(within(toolbar).getByRole("button", { name: "Gras" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Roving tab stop: a single button is tabbable.
    expect(toolbar.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("moves between toolbar buttons with the arrow, Home and End keys", async () => {
    const user = userEvent.setup();
    render(<Harness initial="texte" />);
    const toolbar = await screen.findByRole("toolbar", { name: "Mise en forme" });
    within(toolbar).getByRole("button", { name: "Titre 2" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(toolbar).getByRole("button", { name: "Titre 3" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    // Wraps to the last enabled button (undo/redo are disabled without history).
    expect(within(toolbar).getByRole("button", { name: "Lien" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(within(toolbar).getByRole("button", { name: "Titre 2" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(within(toolbar).getByRole("button", { name: "Lien" })).toHaveFocus();
    expect(within(toolbar).getByRole("button", { name: "Lien" })).toHaveAttribute("tabindex", "0");
  });

  it.each([
    ["Gras", "**texte**"],
    ["Italique", "*texte*"],
    ["Barré", "~~texte~~"],
    ["Code en ligne", "`texte`"],
  ])("applies %s from the toolbar and emits Markdown", async (label, expected) => {
    const user = userEvent.setup();
    render(<Harness initial="texte" />);
    await selectAll(user);
    const button = screen.getByRole("button", { name: label });
    await user.click(button);
    expect(markdown()).toBe(expected);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["Titre 2", "## texte"],
    ["Titre 3", "### texte"],
    ["Liste à puces", "- texte"],
    ["Liste numérotée", "1. texte"],
    ["Liste de tâches", "- [ ] texte"],
    ["Citation", "> texte"],
    ["Bloc de code", "```\ntexte\n```"],
  ])("applies the %s block from the toolbar and emits Markdown", async (label, expected) => {
    const user = userEvent.setup();
    render(<Harness initial="texte" />);
    await selectAll(user);
    await user.click(screen.getByRole("button", { name: label }));
    expect(markdown()).toBe(expected);
  });

  it.each([
    ["## titre", "Titre 2"],
    ["- [ ] tâche", "Liste de tâches"],
    ["> citation", "Citation"],
  ])("marks the active block of %j as pressed", async (initial, label) => {
    const user = userEvent.setup();
    render(<Harness initial={initial} />);
    await user.click(await screen.findByRole("textbox", { name: "Contenu" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: "Gras" })).toHaveAttribute("aria-pressed", "false");
  });

  it("undoes and redoes from the toolbar", async () => {
    const user = userEvent.setup();
    render(<Harness initial="texte" />);
    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Gras" }));
    expect(markdown()).toBe("**texte**");
    await user.click(screen.getByRole("button", { name: "Annuler la modification" }));
    expect(markdown()).toBe("texte");
    await user.click(screen.getByRole("button", { name: "Rétablir la modification" }));
    expect(markdown()).toBe("**texte**");
  });

  it("validates link URLs and refuses javascript:", async () => {
    const user = userEvent.setup();
    render(<Harness initial="texte" />);
    await selectAll(user);
    await user.click(screen.getByRole("button", { name: "Lien" }));
    const input = screen.getByRole("textbox", { name: "Adresse du lien" });
    expect(input).toHaveFocus();
    await user.type(input, "javascript:alert(1){Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Adresse invalide");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(markdown()).toBe("texte");

    await user.clear(input);
    await user.type(input, "exemple.fr{Enter}");
    expect(markdown()).toBe("[texte](https://exemple.fr)");
    expect(screen.queryByRole("textbox", { name: "Adresse du lien" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Lien" }));
    expect(screen.getByRole("textbox", { name: "Adresse du lien" })).toHaveValue(
      "https://exemple.fr",
    );
    await user.click(screen.getByRole("button", { name: "Retirer le lien" }));
    expect(markdown()).toBe("texte");
  });

  it("opens the link form with Ctrl+K and closes it with Escape", async () => {
    const user = userEvent.setup();
    render(<Harness initial="texte" />);
    await selectAll(user);
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("textbox", { name: "Adresse du lien" });
    await user.type(input, "{Escape}");
    expect(screen.queryByRole("textbox", { name: "Adresse du lien" })).toBeNull();
  });

  it("calls the submit shortcut on Ctrl+Enter", async () => {
    const user = userEvent.setup();
    const onSubmitShortcut = vi.fn();
    render(<Harness initial="texte" onSubmitShortcut={onSubmitShortcut} />);
    await user.click(await screen.findByRole("textbox", { name: "Contenu" }));
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmitShortcut).toHaveBeenCalledTimes(1);
  });

  it("enforces the limit on the produced Markdown", async () => {
    const user = userEvent.setup();
    render(<Harness initial="abcdef" maxLength={8} />);
    await selectAll(user);
    // "**abcdef**" would be 10 characters.
    await user.click(screen.getByRole("button", { name: "Gras" }));
    expect(markdown()).toBe("abcdef");
    await user.click(screen.getByRole("button", { name: "Italique" }));
    expect(markdown()).toBe("*abcdef*");
  });

  it("loads a new value from the parent", async () => {
    const user = userEvent.setup();
    render(<Harness initial="texte" />);
    const editor = await screen.findByRole("textbox", { name: "Contenu" });
    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));
    await waitFor(() =>
      expect(within(editor).getByRole("heading", { level: 2, name: "Réinitialisé" })).toBeVisible(),
    );
  });

  it("keeps unsupported Markdown intact by editing it raw", async () => {
    const user = userEvent.setup();
    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    render(<Harness initial={table} />);
    const textarea = await screen.findByRole("textbox", { name: "Contenu" });
    await waitFor(() => expect(textarea.tagName).toBe("TEXTAREA"));
    const raw = screen.getByRole("textbox", { name: "Contenu" });
    expect(raw).toHaveValue(table);
    expect(screen.getByText(/tableau/)).toBeVisible();
    expect(screen.queryByRole("toolbar")).toBeNull();
    await user.type(raw, "\nfin");
    expect(markdown()).toBe(`${table}\nfin`);
  });

  it("reports the text before the caret and replaces it (for @-mentions)", async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onCaretTextChange = vi.fn();
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        ref={ref}
        value="Bonjour @Al"
        label="Contenu"
        onChange={onChange}
        onCaretTextChange={onCaretTextChange}
      />,
    );
    await screen.findByRole("toolbar");
    act(() => ref.current!.focus("end"));
    await waitFor(() => expect(onCaretTextChange).toHaveBeenLastCalledWith("Bonjour @Al"));
    act(() => ref.current!.replaceTextBeforeCaret(3, "@Alice "));
    expect(onChange).toHaveBeenLastCalledWith("Bonjour @Alice ");
  });

  it("keeps @-mention support in the raw Markdown fallback", async () => {
    const user = userEvent.setup();
    const ref = createRef<MarkdownEditorHandle>();
    const onCaretTextChange = vi.fn();
    const table = "| a |\n|---|\n| 1 |";
    function Controlled() {
      const [value, setValue] = useState(table);
      return (
        <>
          <MarkdownEditor
            ref={ref}
            value={value}
            label="Contenu"
            onChange={setValue}
            onCaretTextChange={onCaretTextChange}
          />
          <output data-testid="markdown">{value}</output>
        </>
      );
    }
    render(<Controlled />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Contenu" }).tagName).toBe("TEXTAREA"),
    );
    await user.type(screen.getByRole("textbox", { name: "Contenu" }), "{End}\nMerci @Al");
    expect(onCaretTextChange).toHaveBeenLastCalledWith("Merci @Al");
    act(() => ref.current!.replaceTextBeforeCaret(3, "@Alice "));
    expect(markdown()).toBe(`${table}\nMerci @Alice `);
  });
});
