import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InlineAssignee,
  InlinePriority,
  InlineStatus,
} from "@/components/items/inline-item-field";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/app/actions/items", () => ({
  updateItemAction: mocks.updateItemAction,
}));

const statuses = [
  { id: "todo", name: "À faire", color: "--status-todo", category: "todo" },
  { id: "doing", name: "En cours", color: "--status-doing", category: "doing" },
];

const users = [
  { id: "marie", name: "Marie Lemaire" },
  { id: "nora", name: "Nora Benali" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("compact inline item editors", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("keeps status pessimistic while saving and refreshes after success", async () => {
    const user = userEvent.setup();
    const update = deferred<{ ok: true; item: object }>();
    mocks.updateItemAction.mockReturnValueOnce(update.promise);
    render(
      <InlineStatus
        itemId="item-1"
        backlogKey="DEMO"
        statusId="todo"
        statuses={statuses}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Statut.*À faire/i });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "En cours" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      statusId: "doing",
    });
    expect(trigger).toBeDisabled();
    expect(screen.getByRole("img", { name: "À faire" })).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();

    update.resolve({ ok: true, item: {} });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  it("shows the French status error inline and does not refresh on failure", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Mise à jour impossible.",
    });
    render(
      <InlineStatus
        itemId="item-1"
        backlogKey="DEMO"
        statusId="todo"
        statuses={statuses}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Statut.*À faire/i });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "En cours" }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Mise à jour impossible.");
    expect(trigger).toHaveAttribute("aria-describedby", error.id);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("sends the selected numeric priority", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    render(<InlinePriority itemId="item-2" backlogKey="DEMO" priority={1} />);

    await user.click(screen.getByRole("button", { name: /Priorité.*Basse/i }));
    await user.click(screen.getByRole("menuitem", { name: "Haute" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-2",
      backlogKey: "DEMO",
      priority: 3,
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  it("sends null when the assignee is cleared", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    render(
      <InlineAssignee
        itemId="item-3"
        backlogKey="DEMO"
        assigneeId="marie"
        users={users}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Assigné.*Marie Lemaire/i }));
    await user.click(screen.getByRole("menuitem", { name: "Non assigné" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-3",
      backlogKey: "DEMO",
      assigneeId: null,
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });
});
