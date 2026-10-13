import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineCreateItem } from "@/components/items/inline-create-item";

const mocks = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/items", () => ({
  createItemAction: mocks.createItemAction,
  softDeleteItemAction: vi.fn(),
}));

const epic = { id: "11111111-1111-4111-8111-111111111111", key: "DEMO-9", title: "Connexion" };
const statuses = [{ id: "22222222-2222-4222-8222-222222222222", name: "À faire" }];
const sprintId = "33333333-3333-4333-8333-333333333333";

function Harness() {
  const [parentId, setParentId] = useState(epic.id);
  return (
    <InlineCreateItem
      backlogId="44444444-4444-4444-8444-444444444444"
      backlogKey="DEMO"
      sprintId={sprintId}
      contextLabel="Sprint 2"
      parents={[epic]}
      parentId={parentId}
      onParentChange={setParentId}
      dialogProps={{
        items: [{ ...epic, type: "epic" }],
        statuses,
        canScheduleItems: true,
        releaseOptions: [],
      }}
    />
  );
}

function created(key: string) {
  return { ok: true, item: { id: `${key}-id`, key } };
}

async function openMoreOptions(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole("button", { name: "Créer un item dans Sprint 2" }));
  await user.type(screen.getByRole("textbox", { name: "Titre du nouvel item dans Sprint 2" }), title);
  await user.click(screen.getByRole("button", { name: "Plus d’options" }));
  return screen.findByRole("dialog", { name: "Nouvelle tâche — Sprint 2" });
}

describe("InlineCreateItem « Plus d’options »", () => {
  beforeEach(() => {
    mocks.createItemAction.mockReset();
    mocks.refresh.mockReset();
  });

  it("keeps the full dialog open for « Créer un autre » with the section context", async () => {
    const user = userEvent.setup();
    mocks.createItemAction
      .mockResolvedValueOnce(created("DEMO-10"))
      .mockResolvedValueOnce(created("DEMO-11"));
    render(<Harness />);

    const dialog = await openMoreOptions(user, "Première");
    const title = within(dialog).getByRole("textbox", { name: /Titre/ });
    expect(title).toHaveValue("Première");
    await user.click(within(dialog).getByRole("checkbox", { name: "Créer un autre" }));
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(mocks.createItemAction).toHaveBeenCalledTimes(1));
    expect(mocks.createItemAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Première", parentId: epic.id, sprintId, type: "tache" }),
    );
    await waitFor(() => expect(title).toHaveValue(""));
    expect(screen.getByRole("dialog", { name: "Nouvelle tâche — Sprint 2" })).toBeVisible();
    expect(within(dialog).getByRole("combobox", { name: /Parent/ })).toHaveTextContent(`${epic.key} — ${epic.title}`);

    await user.type(title, "Deuxième");
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(mocks.createItemAction).toHaveBeenCalledTimes(2));
    expect(mocks.createItemAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Deuxième", parentId: epic.id, sprintId }),
    );
  });

  it("closes the dialog and the inline form after a normal create, focusing the opener", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce(created("DEMO-10"));
    render(<Harness />);

    const dialog = await openMoreOptions(user, "Unique");
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.queryByRole("textbox", { name: "Titre du nouvel item dans Sprint 2" }))
      .not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Créer un item dans Sprint 2" })).toHaveFocus(),
    );
  });

  it("keeps the dialog and the inline draft on a server error", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({ ok: false, error: "Création impossible." });
    render(<Harness />);

    const dialog = await openMoreOptions(user, "Refusée");
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));

    expect(await within(dialog).findByText("Création impossible.")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: /Titre/ })).toHaveValue("Refusée");
    // The modal hides the page from the accessibility tree; the draft stays behind it.
    expect(
      screen.getByRole("textbox", { name: "Titre du nouvel item dans Sprint 2", hidden: true }),
    ).toHaveValue("Refusée");
  });

  it("returns to the inline draft when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openMoreOptions(user, "Brouillon");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Titre du nouvel item dans Sprint 2" }))
      .toHaveValue("Brouillon");
    expect(mocks.createItemAction).not.toHaveBeenCalled();
  });

  it("locks « Plus d’options » while an inline create is pending", async () => {
    const user = userEvent.setup();
    let settle: (value: unknown) => void = () => undefined;
    mocks.createItemAction.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Créer un item dans Sprint 2" }));
    const field = screen.getByRole("textbox", { name: "Titre du nouvel item dans Sprint 2" });
    await user.type(field, "Même titre{Enter}");

    const more = screen.getByRole("button", { name: "Plus d’options" });
    await waitFor(() => expect(more).toBeDisabled());
    expect(field).toHaveFocus();
    await user.click(more);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.createItemAction).toHaveBeenCalledTimes(1);

    settle(created("DEMO-10"));
    await waitFor(() => expect(more).toBeEnabled());
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(mocks.createItemAction).toHaveBeenCalledTimes(1);
  });
});

describe("InlineCreateItem without an Epic", () => {
  it("states the missing Epic with the hierarchy wording (JIR-92)", async () => {
    const user = userEvent.setup();
    render(
      <InlineCreateItem
        backlogId="44444444-4444-4444-8444-444444444444"
        backlogKey="DEMO"
        sprintId={null}
        contextLabel="Backlog"
        parents={[]}
        parentId=""
        onParentChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Créer un item dans Backlog" }));

    expect(
      screen.getByText("Aucune Epic dans ce backlog : une Tâche se rattache toujours à une Epic."),
    ).toBeVisible();
    expect(screen.queryByText(/Aucun epic disponible/)).not.toBeInTheDocument();
  });
});
