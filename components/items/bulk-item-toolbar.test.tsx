import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkItemToolbar } from "@/components/items/bulk-item-toolbar";

const mocks = vi.hoisted(() => ({
  bulkUpdateItemsAction: vi.fn(),
}));

vi.mock("@/app/actions/items", () => ({
  bulkUpdateItemsAction: mocks.bulkUpdateItemsAction,
}));

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
});
