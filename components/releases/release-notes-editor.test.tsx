import { render, screen, waitFor } from "@testing-library/react";
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

  it("renders the generated Markdown in an editable textarea and a live preview", async () => {
    const user = setupUser();
    renderEditor();
    const textarea = screen.getByRole("textbox", { name: "Notes de release (Markdown)" });
    expect(textarea).toHaveValue(initialMarkdown);
    expect(screen.getByRole("heading", { name: "Fonctionnalités" })).toBeVisible();

    await user.clear(textarea);
    await user.type(textarea, "## Ajout manuel");
    expect(screen.getByRole("heading", { name: "Ajout manuel" })).toBeVisible();
  });

  it("never renders raw HTML typed in the textarea", async () => {
    const user = setupUser();
    const { container } = renderEditor();
    const textarea = screen.getByRole("textbox", { name: "Notes de release (Markdown)" });
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('<img src=x onerror="alert(1)"><script>alert(2)</script><b>gras</b>');
    const preview = screen.getByRole("region", { name: "Aperçu" });
    expect(preview.querySelector("img, script, b")).toBeNull();
    expect(preview).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(container.querySelector("img, script")).toBeNull();
  });

  it("copies the edited Markdown and the rendered HTML", async () => {
    const user = setupUser();
    renderEditor();
    const textarea = screen.getByRole("textbox", { name: "Notes de release (Markdown)" });
    await user.type(textarea, "\n- CASS-9 — Ajout");
    await user.click(screen.getByRole("button", { name: "Copier le Markdown" }));
    expect(writeText).toHaveBeenLastCalledWith(`${initialMarkdown}\n- CASS-9 — Ajout`);
    expect(screen.getByRole("status")).toHaveTextContent("Markdown copié.");

    await user.click(screen.getByRole("button", { name: "Copier le HTML" }));
    const html = writeText.mock.lastCall?.[0] as string;
    expect(html).toContain("<h2>Fonctionnalités</h2>");
    expect(html).toContain("CASS-9 — Ajout");
    expect(screen.getByRole("status")).toHaveTextContent("HTML copié.");
  });

  it("announces a clipboard failure", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const user = setupUser();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Copier le Markdown" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copie impossible."));
  });

  it("downloads .md and a standalone .html document", async () => {
    const user = setupUser();
    renderEditor();
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
    const textarea = screen.getByRole("textbox", { name: "Notes de release (Markdown)" });
    await user.clear(textarea);
    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(textarea).toHaveValue(initialMarkdown);
    expect(screen.getByRole("status")).toHaveTextContent("Notes régénérées.");
  });

  it("neutralizes javascript: links in the preview", async () => {
    const user = setupUser();
    renderEditor();
    const textarea = screen.getByRole("textbox", { name: "Notes de release (Markdown)" });
    await user.clear(textarea);
    await user.click(textarea);
    await user.paste("[piège](javascript:alert(1))");
    const link = screen.getByText("piège").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/javascript:/i);
  });

  it("regenerates when the server sends new notes, after confirming the loss of edits", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = setupUser();
    const { rerender } = renderEditor();
    const textarea = screen.getByRole("textbox", { name: "Notes de release (Markdown)" });
    await user.type(textarea, " édité");
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
    expect(textarea).toHaveValue("# Régénérées\n");
  });

  it("resets accepted edits when new options regenerate identical notes", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    const user = setupUser();
    const { rerender } = renderEditor();
    const textarea = screen.getByRole("textbox", { name: "Notes de release (Markdown)" });
    await user.clear(textarea);
    await user.type(textarea, "# Version locale");
    await user.click(screen.getByRole("checkbox", { name: "Inclure les éléments non terminés" }));
    rerender(
      <ReleaseNotesEditor
        initialMarkdown={initialMarkdown}
        fileBaseName="notes-de-release-2026-10"
        title="Notes de release — 2026.10"
        options={{ includeIncomplete: true, includeDescription: true }}
      />,
    );
    expect(textarea).toHaveValue(initialMarkdown);
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
