import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusActions } from "@/components/items/detail/status-actions";

const mocks = vi.hoisted(() => ({ updateItemAction: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/items", () => ({ updateItemAction: mocks.updateItemAction }));

const statuses = [
  { id: "todo", name: "À faire", color: "var(--status-todo)", order: 0 },
  { id: "doing", name: "En cours", color: "var(--status-doing)", order: 1 },
  { id: "done", name: "Terminé", color: "var(--status-done)", order: 2 },
];

function renderActions(statusId: string, canTransition = true) {
  return render(
    <StatusActions
      itemId="item-1"
      backlogKey="CASS"
      statusId={statusId}
      statuses={statuses}
      canTransition={canTransition}
    />,
  );
}

describe("StatusActions", () => {
  beforeEach(() => {
    mocks.updateItemAction.mockReset();
    mocks.updateItemAction.mockResolvedValue({ ok: true, item: {} });
  });

  it("moves the item to the next status of the workflow in one click", async () => {
    const user = userEvent.setup();
    renderActions("todo");
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveValue("todo");

    await user.click(screen.getByRole("button", { name: "Passer au statut En cours" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "CASS",
      statusId: "doing",
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Statut" })).toHaveValue("doing"),
    );
    expect(screen.getByRole("button", { name: "Passer au statut Terminé" })).toBeVisible();
  });

  it("changes the status from the menu", async () => {
    const user = userEvent.setup();
    renderActions("todo");
    await user.selectOptions(screen.getByRole("combobox", { name: "Statut" }), "done");
    expect(mocks.updateItemAction).toHaveBeenCalledWith(
      expect.objectContaining({ statusId: "done" }),
    );
  });

  it("hides the quick transition at the last status", () => {
    renderActions("done");
    expect(screen.queryByRole("button", { name: /Passer au statut/ })).not.toBeInTheDocument();
  });

  it("shows the status as text without the transition right", () => {
    renderActions("doing", false);
    expect(screen.getByText("En cours")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Statut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Passer au statut/ })).not.toBeInTheDocument();
  });

  it("rolls back and explains a refused transition", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: false, error: "Accès refusé." });
    renderActions("todo");
    await user.click(screen.getByRole("button", { name: "Passer au statut En cours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Accès refusé.");
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveValue("todo");
  });
});
