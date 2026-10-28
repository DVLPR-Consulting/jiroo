import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewItemButton } from "./new-item-dialog";
import type { ItemTemplateDto } from "@/lib/services/item-templates";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
  choices: [
    { id: "c1", key: "DEMO-1", type: "composant" as const, title: "Portail" },
    { id: "e1", key: "DEMO-2", type: "epic" as const, title: "Sécurité" },
  ],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/app/actions/items", () => ({ createItemAction: mocks.create }));
vi.mock("@/app/actions/item-choices", () => ({
  searchBacklogItemsAction: vi.fn(async ({ q = "", types }: { q?: string; types?: string[] }) => ({
    ok: true as const,
    items: mocks.choices.filter(
      (item) => (!types || types.includes(item.type)) && item.title.toLowerCase().includes(q.toLowerCase()),
    ),
    limit: 20,
  })),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/markdown/markdown-editor", () => ({ MarkdownEditor: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /> }));
const template: ItemTemplateDto = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", backlogId: "b1", name: "Incident de sécurité", itemType: "tache", kind: "bug", title: "Incident :", description: "## Impact\n\nÀ préciser", priority: 3, labelIds: ["l1"], missingLabelCount: 1, updatedAt: new Date() };
const props = { backlogId: "b1", backlogKey: "DEMO", templates: [template], statuses: [{ id: "s1", name: "À faire" }], structure: mocks.choices, fieldOptions: { labels: [{ id: "l1", name: "Sécurité", color: "#999" }] } };
async function choose(user: UserEvent, name: string | RegExp, value: string) {
  await user.click(screen.getByRole("combobox", { name })); await user.click(await screen.findByRole("option", { name: value }));
}
describe("shared backlog templates in item creation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.create.mockResolvedValue({ ok: true, item: { id: "i1", key: "DEMO-3" } }); });
  it("groups backlog choices after the fixed templates and fills editable fields", async () => {
    const user = userEvent.setup(); render(<NewItemButton {...props} />); await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await user.click(screen.getByRole("combobox", { name: "Modèle" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Aucun", "Rapport de bug", "User story", "Incident de sécurité"]);
    expect(within(screen.getByRole("group", { name: "Modèles du backlog" })).getByRole("option", { name: template.name })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: template.name }));
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Tâche");
    expect(screen.getByRole("combobox", { name: "Nature" })).toHaveTextContent("Bug");
    expect(screen.getByRole("combobox", { name: "Priorité" })).toHaveTextContent("Haute");
    expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue("Incident :");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(template.description);
    expect(screen.getByText("1 label du modèle n’existe plus")).toBeInTheDocument();
    await choose(user, /Parent/, "DEMO-2 — Sécurité");
    fireEvent.change(screen.getByRole("textbox", { name: /Titre/ }), { target: { value: "Incident validé" } });
    await user.click(screen.getByRole("button", { name: /^Créer$/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ type: "tache", parentId: "e1", kind: "bug", title: "Incident validé", description: template.description, priority: 3, labelIds: ["l1"] })));
  });
  it("resets template fields and the notice when Aucun is chosen", async () => {
    const user = userEvent.setup(); render(<NewItemButton {...props} />); await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    await choose(user, "Modèle", template.name); await choose(user, "Modèle", "Aucun");
    expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Composant");
    expect(screen.getByRole("combobox", { name: "Priorité" })).toHaveTextContent("Aucune");
    expect(screen.queryByText("1 label du modèle n’existe plus")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Labels" })).toHaveTextContent("Aucun");
  });
  it("preserves manually chosen fields when clearing a fixed template", async () => {
    const user = userEvent.setup(); render(<NewItemButton {...props} initialType="epic" initialParent={mocks.choices[0]} />);
    await user.click(screen.getByRole("button", { name: "Nouvel item" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Titre/ }), { target: { value: "My draft" } });
    await choose(user, "Priorité", "Haute"); await choose(user, "Modèle", "User story"); await choose(user, "Modèle", "Aucun");
    expect(screen.getByRole("textbox", { name: /Titre/ })).toHaveValue("My draft");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
    expect(screen.getByRole("combobox", { name: "Priorité" })).toHaveTextContent("Haute");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("");
  });
  it("keeps the selected type when the template has no predefined type", async () => {
    const user = userEvent.setup(); render(<NewItemButton {...props} templates={[{ ...template, itemType: null }]} initialType="epic" initialParent={mocks.choices[0]} />);
    await user.click(screen.getByRole("button", { name: "Nouvel item" })); await choose(user, "Modèle", template.name);
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Epic");
  });
  it("keeps sprint creation a task even when a template names another type", async () => {
    const user = userEvent.setup(); render(<NewItemButton {...props} templates={[{ ...template, itemType: "epic" }]} contextLabel="Sprint actif" sprintId="sp1" initialParent={mocks.choices[1]} />);
    await user.click(screen.getByRole("button", { name: "Nouvel item" })); await choose(user, "Modèle", template.name);
    expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Créer$/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ type: "tache", sprintId: "sp1", title: "Incident :" })));
  });
  it("ignores newly unavailable label IDs too and reports their count", async () => {
    const user = userEvent.setup(); render(<NewItemButton {...props} templates={[{ ...template, labelIds: ["l1", "gone"] }]} />);
    await user.click(screen.getByRole("button", { name: "Nouvel item" })); await choose(user, "Modèle", template.name);
    expect(screen.getByText("2 labels du modèle n’existent plus")).toBeInTheDocument();
  });
});
