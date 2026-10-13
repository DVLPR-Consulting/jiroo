import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkItemToolbar } from "@/components/items/bulk-item-toolbar";

const mocks = vi.hoisted(() => ({
  bulkUpdateItemsAction: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/actions/items", () => ({
  bulkUpdateItemsAction: mocks.bulkUpdateItemsAction,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess } }));

const backlogId = "11111111-1111-4111-8111-111111111111";
const firstId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";
const statusId = "44444444-4444-4444-8444-444444444444";

const statuses = [
  {
    id: statusId,
    name: "En cours",
    color: "#d99a2b",
    category: "in_progress" as const,
    order: 1,
  },
];

const users = [{ id: "marie", name: "Marie Lemaire" }];
const sprints = [
  { id: "55555555-5555-4555-8555-555555555555", name: "Sprint actif", state: "active" as const },
  { id: "66666666-6666-4666-8666-666666666666", name: "Sprint futur", state: "planned" as const },
];
const releaseOptions = [
  {
    id: "77777777-7777-4777-8777-777777777777",
    name: "2026.10",
    released: false,
    archived: false,
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    name: "2026.09",
    released: true,
    archived: false,
  },
];

function props() {
  return {
    backlogId,
    backlogKey: "DEMO",
    selectedItems: [
      { id: secondId, type: "tache" as const },
      { id: firstId, type: "tache" as const },
    ],
    statuses,
    users,
    sprints,
    onClearSelection: vi.fn(),
    onMutationSuccess: vi.fn(),
  };
}

describe("BulkItemToolbar", () => {
  beforeEach(() => {
    mocks.bulkUpdateItemsAction.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("announces the selection and clears it without sending a mutation", async () => {
    const user = userEvent.setup();
    const input = props();
    render(<BulkItemToolbar {...input} />);

    expect(screen.getByText("2 items sélectionnés")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Effacer la sélection" }));

    expect(input.onClearSelection).toHaveBeenCalledOnce();
    expect(mocks.bulkUpdateItemsAction).not.toHaveBeenCalled();
  });

  it("hides commands when backlog permissions exist without global bulk permission", () => {
    render(
      <BulkItemToolbar
        {...props()}
        canBulkChangeItems={false}
        canEditItems
        canTransitionItems
        canAssignItems
        canScheduleItems
      />,
    );

    expect(screen.queryByRole("button", { name: "Modifier le statut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier la priorité" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier l’assigné" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le sprint" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Estimation groupée" })).not.toBeInTheDocument();
  });

  it("hides commands when global bulk exists without a matching backlog permission", () => {
    render(
      <BulkItemToolbar
        {...props()}
        canBulkChangeItems
        canEditItems={false}
        canTransitionItems={false}
        canAssignItems={false}
        canScheduleItems={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Modifier le statut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier la priorité" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier l’assigné" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le sprint" })).not.toBeInTheDocument();
  });

  it("shows only a command backed by global bulk plus its exact backlog permission", () => {
    render(
      <BulkItemToolbar
        {...props()}
        canBulkChangeItems
        canEditItems={false}
        canTransitionItems
        canAssignItems={false}
        canScheduleItems={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Modifier le statut" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Modifier la priorité" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier l’assigné" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le sprint" })).not.toBeInTheDocument();
  });

  it("consumes already-composed bulk action capabilities", () => {
    render(
      <BulkItemToolbar
        {...props()}
        canBulkChangeItems={false}
        canEditItems={false}
        canTransitionItems={false}
        canAssignItems={false}
        canScheduleItems={false}
        capabilities={{ edit: false, transition: true, assign: false, schedule: false }}
      />,
    );

    expect(screen.getByRole("button", { name: "Modifier le statut" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Modifier la priorité" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier l’assigné" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le sprint" })).not.toBeInTheDocument();
  });

  it("sends exact status, priority and assignee patches with sorted ids", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdateItemsAction.mockResolvedValue({
      ok: true,
      changedCount: 2,
      unchangedCount: 0,
    });
    render(<BulkItemToolbar {...props()} />);

    await user.click(screen.getByRole("button", { name: "Modifier le statut" }));
    await user.click(screen.getByRole("menuitem", { name: "En cours" }));
    await waitFor(() => expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Modifier la priorité" }));
    await user.click(screen.getByRole("menuitem", { name: "Haute" }));
    await waitFor(() => expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: "Modifier l’assigné" }));
    await user.click(screen.getByRole("menuitem", { name: "Marie Lemaire" }));
    await waitFor(() => expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledTimes(3));

    expect(mocks.bulkUpdateItemsAction.mock.calls).toEqual([
      [{
        backlogKey: "DEMO",
        backlogId,
        itemIds: [firstId, secondId],
        patch: { field: "statusId", value: statusId },
      }],
      [{
        backlogKey: "DEMO",
        backlogId,
        itemIds: [firstId, secondId],
        patch: { field: "priority", value: 3 },
      }],
      [{
        backlogKey: "DEMO",
        backlogId,
        itemIds: [firstId, secondId],
        patch: { field: "assigneeId", value: "marie" },
      }],
    ]);
  });

  it("distinguishes zero from clearing an estimate", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdateItemsAction.mockResolvedValue({
      ok: true,
      changedCount: 2,
      unchangedCount: 0,
    });
    render(<BulkItemToolbar {...props()} />);

    const estimate = screen.getByRole("spinbutton", { name: "Estimation groupée" });
    await user.type(estimate, "0");
    await user.click(screen.getByRole("button", { name: "Appliquer l’estimation" }));
    await waitFor(() => expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Effacer les estimations" }));
    await waitFor(() => expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledTimes(2));

    expect(mocks.bulkUpdateItemsAction.mock.calls[0]?.[0].patch).toEqual({
      field: "estimatePoints",
      value: 0,
    });
    expect(mocks.bulkUpdateItemsAction.mock.calls[1]?.[0].patch).toEqual({
      field: "estimatePoints",
      value: null,
    });
  });

  it("applies a two-decimal estimate refused by float rounding before JIR-90", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdateItemsAction.mockResolvedValue({
      ok: true,
      changedCount: 2,
      unchangedCount: 0,
    });
    render(<BulkItemToolbar {...props()} />);

    await user.type(screen.getByRole("spinbutton", { name: "Estimation groupée" }), "0.29");
    const apply = screen.getByRole("button", { name: "Appliquer l’estimation" });
    expect(apply).toBeEnabled();
    await user.click(apply);
    await waitFor(() => expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledOnce());
    expect(mocks.bulkUpdateItemsAction.mock.calls[0]?.[0].patch).toEqual({
      field: "estimatePoints",
      value: 0.29,
    });
  });

  it("keeps the estimate button disabled for more than two decimals", async () => {
    const user = userEvent.setup();
    render(<BulkItemToolbar {...props()} />);

    await user.type(screen.getByRole("spinbutton", { name: "Estimation groupée" }), "1.234");
    expect(screen.getByRole("button", { name: "Appliquer l’estimation" })).toBeDisabled();
  });

  it("moves sorted selected tasks to Backlog, active, or planned sprints", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdateItemsAction.mockResolvedValue({
      ok: true,
      changedCount: 2,
      unchangedCount: 0,
    });
    render(<BulkItemToolbar {...props()} />);

    await user.click(screen.getByRole("button", { name: "Modifier le sprint" }));
    expect(screen.getByRole("menuitem", { name: "Backlog" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Sprint actif — Actif" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Sprint futur — Planifié" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "Sprint futur — Planifié" }));

    await waitFor(() => expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledWith({
      backlogKey: "DEMO",
      backlogId,
      itemIds: [firstId, secondId],
      patch: { field: "sprintId", value: sprints[1]!.id },
    }));
  });

  it("disables estimation when the selection contains a structural item", () => {
    const input = props();
    render(
      <BulkItemToolbar
        {...input}
        selectedItems={[
          input.selectedItems[0]!,
          { id: firstId, type: "epic" },
        ]}
      />,
    );

    expect(screen.getByRole("spinbutton", { name: "Estimation groupée" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Appliquer l’estimation" })).toBeDisabled();
    expect(
      screen.getByText("L’estimation groupée est réservée aux tâches."),
    ).toBeVisible();
  });

  it("agrees a zero changed count with the French singular", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdateItemsAction.mockResolvedValueOnce({ ok: true, changedCount: 0, unchangedCount: 2 });
    render(<BulkItemToolbar {...props()} />);

    await user.click(screen.getByRole("button", { name: "Modifier la priorité" }));
    await user.click(screen.getByRole("menuitem", { name: "Haute" }));

    expect(await screen.findByText("0 item modifié, 2 inchangés.")).toBeVisible();
  });

  it("disables every command while pending and announces the result", async () => {
    const user = userEvent.setup();
    let resolve!: (value: {
      ok: true;
      changedCount: number;
      unchangedCount: number;
    }) => void;
    mocks.bulkUpdateItemsAction.mockImplementationOnce(
      () => new Promise((done) => { resolve = done; }),
    );
    const input = props();
    render(<BulkItemToolbar {...input} />);

    await user.click(screen.getByRole("button", { name: "Modifier la priorité" }));
    await user.click(screen.getByRole("menuitem", { name: "Haute" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Modifier le statut" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Effacer la sélection" })).toBeDisabled();

    resolve({ ok: true, changedCount: 1, unchangedCount: 1 });
    expect(await screen.findByText("1 item modifié, 1 inchangé.")).toBeVisible();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("1 item modifié, 1 inchangé.");
    expect(input.onMutationSuccess).toHaveBeenCalledWith({
      changedCount: 1,
      unchangedCount: 1,
    });
  });

  it("keeps the selection and exposes a safe failure message", async () => {
    const user = userEvent.setup();
    const input = props();
    mocks.bulkUpdateItemsAction.mockResolvedValueOnce({
      ok: false,
      error: "Statut invalide pour ce backlog.",
    });
    render(<BulkItemToolbar {...input} />);

    await user.click(screen.getByRole("button", { name: "Modifier le statut" }));
    await user.click(screen.getByRole("menuitem", { name: "En cours" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Statut invalide pour ce backlog.",
    );
    expect(screen.getByText("2 items sélectionnés")).toBeVisible();
    expect(input.onClearSelection).not.toHaveBeenCalled();
  });

  it("gates Fix version commands only with the bulk release capability", () => {
    const { rerender } = render(
      <BulkItemToolbar
        {...props()}
        releaseOptions={releaseOptions}
        releaseCapabilities={{ manage: true, assignItems: true, bulkAssignItems: false }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Versions" })).not.toBeInTheDocument();

    rerender(
      <BulkItemToolbar
        {...props()}
        capabilities={{ edit: false, transition: false, assign: false, schedule: false }}
        releaseOptions={releaseOptions}
        releaseCapabilities={{ manage: false, assignItems: false, bulkAssignItems: true }}
      />,
    );

    expect(screen.getByRole("button", { name: "Versions" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Appliquer les versions" })).toBeVisible();
  });

  it("adds, replaces, and removes the selected Fix versions", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdateItemsAction.mockResolvedValue({
      ok: true,
      changedCount: 2,
      unchangedCount: 0,
    });
    render(
      <BulkItemToolbar
        {...props()}
        releaseOptions={releaseOptions}
        releaseCapabilities={{ manage: false, assignItems: false, bulkAssignItems: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Versions" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: releaseOptions[0]!.name }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: `${releaseOptions[1]!.name} — Publiée` }));
    await user.keyboard("{Escape}");

    let completedOperations = 0;
    for (const [label, mode, consequence] of [
      [
        "Ajouter aux versions",
        "add",
        "2026.10, 2026.09 seront ajoutées sans retirer les Fix versions existantes",
      ],
      [
        "Remplacer les versions",
        "replace",
        "Les Fix versions existantes seront remplacées par 2026.10, 2026.09",
      ],
      [
        "Retirer des versions",
        "remove",
        "2026.10, 2026.09 seront retirées. Les autres Fix versions seront conservées",
      ],
    ] as const) {
      await user.click(screen.getByRole("button", { name: "Appliquer les versions" }));
      await user.click(screen.getByRole("menuitem", { name: label }));
      expect(screen.getByRole("dialog", { name: "Confirmer la modification des Fix versions" }))
        .toHaveTextContent("2 items sélectionnés");
      expect(screen.getByRole("dialog")).toHaveTextContent(consequence);
      expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledTimes(completedOperations);
      await user.click(screen.getByRole("button", { name: "Appliquer à 2 items" }));
      await waitFor(() =>
        expect(mocks.bulkUpdateItemsAction).toHaveBeenLastCalledWith({
          backlogKey: "DEMO",
          backlogId,
          itemIds: [firstId, secondId],
          patch: {
            field: "fixVersionIds",
            mode,
            value: releaseOptions.map((release) => release.id),
          },
        }),
      );
      completedOperations += 1;
    }
  });

  it("agrees the Fix versions confirmation phrase with one or several selected items", async () => {
    const user = userEvent.setup();
    const input = props();
    const releaseCapabilities = { manage: false, assignItems: false, bulkAssignItems: true };
    const { unmount } = render(
      <BulkItemToolbar
        {...input}
        selectedItems={[input.selectedItems[0]!]}
        releaseOptions={releaseOptions}
        releaseCapabilities={releaseCapabilities}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Appliquer les versions" }));
    await user.click(screen.getByRole("menuitem", { name: "Effacer toutes les versions" }));
    expect(screen.getByRole("dialog", { name: "Confirmer la modification des Fix versions" }))
      .toHaveTextContent("Vérifiez cette opération avant de l’appliquer à l’item sélectionné.");
    unmount();

    render(<BulkItemToolbar {...props()} releaseOptions={releaseOptions} releaseCapabilities={releaseCapabilities} />);
    await user.click(screen.getByRole("button", { name: "Appliquer les versions" }));
    await user.click(screen.getByRole("menuitem", { name: "Effacer toutes les versions" }));
    expect(screen.getByRole("dialog", { name: "Confirmer la modification des Fix versions" }))
      .toHaveTextContent("Vérifiez cette opération avant de l’appliquer aux 2 items sélectionnés.");
  });

  it("disables empty add, replace and remove while exposing an explicit clear-all command", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdateItemsAction.mockResolvedValue({
      ok: true,
      changedCount: 2,
      unchangedCount: 0,
    });
    render(
      <BulkItemToolbar
        {...props()}
        releaseOptions={releaseOptions}
        releaseCapabilities={{ manage: false, assignItems: false, bulkAssignItems: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Appliquer les versions" }));
    expect(screen.getByRole("menuitem", { name: "Ajouter aux versions" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: "Remplacer les versions" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: "Retirer des versions" })).toHaveAttribute("data-disabled");
    await user.click(screen.getByRole("menuitem", { name: "Effacer toutes les versions" }));

    expect(screen.getByRole("dialog", { name: "Confirmer la modification des Fix versions" }))
      .toHaveTextContent("Toutes les Fix versions seront retirées");
    expect(mocks.bulkUpdateItemsAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Appliquer à 2 items" }));

    await waitFor(() =>
      expect(mocks.bulkUpdateItemsAction).toHaveBeenCalledWith({
        backlogKey: "DEMO",
        backlogId,
        itemIds: [firstId, secondId],
        patch: { field: "fixVersionIds", mode: "replace", value: [] },
      }),
    );
  });
});
