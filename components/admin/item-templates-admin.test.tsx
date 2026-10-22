import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemTemplatesAdmin } from "./item-templates-admin";
import type { ItemTemplateDto } from "@/lib/services/item-templates";
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/item-templates", () => ({ createItemTemplateAction: mocks.create, updateItemTemplateAction: mocks.update, deleteItemTemplateAction: mocks.remove }));
vi.mock("@/components/markdown/markdown-editor", () => ({ MarkdownEditor: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /> }));
const model: ItemTemplateDto = { id: "m1", backlogId: "b1", name: "Incident", itemType: "tache", kind: "bug", title: "Incident :", description: "## Impact", priority: 3, labelIds: ["l1"], missingLabelCount: 1, updatedAt: new Date() };
const props = { backlogId: "b1", templates: [model], labels: [{ id: "l1", name: "Sécurité", color: "#888888" }] };
describe("backlog template settings", () => {
  beforeEach(() => vi.clearAllMocks());
  it("lists missing labels and opens a populated editor", async () => {
    const user = userEvent.setup(); render(<ItemTemplatesAdmin {...props} />);
    expect(screen.getByText("1 label du modèle n’existe plus")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Modifier le modèle Incident" }));
    const dialog = screen.getByRole("dialog", { name: "Modifier le modèle" });
    expect(within(dialog).getByLabelText("Nom du modèle")).toHaveValue("Incident");
    expect(within(dialog).getByLabelText("Titre de départ")).toHaveValue("Incident :");
    expect(within(dialog).getByLabelText("Description du modèle")).toHaveValue("## Impact");
    expect(within(dialog).getByRole("checkbox", { name: "Sécurité" })).toBeChecked();
  });
  it("creates a model and updates the visible list", async () => {
    mocks.create.mockResolvedValue({ ok: true, template: { ...model, id: "m2", name: "Recette", missingLabelCount: 0 } });
    const user = userEvent.setup(); render(<ItemTemplatesAdmin {...props} />);
    await user.click(screen.getByRole("button", { name: "Nouveau modèle" }));
    await user.type(screen.getByLabelText("Nom du modèle"), "Recette");
    fireEvent.change(screen.getByLabelText("Description du modèle"), { target: { value: "## Critères" } });
    await user.click(screen.getByRole("button", { name: "Créer le modèle" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ backlogId: "b1", name: "Recette", description: "## Critères", itemType: null })));
    expect(await screen.findByText("Recette")).toBeInTheDocument();
  });
  it("retains the draft on a rejected save", async () => {
    mocks.update.mockResolvedValue({ ok: false, error: "Un modèle porte déjà ce nom dans ce backlog." });
    const user = userEvent.setup(); render(<ItemTemplatesAdmin {...props} />);
    await user.click(screen.getByRole("button", { name: "Modifier le modèle Incident" }));
    await user.clear(screen.getByLabelText("Nom du modèle")); await user.type(screen.getByLabelText("Nom du modèle"), "Recette");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Un modèle porte déjà ce nom");
    expect(screen.getByLabelText("Nom du modèle")).toHaveValue("Recette");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", name: "Recette", labelIds: ["l1"] }));
    expect(mocks.update.mock.calls[0]![0]).not.toHaveProperty("backlogId");
  });
  it("requires confirmation before deleting", async () => {
    mocks.remove.mockResolvedValue({ ok: true });
    const user = userEvent.setup(); render(<ItemTemplatesAdmin {...props} />);
    await user.click(screen.getByRole("button", { name: "Supprimer le modèle Incident" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByText("Incident")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Supprimer le modèle Incident" }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ id: "m1" }));
    expect(screen.queryByText("Incident")).not.toBeInTheDocument();
  });
});
