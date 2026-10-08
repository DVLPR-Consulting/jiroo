import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseNotesEditor } from "@/components/releases/release-notes-editor";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/b/CASS/releases/r1/notes",
}));

const initialMarkdown = "# Notes de release — 2026.10\n\n## Fonctionnalités\n\n- CASS-1 — Recherche\n";

function installClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

let currentWriteText: ReturnType<typeof vi.fn>;

// user-event installs its own clipboard stub; replace it after setup.
function setupUser() {
  const user = userEvent.setup();
  installClipboard(currentWriteText);
  return user;
}

function renderEditor() {
  return render(
    <ReleaseNotesEditor
      initialMarkdown={initialMarkdown}
      fileBaseName="notes-de-release-2026-10"
      title="Notes de release — 2026.10"
      options={{ includeIncomplete: false, includeDescription: true }}
    />,
  );
}

describe("ReleaseNotesEditor", () => {
  const writeText = vi.fn();
  const createObjectURL = vi.fn(() => "blob:notes");
  const revokeObjectURL = vi.fn();
  let clicked: HTMLAnchorElement[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    currentWriteText = writeText;
    clicked = [];
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  async function editor() {
    const found = await screen.findByRole("textbox", { name: "Notes de release" });
    await waitFor(() => expect(found).toHaveTextContent("CASS-1 — Recherche"));
    return found;
  }

  /** Replaces the whole content with pasted plain text. */
  async function replaceWith(user: ReturnType<typeof setupUser>, target: HTMLElement, text: string) {
    await user.click(target);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    await user.paste(text);
  }

  it("renders the generated Markdown as formatted content and a live preview", async () => {
    const user = setupUser();
    renderEditor();
    const textbox = await editor();
    expect(within(textbox).getByRole("heading", { level: 2, name: "Fonctionnalités" })).toBeVisible();
    expect(screen.getByRole("toolbar", { name: "Mise en forme" })).toBeVisible();
    const preview = screen.getByRole("region", { name: "Aperçu" });
    expect(within(preview).getByRole("heading", { name: "Fonctionnalités" })).toBeVisible();

    await replaceWith(user, textbox, "Ajout manuel");
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Titre 2" }));
    expect(within(preview).getByRole("heading", { name: "Ajout manuel" })).toBeVisible();
  });

  // Pasted HTML only keeps what the editor schema knows (here <b> becomes
  // bold); typed HTML-looking text stays literal (lib/markdown tests).
  it("never renders raw HTML pasted in the editor", async () => {
    const user = setupUser();
    const { container } = renderEditor();
    await replaceWith(
      user,
      await editor(),
      '<img src=x onerror="alert(1)"><script>alert(2)</script><b>gras</b>',
    );
    const preview = screen.getByRole("region", { name: "Aperçu" });
    expect(preview.querySelector("img, script, b")).toBeNull();
    expect(preview.querySelector("strong")).toHaveTextContent("gras");
    expect(container.querySelector("img, script")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Copier le Markdown" }));
    expect(writeText).toHaveBeenLastCalledWith("**gras**");
  });

  it("copies the edited Markdown and the rendered HTML", async () => {
    const user = setupUser();
    renderEditor();
    await replaceWith(user, await editor(), "CASS-9 — Ajout");
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Liste à puces" }));
    await user.click(screen.getByRole("button", { name: "Copier le Markdown" }));
    expect(writeText).toHaveBeenLastCalledWith("- CASS-9 — Ajout");
    expect(screen.getByRole("status")).toHaveTextContent("Markdown copié.");

    await user.click(screen.getByRole("button", { name: "Copier le HTML" }));
    const html = writeText.mock.lastCall?.[0] as string;
    expect(html).toContain("<li>CASS-9 — Ajout</li>");
    expect(screen.getByRole("status")).toHaveTextContent("HTML copié.");
  });

  it("announces a clipboard failure", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const user = setupUser();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Copier le Markdown" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copie impossible."));
  });

  it("downloads the untouched generated .md byte-identical and a standalone .html document", async () => {
    const user = setupUser();
    renderEditor();
    await editor();
    await user.click(screen.getByRole("button", { name: "Télécharger .md" }));
    expect(clicked.at(-1)?.download).toBe("notes-de-release-2026-10.md");
    const mdBlob = (createObjectURL.mock.calls as unknown as Blob[][]).at(-1)?.[0] as Blob;
    expect(mdBlob.type).toBe("text/markdown;charset=utf-8");
    expect(await mdBlob.text()).toBe(initialMarkdown);

    await user.click(screen.getByRole("button", { name: "Télécharger .html" }));
    expect(clicked.at(-1)?.download).toBe("notes-de-release-2026-10.html");
    const htmlBlob = (createObjectURL.mock.calls as unknown as Blob[][]).at(-1)?.[0] as Blob;
    const html = await htmlBlob.text();
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<title>Notes de release — 2026.10</title>");
    expect(html).toContain("<h2>Fonctionnalités</h2>");
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:notes"), { timeout: 2_000 });
  });

  it("restores the generated text", async () => {
    const user = setupUser();
    renderEditor();
    const textbox = await editor();
    await replaceWith(user, textbox, "Brouillon");
    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));
    await waitFor(() =>
      expect(within(textbox).getByRole("heading", { level: 2, name: "Fonctionnalités" })).toBeVisible(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Notes régénérées.");
    await user.click(screen.getByRole("button", { name: "Copier le Markdown" }));
    expect(writeText).toHaveBeenLastCalledWith(initialMarkdown);
  });

  it("neutralizes javascript: links in the preview", async () => {
    const user = setupUser();
    renderEditor();
    await replaceWith(user, await editor(), "[piège](javascript:alert(1))");
    const preview = screen.getByRole("region", { name: "Aperçu" });
    expect(preview.querySelector('a[href^="javascript" i]')).toBeNull();
  });

  it("regenerates when the server sends new notes, after confirming the loss of edits", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = setupUser();
    const { rerender } = renderEditor();
    const textbox = await editor();
    await replaceWith(user, textbox, "édité");
    await user.click(screen.getByRole("checkbox", { name: "Inclure les éléments non terminés" }));
    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Inclure les éléments non terminés" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledWith("/b/CASS/releases/r1/notes?incomplete=1");
    rerender(
      <ReleaseNotesEditor
        initialMarkdown={"# Régénérées\n"}
        fileBaseName="notes-de-release-2026-10"
        title="Notes de release — 2026.10"
        options={{ includeIncomplete: true, includeDescription: true }}
      />,
    );
    await waitFor(() =>
      expect(within(textbox).getByRole("heading", { level: 1, name: "Régénérées" })).toBeVisible(),
    );
  });

  it("resets accepted edits when new options regenerate identical notes", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    const user = setupUser();
    const { rerender } = renderEditor();
    const textbox = await editor();
    await replaceWith(user, textbox, "Version locale");
    await user.click(screen.getByRole("checkbox", { name: "Inclure les éléments non terminés" }));
    rerender(
      <ReleaseNotesEditor
        initialMarkdown={initialMarkdown}
        fileBaseName="notes-de-release-2026-10"
        title="Notes de release — 2026.10"
        options={{ includeIncomplete: true, includeDescription: true }}
      />,
    );
    await waitFor(() => expect(textbox).toHaveTextContent("CASS-1 — Recherche"));
    expect(textbox).not.toHaveTextContent("Version locale");
  });

  it("round-trips options through the URL", async () => {
    const user = setupUser();
    renderEditor();
    await user.click(screen.getByRole("checkbox", { name: "Inclure les éléments non terminés" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/b/CASS/releases/r1/notes?incomplete=1");
    await user.click(screen.getByRole("checkbox", { name: "Inclure la description de la version" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/b/CASS/releases/r1/notes?description=0");
  });
});
