import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReporterField } from "@/components/items/detail/field-editors";

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

const users = [
  { id: "better-auth-marie", name: "Marie Lemaire", email: "marie@example.test" },
  { id: "better-auth-nora", name: "Nora Benali", email: "nora@example.test" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ReporterField", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
  });

  it("sends the selected required reporter and stays pessimistic while saving", async () => {
    const user = userEvent.setup();
    const update = deferred<{ ok: true; item: object }>();
    mocks.updateItemAction.mockReturnValueOnce(update.promise);
    render(
      <ReporterField
        itemId="item-1"
        backlogKey="DEMO"
        reporterId="better-auth-marie"
        users={users}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Rapporteur" });
    expect(screen.queryByRole("option", { name: "Non assigné" })).not.toBeInTheDocument();

    await user.selectOptions(select, "better-auth-nora");

    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: "item-1",
      backlogKey: "DEMO",
      reporterId: "better-auth-nora",
    });
    expect(select).toBeDisabled();
    expect(select).toHaveValue("better-auth-marie");
    expect(mocks.refresh).not.toHaveBeenCalled();

    update.resolve({ ok: true, item: {} });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  it("shows the action error and does not refresh", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({
      ok: false,
      error: "Mise à jour impossible.",
    });
    render(
      <ReporterField
        itemId="item-1"
        backlogKey="DEMO"
        reporterId="better-auth-marie"
        users={users}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rapporteur" }),
      "better-auth-nora",
    );

    expect(await screen.findByText("Mise à jour impossible.")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
