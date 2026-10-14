import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebLinksSection } from "@/components/items/detail/web-links-section";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), add: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/web-links", () => ({
  addWebLinkAction: mocks.add, removeWebLinkAction: mocks.remove,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.success, error: mocks.error } }));

const webLinks = [
  {
    id: "figma-1", url: "https://www.figma.com/design/abc/Prototype", title: "Maquette du paiement",
    createdAt: "2026-10-14T08:00:00.000Z",
  },
  {
    id: "web-1", url: "https://www.example.com/spec?version=2", title: null,
    createdAt: "2026-10-14T08:00:00.000Z",
  },
];
const baseProps = { itemId: "item-1", backlogKey: "CASS", webLinks: [], canLink: true };

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Ajouter un lien web/ }));
  const url = screen.getByRole("textbox", { name: "URL du lien" });
  expect(url).toHaveFocus();
  return { url, title: screen.getByRole("textbox", { name: "Texte affiché" }) };
}

describe("WebLinksSection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.add.mockResolvedValue({ ok: true, webLink: { id: "new-1" } });
    mocks.remove.mockResolvedValue({ ok: true });
  });

  it("renders titled Figma and untitled web links opening in new tabs", () => {
    render(<WebLinksSection {...baseProps} webLinks={webLinks} />);
    const figma = screen.getByRole("link", { name: "Maquette du paiement" });
    const web = screen.getByRole("link", { name: "example.com/spec" });
    for (const data of webLinks) {
      const link = screen.getByRole("link", { name: data.title ?? "example.com/spec" });
      expect(link).toHaveAttribute("href", data.url);
      expect(link).toHaveAttribute("title", data.url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(figma.parentElement?.querySelector(".lucide-figma")).toBeInTheDocument();
    expect(web.parentElement?.querySelector(".lucide-link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un lien web" })).not.toHaveClass("border-dashed");
  });

  it("adds the URL and title, then closes and clears the form", async () => {
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} />);
    expect(screen.getByRole("button", { name: "+ Ajouter un lien web" })).toHaveClass("border-dashed");
    const { url, title } = await openForm(user);
    await user.type(url, " https://figma.com/design/abc ");
    await user.type(title, " Maquettes ");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith({
      backlogKey: "CASS", itemId: "item-1", url: "https://figma.com/design/abc", title: "Maquettes",
    });
    expect(mocks.success).toHaveBeenCalledWith("Lien ajouté.");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    const reopened = await openForm(user);
    expect(reopened.url).toHaveValue("");
    expect(reopened.title).toHaveValue("");
  });

  it.each(["URL du lien", "Texte affiché"])("submits with Enter from %s", async (field) => {
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} />);
    const { url } = await openForm(user);
    await user.type(url, "https://example.com/spec");
    await user.click(screen.getByRole("textbox", { name: field }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mocks.add).toHaveBeenCalledExactlyOnceWith({
      backlogKey: "CASS", itemId: "item-1", url: "https://example.com/spec", title: "",
    }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps both entered values when the action returns an error", async () => {
    mocks.add.mockResolvedValue({ ok: false, error: "URL invalide (http ou https)." });
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} />);
    const { url, title } = await openForm(user);
    await user.type(url, "ftp://example.com/spec");
    await user.type(title, "Spécification");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("URL invalide (http ou https)."));
    expect(url).toHaveValue("ftp://example.com/spec");
    expect(title).toHaveValue("Spécification");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("closes and clears both fields with Escape", async () => {
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} />);
    const { url, title } = await openForm(user);
    expect(url.closest("[data-local-escape]")).not.toBeNull();
    await user.type(url, "https://example.com/spec");
    await user.type(title, "Spécification");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const reopened = await openForm(user);
    expect(reopened.url).toHaveValue("");
    expect(reopened.title).toHaveValue("");
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("disables adding an empty or whitespace-only URL", async () => {
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} />);
    const { url } = await openForm(user);
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
    await user.type(url, "   ");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("disables controls and shows pending state during submission", async () => {
    let resolveAdd!: (value: { ok: true }) => void;
    mocks.add.mockReturnValue(new Promise((resolve) => { resolveAdd = resolve; }));
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} webLinks={webLinks} />);
    const { url, title } = await openForm(user);
    await user.type(url, "https://example.com/spec");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(screen.getByRole("button", { name: "Ajout…" })).toBeDisabled();
    expect(url).toBeDisabled();
    expect(title).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: /^Supprimer le lien/ })) {
      expect(button).toBeDisabled();
    }
    await act(async () => resolveAdd({ ok: true }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps removal after its link in keyboard order and removes with Enter", async () => {
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} webLinks={webLinks} />);
    const link = screen.getByRole("link", { name: "Maquette du paiement" });
    const remove = screen.getByRole("button", { name: "Supprimer le lien Maquette du paiement" });
    expect(remove).not.toHaveClass("hidden");
    link.focus();
    await user.tab();
    expect(remove).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ backlogKey: "CASS", id: "figma-1" }));
    expect(mocks.success).toHaveBeenCalledWith("Lien supprimé.");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("reports removal errors without refreshing", async () => {
    mocks.remove.mockResolvedValue({ ok: false, error: "Action impossible sur le lien." });
    const user = userEvent.setup();
    render(<WebLinksSection {...baseProps} webLinks={webLinks} />);
    await user.click(screen.getByRole("button", { name: "Supprimer le lien Maquette du paiement" }));
    expect(mocks.error).toHaveBeenCalledWith("Action impossible sur le lien.");
    expect(screen.getByRole("link", { name: "Maquette du paiement" })).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows links without mutation controls when linking is forbidden", () => {
    render(<WebLinksSection {...baseProps} webLinks={webLinks} canLink={false} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty list without linking permission", () => {
    const { container } = render(<WebLinksSection {...baseProps} canLink={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
