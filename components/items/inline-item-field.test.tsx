import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InlineAssignee,
  InlineEstimate,
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

const statusIds = {
  todo: "11111111-1111-4111-8111-111111111111",
  doing: "22222222-2222-4222-8222-222222222222",
  review: "33333333-3333-4333-8333-333333333333",
  done: "44444444-4444-4444-8444-444444444444",
};

const statuses = [
  { id: statusIds.todo, name: "À faire", color: "#9aa0a6", category: "todo", order: 0 },
  { id: statusIds.doing, name: "En cours", color: "#d99a2b", category: "in_progress", order: 1 },
  { id: statusIds.review, name: "En revue", color: "#8b5cf6", category: "in_progress", order: 2 },
  { id: statusIds.done, name: "Terminé", color: "#3aa675", category: "done", order: 3 },
] as const;

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
        statusId={statusIds.todo}
        statuses={[...statuses]}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Statut.*À faire/i });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "En cours" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      statusId: statusIds.doing,
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
        statusId={statusIds.todo}
        statuses={[...statuses]}
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

  it("maps UUID status metadata to the four canonical accessible icons", async () => {
    const user = userEvent.setup();
    render(
      <InlineStatus
        itemId="item-1"
        backlogKey="DEMO"
        statusId={statusIds.review}
        statuses={[...statuses]}
      />,
    );

    expect(screen.getByRole("img", { name: "En revue" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Statut.*En revue/i }));
    for (const label of ["À faire", "En cours", "En revue", "Terminé"]) {
      expect(screen.getAllByRole("img", { name: label }).at(-1)).toBeVisible();
    }
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

  it("renders the current assignee without offering a non-candidate target", async () => {
    const user = userEvent.setup();
    render(
      <InlineAssignee
        itemId="item-3"
        backlogKey="DEMO"
        assigneeId="former-member"
        assigneeName="Ancienne membre"
        users={[{ id: "assignable", name: "Candidate assignable" }]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Assigné : Ancienne membre" }),
    );

    expect(screen.queryByRole("menuitem", { name: "Ancienne membre" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Candidate assignable" })).toBeVisible();
  });

  it("distinguishes an unestimated task from zero and sends a decimal estimate", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: {} });
    render(
      <InlineEstimate itemId="item-4" backlogKey="DEMO" estimatePoints={null} />,
    );

    await user.click(screen.getByRole("button", { name: "Estimation : Non estimé" }));
    const input = screen.getByRole("spinbutton", { name: "Points" });
    await user.clear(input);
    await user.type(input, "2.5");
    await user.click(screen.getByRole("button", { name: "Enregistrer l’estimation" }));

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-4",
      backlogKey: "DEMO",
      estimatePoints: 2.5,
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole("spinbutton", { name: "Points" })).not.toBeInTheDocument();
  });

  it("renders zero as an explicit estimate", () => {
    render(<InlineEstimate itemId="item-5" backlogKey="DEMO" estimatePoints={0} />);

    expect(screen.getByRole("button", { name: "Estimation : 0 pt" })).toBeVisible();
  });

  it("agrees the estimate unit in its visible text and accessible name", () => {
    const { rerender } = render(
      <InlineEstimate itemId="item-6" backlogKey="DEMO" estimatePoints={1} />,
    );
    expect(screen.getByRole("button", { name: "Estimation : 1 pt" })).toHaveTextContent(/^1 pt$/);

    rerender(<InlineEstimate itemId="item-6" backlogKey="DEMO" estimatePoints={5} />);
    expect(screen.getByRole("button", { name: "Estimation : 5 pts" })).toHaveTextContent(/^5 pts$/);

    rerender(<InlineEstimate itemId="item-6" backlogKey="DEMO" estimatePoints={2} readOnly />);
    expect(screen.getByText("2 pts")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("formats a decimal estimate with the French comma but keeps the input parseable", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <InlineEstimate itemId="item-7" backlogKey="DEMO" estimatePoints={1.5} />,
    );
    const trigger = screen.getByRole("button", { name: "Estimation : 1,5 pt" });
    expect(trigger).toHaveTextContent(/^1,5 pt$/);

    await user.click(trigger);
    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(1.5);
    await user.keyboard("{Escape}");

    rerender(<InlineEstimate itemId="item-7" backlogKey="DEMO" estimatePoints={2.5} readOnly />);
    expect(screen.getByText("2,5 pts")).toBeVisible();
  });
});

describe("InlineAssignee directory access", () => {
  it.each([false, true])("explains denied browsing rather than an empty directory (%s)", async (canBrowseUsers) => {
    const user = userEvent.setup();
    render(<InlineAssignee itemId="item-1" backlogKey="DEMO" assigneeId={null} users={[]} canBrowseUsers={canBrowseUsers} />);
    await user.click(screen.getByRole("button", { name: "Assigné : Non assigné" }));
    expect(screen.getByRole("menuitem", { name: "Non assigné" })).toBeEnabled();
    const hint = screen.queryByText(/Il vous manque la permission globale/);
    if (canBrowseUsers) expect(hint).not.toBeInTheDocument();
    else expect(hint).toBeVisible();
  });
});